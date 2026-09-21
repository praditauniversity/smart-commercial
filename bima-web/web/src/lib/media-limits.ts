import { requirePublicEnv } from './env';

/**
 * Media limits shared by the browser and the server.
 *
 * NEXT_PUBLIC_MAX_VIDEO_SECONDS is the single source of truth and has no built-in default: it is read at
 * runtime on the server and inlined at build time for the browser, so changing it requires
 * `npm run build` + a restart. The server check (ffprobe in media-storage.ts) is authoritative; the
 * browser check only saves a pointless upload of a large file.
 */
export function getMaxVideoSeconds(): number {
  const raw = requirePublicEnv('NEXT_PUBLIC_MAX_VIDEO_SECONDS', process.env.NEXT_PUBLIC_MAX_VIDEO_SECONDS);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`NEXT_PUBLIC_MAX_VIDEO_SECONDS harus angka lebih dari 0, bukan "${raw}".`);
  }
  return value;
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} detik`;
  return s === 0 ? `${m} menit` : `${m} menit ${s} detik`;
}

export function videoTooLongMessage(seconds: number | null): string {
  const limit = formatDuration(getMaxVideoSeconds());
  return seconds === null
    ? `Durasi video tidak dapat dibaca. Batas durasi video adalah ${limit}.`
    : `Video berdurasi ${formatDuration(seconds)}, melebihi batas ${limit}. Potong video terlebih dahulu.`;
}

/** Browser only: reads the duration from the file's metadata. Resolves null when it cannot be read. */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}
