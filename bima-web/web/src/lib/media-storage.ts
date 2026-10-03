import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getMaxVideoSeconds, videoTooLongMessage } from './media-limits';
import { requireEnv, requireEnvNumber } from './env';
import { planFrameTimestamps } from './frame-plan';

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

/** Thrown when ffmpeg/ffprobe cannot be started (wrong FFMPEG_PATH/FFPROBE_PATH); shown to the user as-is. */
export class MediaToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaToolError';
  }
}

const BUCKETS = { image: 'img', video: 'vids' } as const;
export type MediaKind = keyof typeof BUCKETS;

const PUBLIC_PATH_MARKER = '/storage/v1/object/public/';

/**
 * Backend penyimpanan: "supabase" (bawaan, bila STORAGE_BACKEND kosong) atau "local" (folder LOCAL_STORAGE_DIR,
 * dilayani lewat /api/files/...). Backend lokal ditujukan untuk purwarupa/demo tanpa Supabase.
 */
export function storageBackend(): 'supabase' | 'local' {
  const v = (process.env.STORAGE_BACKEND ?? '').trim().toLowerCase();
  if (v === '' || v === 'supabase') return 'supabase';
  if (v === 'local') return 'local';
  throw new Error(`STORAGE_BACKEND harus "supabase" atau "local", bukan "${v}".`);
}

export const LOCAL_URL_PREFIX = '/api/files/';
const localDir = () => path.resolve(requireEnv('LOCAL_STORAGE_DIR'));

