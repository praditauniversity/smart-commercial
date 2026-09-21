import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// System ffmpeg (has libx264/libwebp). The anaconda build lacks libx264.
const FFMPEG_PATH = process.env.FFMPEG_PATH || '/usr/bin/ffmpeg';

const BUCKETS = { image: 'img', video: 'vids' } as const;
export type MediaKind = keyof typeof BUCKETS;

const PUBLIC_PATH_MARKER = '/storage/v1/object/public/';

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
    const proc = spawn(FFMPEG_PATH, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
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
      reject(new Error(`ffmpeg tidak bisa dijalankan (${FFMPEG_PATH}): ${err.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg gagal (exit ${code}): ${stderr.trim().slice(-400)}`));
    });
  });
}

// Longest side capped at 1280px, only ever downscaled.
const IMAGE_SCALE = "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease";
// Height capped at 720p, only ever downscaled; width auto and kept even for H.264.
const VIDEO_SCALE = "scale=-2:'min(720,ih)'";

/** Compress raw media with ffmpeg: images -> WebP, videos -> H.264 (no audio). */
export async function compressMedia(
  input: Buffer,
  kind: MediaKind
): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bima-media-'));
  const inPath = path.join(workDir, 'input');
  const ext = kind === 'image' ? 'webp' : 'mp4';
  const outPath = path.join(workDir, `output.${ext}`);

  try {
    await fs.writeFile(inPath, input);

    if (kind === 'image') {
      await runFfmpeg(
        ['-i', inPath, '-frames:v', '1', '-vf', IMAGE_SCALE, '-c:v', 'libwebp', '-quality', '65', '-compression_level', '6', outPath],
        60_000
      );
    } else {
      await runFfmpeg(
        [
          '-i', inPath,
          '-vf', VIDEO_SCALE,
          '-c:v', 'libx264', '-preset', 'slow', '-crf', '30',
          '-pix_fmt', 'yuv420p',
          '-an',
          '-movflags', '+faststart',
          outPath,
        ],
        15 * 60_000
      );
    }

    const buffer = await fs.readFile(outPath);
    return { buffer, contentType: kind === 'image' ? 'image/webp' : 'video/mp4', ext };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

/** Compress the media, upload it to the Supabase bucket (img / vids) and return its public URL. */
export async function compressAndUpload(params: {
  input: Buffer;
  kind: MediaKind;
  sessionId: string;
}): Promise<{ fileUrl: string; storagePath: string; originalBytes: number; storedBytes: number }> {
  const { input, kind, sessionId } = params;
  const { buffer, contentType, ext } = await compressMedia(input, kind);

  const storagePath = `sessions/${sessionId}/${crypto.randomUUID()}.${ext}`;
  const bucket = BUCKETS[kind];
  const supabase = getAdminClient();

  const { error } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw new Error(`Gagal upload ke bucket "${bucket}": ${error.message}`);

  const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
  return { fileUrl: data.publicUrl, storagePath, originalBytes: input.length, storedBytes: buffer.length };
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
