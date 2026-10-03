import prisma from '@/lib/prisma';
import { requireEnv, requireEnvNumber } from '@/lib/env';
import { localPathForUrl, storageBackend } from '@/lib/media-storage';
import { linkTracksToDetections, type PlaybackData, type PlaybackPoint } from '@/lib/playback-tracks';

/** Laju deteksi rapat yang berlaku: dibatasi jumlah frame maksimum; null bila di bawah laju minimum (video terlalu panjang). */
export function effectivePlaybackFps(durationSeconds: number, cfg: { fps: number; maxFrames: number; minFps: number }): number | null {
  if (durationSeconds <= 0) return cfg.fps;
  const fps = Math.min(cfg.fps, cfg.maxFrames / durationSeconds);
  return fps >= cfg.minFps ? fps : null;
}

/** Dengan backend lokal, ai-service membaca video langsung dari disk (satu mesin), bukan lewat HTTP. */
function videoUrlForWorker(fileUrl: string): string {
  if (storageBackend() === 'local') {
    const local = localPathForUrl(fileUrl);
    if (local) return local;
  }
  return fileUrl;
}

async function save(mediaAssetId: string, data: { status: string; note?: string | null; data?: string | null; metrics?: string | null }) {
  const row = { status: data.status, note: data.note ?? null, data: data.data ?? null, metrics: data.metrics ?? null };
  await prisma.mediaPlayback.upsert({ where: { mediaAssetId }, create: { mediaAssetId, ...row }, update: row });
}

/**
 * Membuat lintasan kotak untuk pemutar video: deteksi rapat pada video 720p (ai-service), digabung per objek, lalu
 * ditautkan ke temuan resmi. Tidak mengubah temuan. Dijalankan di latar belakang setelah deteksi YOLO selesai,
 * atau atas permintaan untuk video lama; kegagalan hanya menandai status playback, bukan media.
 */
export async function runPlaybackJob(mediaAssetId: string): Promise<void> {
  const t0 = Date.now();
  try {
    const media = await prisma.mediaAsset.findUnique({
      where: { id: mediaAssetId },
      include: { frames: { orderBy: { frameIndex: 'asc' } } },
    });
    if (!media) throw new Error('Media tidak ditemukan.');
    if (media.fileType !== 'video') throw new Error('Kotak pemutar hanya untuk video.');

    await save(mediaAssetId, { status: 'processing' });

    const cfg = {
      fps: requireEnvNumber('PLAYBACK_FPS'),
      maxFrames: requireEnvNumber('PLAYBACK_MAX_FRAMES'),
      minFps: requireEnvNumber('PLAYBACK_MIN_FPS'),
    };
    const fps = effectivePlaybackFps(media.durationSeconds ?? 0, cfg);
    if (fps === null) {
      await save(mediaAssetId, {
        status: 'skipped',
        note: `Video terlalu panjang untuk kotak halus (${Math.round(media.durationSeconds ?? 0)} dtk): butuh minimal ${cfg.minFps} fps dengan batas ${cfg.maxFrames} frame.`,
      });
      return;
    }
    const maxMissed = requireEnvNumber('PLAYBACK_MAX_MISSED');

    const res = await fetch(`${requireEnv('FASTAPI_SERVICE_URL')}/api/v1/yolo/playback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': requireEnv('INTERNAL_API_SECRET') },
      body: JSON.stringify({
        media_asset_id: media.id,
        video_url: videoUrlForWorker(media.fileUrl),
        fps,
        sample_timestamps: media.frames.map((f) => f.timestampSeconds),
        iou_min: requireEnvNumber('PLAYBACK_IOU_MIN'),
        max_missed: maxMissed,
      }),
      signal: AbortSignal.timeout(requireEnvNumber('PLAYBACK_REQUEST_TIMEOUT_MS')),
    });
    if (!res.ok) throw new Error(`Worker HTTP ${res.status}: ${await res.text()}`);
    const result = await res.json();
    if (!result.success) throw new Error(result.error_message || 'Deteksi rapat gagal.');

    const classes = await prisma.classDefinition.findMany({ where: { isActive: true, modelClass: { not: null } }, select: { id: true, name: true, modelClass: true } });
    const byModelClass = new Map(classes.map((c) => [c.modelClass as string, c] as const));
    const tracks = (result.tracks as { track_id: number; model_class: string; points: number[][] }[]).flatMap((t) => {
      const cls = byModelClass.get(t.model_class);
      return cls ? [{ id: t.track_id, classId: cls.id, className: cls.name, points: t.points as PlaybackPoint[] }] : [];
    });

    const detections = await prisma.detection.findMany({
      where: { mediaAssetId, isDeleted: false },
      select: { id: true, classId: true, className: true, timestampSeconds: true, bbox: true, confidence: true },
    });
    const step = 1 / fps;
    const linked = linkTracksToDetections(tracks, detections, {
      timeTolerance: requireEnvNumber('PLAYBACK_LINK_TIME_TOLERANCE'),
      iouMin: requireEnvNumber('PLAYBACK_LINK_IOU_MIN'),
    });
    const data: PlaybackData = { version: 1, step, maxGap: step * (maxMissed + 1) + 0.01, tracks: linked };

    await save(mediaAssetId, {
      status: 'ready',
      data: JSON.stringify(data),
      metrics: JSON.stringify({ ...result.metrics, fps, linkedTracks: linked.filter((t) => t.detectionIds.length > 0).length, totalMs: Date.now() - t0 }),
    });
  } catch (err: any) {
    console.error('Playback job error:', err);
    await save(mediaAssetId, { status: 'failed', note: `Kotak pemutar gagal dibuat: ${err.message}` }).catch((e) => console.error('Playback save error:', e));
  }
}