/** Path berkas lokal untuk URL "/api/files/<bucket>/<path>"; null bila bukan URL lokal atau mencoba keluar dari folder. */
export function localPathForUrl(fileUrl: string): string | null {
  if (!fileUrl.startsWith(LOCAL_URL_PREFIX)) return null;
  const rel = decodeURIComponent(fileUrl.slice(LOCAL_URL_PREFIX.length));
  const full = path.resolve(localDir(), rel);
  return full.startsWith(localDir() + path.sep) ? full : null;
}

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
      reject(new MediaToolError(`ffmpeg tidak bisa dijalankan (${ffmpegPath()}). Periksa FFMPEG_PATH di web/.env: harus menunjuk ke file ffmpeg yang benar (atau cukup "ffmpeg" bila sudah ada di PATH), lalu restart server. Detail: ${err.message}`));
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
      reject(new MediaToolError(`ffprobe tidak bisa dijalankan (${ffprobePath()}). Periksa FFPROBE_PATH di web/.env (atau cukup "ffprobe" bila sudah ada di PATH), lalu restart server. Detail: ${err.message}`));
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
  kind: MediaKind
): Promise<{ buffer: Buffer; contentType: string; ext: string; durationSeconds: number | null; frames: ExtractedFrame[]; frameExtractMs: number }> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bima-media-'));
  const inPath = path.join(workDir, 'input');
  const ext = kind === 'image' ? 'webp' : 'mp4';
  const outPath = path.join(workDir, `output.${ext}`);

  try {
    await fs.writeFile(inPath, input);

    let durationSeconds: number | null = null;
    if (kind === 'video') {
      // Enforced here (not trusted from the client) and before the expensive re-encode.
      durationSeconds = await probeDurationSeconds(inPath);
      if (durationSeconds === null || durationSeconds > getMaxVideoSeconds()) {
        throw new MediaLimitError(videoTooLongMessage(durationSeconds));
      }
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

    // Frame sampel diambil dari berkas asli (sebelum/terlepas dari kompresi di atas).
    let frames: ExtractedFrame[] = [];
    let frameExtractMs = 0;
    if (kind === 'video' && durationSeconds !== null) {
      const t0 = Date.now();
      frames = await extractFrames(inPath, durationSeconds, workDir);
      frameExtractMs = Date.now() - t0;
    }

    const buffer = await fs.readFile(outPath);
    return { buffer, contentType: kind === 'image' ? 'image/webp' : 'video/mp4', ext, durationSeconds, frames, frameExtractMs };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

/** Menyimpan satu objek ke backend aktif dan mengembalikan URL yang dapat dibuka klien. */
async function putObject(bucket: string, storagePath: string, buffer: Buffer, contentType: string): Promise<string> {
  if (storageBackend() === 'local') {
    const full = path.join(localDir(), bucket, storagePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return `${LOCAL_URL_PREFIX}${bucket}/${storagePath}`;
  }
  const supabase = getAdminClient();
  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`Gagal upload ke bucket "${bucket}": ${error.message}`);
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

export interface ExtractedFrame {
  frameIndex: number;
  timestampSeconds: number;
  buffer: Buffer;
}

/**
 * Mengekstrak frame sampel dari berkas ASLI (bukan hasil kompresi 720p), memakai seek per timestamp agar
 * waktu tidak membesar untuk video panjang. Beberapa proses ffmpeg berjalan paralel.
 */
export async function extractFrames(inPath: string, durationSeconds: number, workDir: string): Promise<ExtractedFrame[]> {
  const timestamps = planFrameTimestamps(durationSeconds);
  const width = requireEnvNumber('FRAME_MAX_WIDTH');
  const quality = requireEnvNumber('FRAME_JPEG_QUALITY');
  const concurrency = Math.max(1, requireEnvNumber('FRAME_EXTRACT_CONCURRENCY'));
  const timeout = requireEnvNumber('FFMPEG_IMAGE_TIMEOUT_MS');
  const frames: ExtractedFrame[] = new Array(timestamps.length);
  let next = 0;

  async function worker() {
    while (next < timestamps.length) {
      const i = next++;
      const out = path.join(workDir, `frame_${i}.jpg`);
      await runFfmpeg(
        ['-ss', String(timestamps[i]), '-i', inPath, '-frames:v', '1', '-vf', `scale='min(${width},iw)':-2`, '-q:v', String(quality), out],
        timeout
      );
      frames[i] = { frameIndex: i, timestampSeconds: timestamps[i], buffer: await fs.readFile(out) };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, timestamps.length) }, worker));
  return frames;
}

/** Compress the media, upload it to the Supabase bucket (img / vids) and return its public URL. */
export async function compressAndUpload(params: {
  input: Buffer;
  kind: MediaKind;
  sessionId: string;
  mediaId: string;
}): Promise<{
  fileUrl: string;
  storagePath: string;
  originalBytes: number;
  storedBytes: number;
  durationSeconds: number | null;
  frames: { frameIndex: number; timestampSeconds: number; imageUrl: string }[];
  timings: { compressAndExtractMs: number; frameExtractMs: number; uploadMs: number };
}> {
  const { input, kind, sessionId, mediaId } = params;
  const t0 = Date.now();
  const { buffer, contentType, ext, durationSeconds, frames, frameExtractMs } = await compressMedia(input, kind);
  const compressAndExtractMs = Date.now() - t0;

  const t1 = Date.now();
  const storagePath = `sessions/${sessionId}/${crypto.randomUUID()}.${ext}`;
  const fileUrl = await putObject(BUCKETS[kind], storagePath, buffer, contentType);

  // Frame galeri (video) disimpan sebagai JPEG di bucket gambar. Untuk gambar, file itu sendiri adalah satu-satunya frame.
  const storedFrames: { frameIndex: number; timestampSeconds: number; imageUrl: string }[] = [];
  for (const f of frames) {
    const framePath = `sessions/${sessionId}/frames/${mediaId}/f_${String(f.frameIndex).padStart(2, '0')}.jpg`;
    const imageUrl = await putObject(BUCKETS.image, framePath, f.buffer, 'image/jpeg');
    storedFrames.push({ frameIndex: f.frameIndex, timestampSeconds: f.timestampSeconds, imageUrl });
  }

  return {
    fileUrl,
    storagePath,
    originalBytes: input.length,
    storedBytes: buffer.length,
    durationSeconds,
    frames: storedFrames,
    timings: { compressAndExtractMs, frameExtractMs, uploadMs: Date.now() - t1 },
  };
}

/** Best-effort removal of a stored file; ignores files that are not in Supabase Storage (legacy local uploads). */
export async function removeStoredFile(fileUrl: string): Promise<void> {
  const local = localPathForUrl(fileUrl);
  if (local) {
    await fs.rm(local, { force: true });
    return;
  }
  const idx = fileUrl.indexOf(PUBLIC_PATH_MARKER);
  if (idx === -1) return;
  const [bucket, ...rest] = fileUrl.slice(idx + PUBLIC_PATH_MARKER.length).split('/');
  if (!bucket || rest.length === 0) return;
  const { error } = await getAdminClient().storage.from(bucket).remove([decodeURIComponent(rest.join('/'))]);
  if (error) console.error(`Gagal menghapus file dari bucket "${bucket}":`, error.message);
}
