import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { videoTooLongMessage } from './media-limits';
import { requireEnv, requireEnvNumber, requirePublicEnv } from './env';

// ffmpeg needs libx264 and libwebp (the anaconda build lacks libx264). Paths come from the environment only.
const ffmpegPath = () => requireEnv('FFMPEG_PATH');
const ffprobePath = () => requireEnv('FFPROBE_PATH');

/** Thrown when a file breaks a configured media limit; the upload route turns it into HTTP 400. */
export class MediaLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaLimitError';
  }
}

const BUCKETS = { image: 'img', video: 'vids' } as const;
export type MediaKind = keyof typeof BUCKETS;

const PUBLIC_PATH_MARKER = '/storage/v1/object/public/';

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  // Containers can reach Supabase over the private Docker network while saved object URLs
  // must remain reachable by users' browsers over the public (Tailscale) endpoint.
  const url = process.env.SUPABASE_INTERNAL_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi.');
  }
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

function runFfmpeg(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Kompresi media melebihi batas waktu.'));
    }, timeoutMs);
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ffmpeg tidak bisa dijalankan (${ffmpegPath()}): ${err.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg gagal (exit ${code}): ${stderr.trim().slice(-400)}`));
    });
  });
}

/** Reads the real duration (seconds) with ffprobe; null when it cannot be determined. */
function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath(), [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
    ]);
    let stdout = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Pembacaan durasi video melebihi batas waktu.'));
    }, requireEnvNumber('FFPROBE_TIMEOUT_MS'));
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`ffprobe tidak bisa dijalankan (${ffprobePath()}): ${err.message}`));
    });
    proc.on('close', () => {
      clearTimeout(timer);
      const value = parseFloat(stdout.trim());
      resolve(Number.isFinite(value) && value > 0 ? value : null);
    });
  });
}

// Longest image side is capped (MEDIA_IMAGE_MAX_SIDE), only ever downscaled.
const imageScale = () => {
  const side = requireEnvNumber('MEDIA_IMAGE_MAX_SIDE');
  return `scale='min(${side},iw)':'min(${side},ih)':force_original_aspect_ratio=decrease`;
};
// Video height is capped (MEDIA_VIDEO_MAX_HEIGHT), only ever downscaled; width auto and kept even for H.264.
const videoScale = () => `scale=-2:'min(${requireEnvNumber('MEDIA_VIDEO_MAX_HEIGHT')},ih)'`;

/** Compress raw media with ffmpeg: images -> WebP, videos -> H.264 (no audio). */
export async function compressMedia(
  input: Buffer,
  kind: MediaKind,
  maxVideoDurationSeconds: number
): Promise<{ buffer: Buffer; contentType: string; ext: string; durationSeconds: number | null }> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bima-media-'));
  const inPath = path.join(workDir, 'input');
  const ext = kind === 'image' ? 'webp' : 'mp4';
  const outPath = path.join(workDir, `output.${ext}`);

  try {
    await fs.writeFile(inPath, input);

    let durationSeconds: number | null = null;
    const probedDurationSeconds = await probeDurationSeconds(inPath);
    if (kind === 'video') {
      // Enforced here (not trusted from the client) and before the expensive re-encode.
      durationSeconds = probedDurationSeconds;
      if (durationSeconds === null || durationSeconds > maxVideoDurationSeconds) {
        throw new MediaLimitError(videoTooLongMessage(durationSeconds, maxVideoDurationSeconds));
      }
    } else if (probedDurationSeconds !== null && probedDurationSeconds > maxVideoDurationSeconds) {
      // Do not let a long video bypass the limit by claiming an image MIME type and filename.
      throw new MediaLimitError(videoTooLongMessage(probedDurationSeconds, maxVideoDurationSeconds));
    }

    if (kind === 'image') {
      await runFfmpeg(
        ['-i', inPath, '-frames:v', '1', '-vf', imageScale(), '-c:v', 'libwebp', '-quality', String(requireEnvNumber('MEDIA_IMAGE_QUALITY')), '-compression_level', '6', outPath],
        requireEnvNumber('FFMPEG_IMAGE_TIMEOUT_MS')
      );
    } else {
      await runFfmpeg(
        [
          '-i', inPath,
          '-vf', videoScale(),
          '-c:v', 'libx264', '-preset', 'slow', '-crf', String(requireEnvNumber('MEDIA_VIDEO_CRF')),
          '-pix_fmt', 'yuv420p',
          '-an',
          '-movflags', '+faststart',
          outPath,
        ],
        requireEnvNumber('FFMPEG_VIDEO_TIMEOUT_MS')
      );
    }

    const buffer = await fs.readFile(outPath);
    return { buffer, contentType: kind === 'image' ? 'image/webp' : 'video/mp4', ext, durationSeconds };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

/** Compress the media, upload it to the Supabase bucket (img / vids) and return its public URL. */
export async function compressAndUpload(params: {
  input: Buffer;
  kind: MediaKind;
  sessionId: string;
  maxVideoDurationSeconds: number;
}): Promise<{
  fileUrl: string;
  storagePath: string;
  originalBytes: number;
  storedBytes: number;
  durationSeconds: number | null;
}> {
  const { input, kind, sessionId, maxVideoDurationSeconds } = params;
  const { buffer, contentType, ext, durationSeconds } = await compressMedia(input, kind, maxVideoDurationSeconds);

  const storagePath = `sessions/${sessionId}/${crypto.randomUUID()}.${ext}`;
  const bucket = BUCKETS[kind];
  const supabase = getAdminClient();

  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`Gagal upload ke bucket "${bucket}": ${error.message}`);

  const publicBaseUrl = requirePublicEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ).replace(/\/+$/, '');
  const publicStoragePath = storagePath.split('/').map(encodeURIComponent).join('/');
  return {
    fileUrl: `${publicBaseUrl}/storage/v1/object/public/${bucket}/${publicStoragePath}`,
    storagePath,
    originalBytes: input.length,
    storedBytes: buffer.length,
    durationSeconds,
  };
}

/** Best-effort removal of a stored file; ignores files that are not in Supabase Storage (legacy local uploads). */
export async function removeStoredFile(fileUrl: string): Promise<void> {
  const idx = fileUrl.indexOf(PUBLIC_PATH_MARKER);
  if (idx === -1) return;
  const [bucket, ...rest] = fileUrl.slice(idx + PUBLIC_PATH_MARKER.length).split('/');
  if (!bucket || rest.length === 0) return;
  const { error } = await getAdminClient().storage.from(bucket).remove([decodeURIComponent(rest.join('/'))]);
  if (error) console.error(`Gagal menghapus file dari bucket "${bucket}":`, error.message);
}
