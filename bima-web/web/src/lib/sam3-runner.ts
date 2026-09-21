import prisma from '@/lib/prisma';

const FASTAPI_SERVICE_URL = process.env.FASTAPI_SERVICE_URL || 'http://127.0.0.1:8000';
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'bima-research-internal-secret-2026';

const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 60 * 60 * 1000; // 1 hour

interface Sam3ClassInput {
  id: string;
  name: string;
  displayName: string;
  visualDescription: string;
  conditionCriteria: string;
  feasibilityCriteria: string;
  samPrompt: string | null;
  samColor: string | null;
}

const headers = {
  'Content-Type': 'application/json',
  'X-Internal-Secret': INTERNAL_API_SECRET,
};

async function markFailed(mediaId: string, message: string) {
  await prisma.mediaAsset
    .update({ where: { id: mediaId }, data: { status: 'failed', errorMessage: message } })
    .catch((e) => console.error('SAM3 markFailed error:', e));
}

/**
 * Runs the local SAM3 pipeline for one media asset. Videos take minutes, so the caller does not await
 * this: it starts an ai-service job, polls it, and stores the result on the MediaAsset when finished
 * (the surveyor UI already polls media in "processing" state).
 */
export async function runSam3Job(params: {
  mediaAsset: { id: string; sessionId: string; fileUrl: string; fileType: string; idempotencyKey: string | null };
  classes: Sam3ClassInput[];
  modelName: string;
  modelConfigId?: string | null;
  samMode?: string | null;
}): Promise<void> {
  const { mediaAsset, classes, modelName, modelConfigId, samMode } = params;
  try {
    const payload = {
      session_id: mediaAsset.sessionId,
      media_asset_id: mediaAsset.id,
      file_url: mediaAsset.fileUrl,
      file_type: mediaAsset.fileType,
      active_classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        display_name: c.displayName,
        visual_description: c.visualDescription,
        condition_criteria: c.conditionCriteria,
        feasibility_criteria: c.feasibilityCriteria,
        mutually_exclusive_with: [],
        sam_prompt: c.samPrompt,
        sam_color: c.samColor,
      })),
      ai_model_config: { provider: 'sam3', model_name: modelName, endpoint_url: null, api_key: null, sam_mode: samMode || null },
      idempotency_key: mediaAsset.idempotencyKey,
    };

    const createRes = await fetch(`${FASTAPI_SERVICE_URL}/api/v1/sam3/jobs`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!createRes.ok) {
      throw new Error(`Worker HTTP ${createRes.status}: ${await createRes.text()}`);
    }
    const { job_id: jobId } = await createRes.json();

    const deadline = Date.now() + MAX_WAIT_MS;
    let job: any = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const res = await fetch(`${FASTAPI_SERVICE_URL}/api/v1/sam3/jobs/${jobId}`, { headers });
      if (!res.ok) {
        throw new Error(`Worker HTTP ${res.status}: ${await res.text()}`);
      }
      job = await res.json();
      if (job.status === 'completed' || job.status === 'failed') break;
    }

    if (!job || job.status === 'queued' || job.status === 'running') {
      throw new Error('Pemrosesan SAM3 melebihi batas waktu.');
    }
    if (job.status === 'failed') {
      throw new Error(job.error || 'Pemrosesan SAM3 gagal.');
    }

    const result = job.result;
    const classRows = await prisma.classDefinition.findMany({
      where: { id: { in: classes.map((c) => c.id) } },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } },
    });
    const session = await prisma.surveySession.findUnique({
      where: { id: mediaAsset.sessionId },
      select: { locationGeojson: true },
    });

    await prisma.$transaction(async (tx) => {
      await tx.detection.deleteMany({ where: { mediaAssetId: mediaAsset.id } });
      await tx.mediaSegment.deleteMany({ where: { mediaAssetId: mediaAsset.id } });

      let firstSegmentId: string | null = null;
      for (const seg of result.segments || []) {
        const created = await tx.mediaSegment.create({
          data: {
            mediaAssetId: mediaAsset.id,
            segmentIndex: seg.segment_index,
            startTime: seg.start_time,
            endTime: seg.end_time,
            mediaUrl: seg.media_url || mediaAsset.fileUrl,
            status: seg.status,
            extractionMetadata: JSON.stringify(seg.extraction_metadata || {}),
          },
        });
        firstSegmentId = firstSegmentId ?? created.id;
      }

      // One Detection per instance (image) / per peak-frame instance (video), so the findings tab,
      // review flow and class filters work the same as for VLM results.
      const detectionRows = (result.detections || []).flatMap((det: any) => {
        const cls = classRows.find((c) => c.id === det.class_id || c.name === det.class_name);
        if (!cls) return [];
        return [
          {
            sessionId: mediaAsset.sessionId,
            mediaAssetId: mediaAsset.id,
            mediaSegmentId: firstSegmentId,
            classId: cls.id,
            classVersionId: cls.versions[0]?.id || null,
            className: det.class_name,
            bbox: JSON.stringify(det.bbox),
            condition: det.condition,
            feasibility: det.feasibility,
            timestampSeconds: det.timestamp_seconds,
            frameIndex: det.frame_index,
            locationGeojson: session?.locationGeojson ?? null,
            modelConfigId: modelConfigId || null,
            modelName,
            promptVersion: 'sam3',
            hasConflict: false,
            conflictResolved: false,
            conflictDetails: '{}',
            isDeleted: false,
          },
        ];
      });
      if (detectionRows.length > 0) {
        await tx.detection.createMany({ data: detectionRows });
      }

      await tx.mediaAsset.update({
        where: { id: mediaAsset.id },
        data: { status: 'completed', errorMessage: null },
      });
    });
  } catch (err: any) {
    console.error('SAM3 job error:', err);
    await markFailed(mediaAsset.id, `SAM3 Error: ${err.message}`);
  }
}
