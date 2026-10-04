export const DEFAULT_MAX_VIDEO_DURATION_SECONDS = 120;
export const MAX_VIDEO_DURATION_SECONDS = 120;

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} detik`;
  return s === 0 ? `${m} menit` : `${m} menit ${s} detik`;
}

export function videoTooLongMessage(seconds: number | null, maxVideoSeconds: number): string {
  const limit = formatDuration(maxVideoSeconds);
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
