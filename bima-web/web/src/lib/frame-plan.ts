/**
 * Perencanaan frame sampel video (Opsi A). HARUS identik dengan
 * ai-service/services/frame_sampler.py (tes pada kedua sisi memakai nilai yang sama).
 *
 * ~0,5 fps dengan batas 24 frame; bila klip lebih panjang dari 48 detik frame disebar merata di
 * seluruh durasi, bukan 24 frame pertama.
 */
export const SAMPLE_FPS = 0.5;
export const MAX_FRAMES = 24;

export function planFrameTimestamps(durationSeconds: number, fps = SAMPLE_FPS, maxFrames = MAX_FRAMES): number[] {
  if (!(durationSeconds > 0)) return [0];
  const n = Math.max(1, Math.min(maxFrames, Math.ceil(durationSeconds * fps)));
  const step = durationSeconds / n;
  return Array.from({ length: n }, (_, i) => Math.round((i + 0.5) * step * 1000) / 1000);
}
