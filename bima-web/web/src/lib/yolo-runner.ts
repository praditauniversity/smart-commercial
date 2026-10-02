import prisma from '@/lib/prisma';
import { requireEnv, requireEnvNumber } from '@/lib/env';
import { assessWithProfile } from '@/lib/risk';
import { localPathForUrl, storageBackend } from '@/lib/media-storage';

async function markFailed(mediaId: string, message: string) {
  await prisma.mediaAsset
    .update({ where: { id: mediaId }, data: { status: 'failed', errorMessage: message } })
    .catch((e) => console.error('YOLO markFailed error:', e));
}

function parseIdList(raw: string | null | undefined): string[] {
  try {
    const value = JSON.parse(raw || '[]');
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

/** Dengan backend lokal, ai-service membaca frame langsung dari disk (satu mesin), bukan lewat HTTP. */
function frameUrlForWorker(imageUrl: string): string {
  if (storageBackend() === 'local') {
    const local = localPathForUrl(imageUrl);
    if (local) return local;
  }
  return imageUrl;
}

/**
 * Menjalankan deteksi YOLO untuk satu media: mengirim frame tersimpan (gambar = 1 frame, video = frame sampel
 * dari berkas asli) ke ai-service, lalu menyimpan temuan beserta skor risiko (Severity x Exposure).
 * Tidak di-await oleh pemanggil; UI membaca status "processing" lewat polling seperti jalur SAM3.
 */
export async function runYoloJob(params: {
  mediaAssetId: string;
  modelName: string;
  modelConfigId?: string | null;
}): Promise<void> {
  const { mediaAssetId, modelName, modelConfigId } = params;
  const tStart = Date.now();
  try {
    const FASTAPI_SERVICE_URL = requireEnv('FASTAPI_SERVICE_URL');
    const media = await prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      include: { frames: { orderBy: { frameIndex: 'asc' } }, session: { include: { zone: true } } },
    });
    if (!media) throw new Error('Media tidak ditemukan.');
    if (media.frames.length === 0) {
      throw new Error('Media belum memiliki frame sampel. Unggah ulang media ini.');
    }

    const classes = await prisma.classDefinition.findMany({
      where: { isActive: true, modelClass: { not: null } },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    if (classes.length === 0) {
      throw new Error('Tidak ada kelas aktif dengan "modelClass" (jalankan npm run seed:risk).');
    }

    const payload = {
      session_id: media.sessionId,
      media_asset_id: media.id,
      frames: media.frames.map((f) => ({
        frame_index: f.frameIndex,
        timestamp_seconds: f.timestampSeconds,
        url: frameUrlForWorker(f.imageUrl),
      })),
      active_classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        display_name: c.displayName,
        visual_description: c.visualDescription,
        condition_criteria: c.conditionCriteria,
        feasibility_criteria: c.feasibilityCriteria,
        mutually_exclusive_with: parseIdList(c.mutuallyExclusiveWith),
        conflict_iou_threshold: c.conflictIouThreshold,
        model_class: c.modelClass,
      })),
      conflict_threshold: requireEnvNumber('DEFAULT_CONFLICT_IOU_THRESHOLD'),
    };

    const res = await fetch(`${FASTAPI_SERVICE_URL}/api/v1/yolo/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': requireEnv('INTERNAL_API_SECRET') },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(requireEnvNumber('YOLO_REQUEST_TIMEOUT_MS')),
    });
    if (!res.ok) throw new Error(`Worker HTTP ${res.status}: ${await res.text()}`);
    const result = await res.json();
    if (!result.success) throw new Error(result.error_message || 'Deteksi YOLO gagal.');

    const exposure = media.session.zone?.exposure ?? null;
    const tPersist = Date.now();

    await prisma.$transaction(async (tx) => {
      await tx.detection.deleteMany({ where: { mediaAssetId: media.id } });
      await tx.mediaSegment.deleteMany({ where: { mediaAssetId: media.id } });

      const segment = await tx.mediaSegment.create({
        data: {
          mediaAssetId: media.id,
          segmentIndex: 0,
          startTime: 0,
          endTime: media.durationSeconds ?? 0,
          mediaUrl: media.fileUrl,
          status: 'completed',
          extractionMetadata: JSON.stringify({ type: 'yolo_frames', frames: media.frames.length }),
        },
      });

      const rows = (result.detections || []).flatMap((det: any) => {
        const cls = classes.find((c) => c.id === det.class_id);
        if (!cls) return [];
        const risk = assessWithProfile(cls, exposure);
        return [
          {
            sessionId: media.sessionId,
            mediaAssetId: media.id,
            mediaSegmentId: segment.id,
            classId: cls.id,
            classVersionId: cls.versions[0]?.id || null,
            className: cls.name,
            bbox: JSON.stringify(det.bbox),
            condition: det.condition,
            feasibility: det.feasibility,
            confidence: det.confidence ?? null,
            timestampSeconds: det.timestamp_seconds,
            frameIndex: det.frame_index,
            locationGeojson: media.session.locationGeojson ?? null,
            modelConfigId: modelConfigId || null,
            modelName,
            promptVersion: 'yolo',
            severity: risk.scored ? risk.severity : null,
            exposure: risk.scored ? risk.exposure : null,
            riskScore: risk.scored ? risk.score : null,
            priorityBand: risk.scored ? risk.band : null,
            hasConflict: Boolean(det.has_conflict),
            conflictResolved: false,
            conflictDetails: JSON.stringify(det.conflict_details || {}),
            isDeleted: false,
          },
        ];
      });
      if (rows.length > 0) await tx.detection.createMany({ data: rows });

      const previous = (() => {
        try {
          return JSON.parse(media.processingMetrics || '{}');
        } catch {
          return {};
        }
      })();
      await tx.mediaAsset.update({
        where: { id: media.id },
        data: {
          status: 'completed',
          errorMessage: null,
          processingMetrics: JSON.stringify({
            ...previous,
            yolo: result.metrics,
            persistMs: Date.now() - tPersist,
            processTotalMs: Date.now() - tStart,
            exposureAtProcessing: exposure,
          }),
        },
      });
    });
  } catch (err: any) {
    console.error('YOLO job error:', err);
    await markFailed(mediaAssetId, `YOLO Error: ${err.message}`);
  }
}
