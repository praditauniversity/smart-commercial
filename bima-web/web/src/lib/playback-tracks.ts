/**
 * Lintasan kotak untuk pemutar video (murni, tanpa I/O).
 *
 * Deteksi rapat pada video 720p digabung menjadi lintasan per objek (ai-service). Lintasan itu BUKAN temuan resmi:
 * tiap lintasan ditautkan ke temuan resmi (`detectionIds`) saat dibuat, dan status koreksi supervisor dibaca dari
 * temuan itu setiap kali video diputar. Dengan begitu, temuan yang ditandai keliru ikut hilang dari video,
 * dan kelas hasil koreksi ikut berlaku, tanpa memproses ulang video.
 */
import { isAcceptedFinding, parseBBox, visibleBoxes, type DetectionView, type GalleryMode } from './media-view';

/** [waktu detik, x, y, width, height, confidence]; kotak ternormalisasi 0-1. */
export type PlaybackPoint = [number, number, number, number, number, number];

export interface PlaybackTrack {
  id: number;
  classId: string;
  className: string;
  /** Temuan resmi yang ditautkan; kosong = lintasan di luar frame sampel (belum pernah ditinjau). */
  detectionIds: string[];
  points: PlaybackPoint[];
}

export interface PlaybackData {
  version: 1;
  /** Selang waktu antar-frame deteksi rapat (detik). */
  step: number;
  /** Celah terlebar antar-titik yang masih diinterpolasi (detik); celah lebih besar dianggap objek hilang. */
  maxGap: number;
  tracks: PlaybackTrack[];
}

export type Box = { x: number; y: number; width: number; height: number };

export function iou(a: Box, b: Box): number {
  const iw = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const ih = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const inter = iw * ih;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

export interface LinkableDetection {
  id: string;
  classId: string;
  className: string;
  timestampSeconds: number | null;
  bbox: string; // JSON {x,y,width,height}
  confidence: number | null;
}

type UnlinkedTrack = Omit<PlaybackTrack, 'detectionIds'>;

/**
 * Menautkan lintasan ke temuan resmi: pada waktu frame sampel, kotak lintasan dengan kelas yang sama dan IoU
 * tertinggi (≥ iouMin) menjadi pasangan temuan itu. Satu temuan hanya ditautkan ke satu lintasan, tetapi satu lintasan
 * boleh memuat beberapa temuan (objek yang sama pada beberapa frame sampel).
 * Temuan yang tidak menemukan pasangan (mis. confidence tepat di bawah ambang pada video 720p) dibuatkan lintasan
 * satu titik dari kotaknya sendiri, sehingga setiap temuan resmi selalu tampil pada waktunya.
 */
export function linkTracksToDetections(
  tracks: UnlinkedTrack[],
  detections: LinkableDetection[],
  opts: { timeTolerance: number; iouMin: number }
): PlaybackTrack[] {
  const linked = new Map<number, string[]>();
  const candidates: { score: number; detId: string; trackId: number }[] = [];

  for (const d of detections) {
    const box = parseBBox(d.bbox);
    if (!box || d.timestampSeconds === null) continue;
    for (const tr of tracks) {
      if (tr.classId !== d.classId) continue;
      let nearest: PlaybackPoint | null = null;
      for (const p of tr.points) {
        if (!nearest || Math.abs(p[0] - d.timestampSeconds) < Math.abs(nearest[0] - d.timestampSeconds)) nearest = p;
      }
      if (!nearest || Math.abs(nearest[0] - d.timestampSeconds) > opts.timeTolerance) continue;
      const score = iou(box, { x: nearest[1], y: nearest[2], width: nearest[3], height: nearest[4] });
      if (score >= opts.iouMin) candidates.push({ score, detId: d.id, trackId: tr.id });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const taken = new Set<string>();
  for (const c of candidates) {
    if (taken.has(c.detId)) continue;
    taken.add(c.detId);
    linked.set(c.trackId, [...(linked.get(c.trackId) ?? []), c.detId]);
  }

  const out: PlaybackTrack[] = tracks.map((tr) => ({ ...tr, detectionIds: linked.get(tr.id) ?? [] }));
  let nextId = tracks.reduce((m, t) => Math.max(m, t.id), -1) + 1;
  for (const d of detections) {
    const box = parseBBox(d.bbox);
    if (taken.has(d.id) || !box || d.timestampSeconds === null) continue;
    out.push({
      id: nextId++,
      classId: d.classId,
      className: d.className,
      detectionIds: [d.id],
      points: [[d.timestampSeconds, box.x, box.y, box.width, box.height, d.confidence ?? 0]],
    });
  }
  return out;
}

/**
 * Kotak lintasan pada waktu `time`: interpolasi linear antara dua titik yang mengapit; sebelum titik pertama /
 * sesudah titik terakhir ditahan sampai setengah selang (`step / 2`). Celah > `maxGap` dianggap objek hilang.
 */
export function boxAt(track: PlaybackTrack, time: number, step: number, maxGap: number): { x: number; y: number; width: number; height: number; confidence: number } | null {
  const pts = track.points;
  if (pts.length === 0) return null;
  const hold = step / 2;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const asBox = (p: PlaybackPoint) => ({ x: p[1], y: p[2], width: p[3], height: p[4], confidence: p[5] });
  if (time < first[0]) return first[0] - time <= hold ? asBox(first) : null;
  if (time > last[0]) return time - last[0] <= hold ? asBox(last) : null;

  // Pencarian biner: titik terakhir dengan waktu <= time.
  let lo = 0;
  let hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid][0] <= time) lo = mid;
    else hi = mid - 1;
  }
  const p0 = pts[lo];
  const p1 = pts[Math.min(lo + 1, pts.length - 1)];
  if (p1[0] === p0[0]) return asBox(p0);
  if (p1[0] - p0[0] > maxGap) {
    if (time - p0[0] <= hold) return asBox(p0);
    if (p1[0] - time <= hold) return asBox(p1);
    return null;
  }
  const f = (time - p0[0]) / (p1[0] - p0[0]);
  const lerp = (a: number, b: number) => a + (b - a) * f;
  return { x: lerp(p0[1], p1[1]), y: lerp(p0[2], p1[2]), width: lerp(p0[3], p1[3]), height: lerp(p0[4], p1[4]), confidence: lerp(p0[5], p1[5]) };
}

export interface TrackStatus {
  /** Status tinjau efektif lintasan, dipakai aturan tampil yang sama dengan galeri frame. */
  reviewStatus: string;
  /** Temuan yang menentukan label/kelas/gaya (bukan yang keliru bila ada pilihan lain). */
  display: DetectionView | null;
  linked: boolean;
}

/**
 * Status efektif lintasan dari temuan yang ditautkan (dibaca saat ini, jadi koreksi terbaru ikut berlaku):
 * ada yang benar -> benar; selain itu ada yang belum ditinjau -> belum ditinjau; semua keliru -> keliru.
 * Lintasan tanpa temuan tertaut dianggap belum ditinjau.
 */
export function trackStatus(track: PlaybackTrack, byId: Map<string, DetectionView>): TrackStatus {
  const linked = track.detectionIds.map((id) => byId.get(id)).filter((d): d is DetectionView => Boolean(d));
  if (linked.length === 0) return { reviewStatus: 'belum_ditinjau', display: null, linked: false };
  const accepted = linked.find((d) => isAcceptedFinding(d.reviewStatus));
  if (accepted) return { reviewStatus: accepted.reviewStatus, display: accepted, linked: true };
  const pending = linked.find((d) => d.reviewStatus !== 'keliru');
  if (pending) return { reviewStatus: pending.reviewStatus, display: pending, linked: true };
  return { reviewStatus: 'keliru', display: linked[0], linked: true };
}

/**
 * Lintasan yang boleh digambar, memakai aturan `visibleBoxes` yang sama dengan galeri frame:
 * - ada temuan terpilih: hanya lintasan yang memuat temuan itu;
 * - pratinjau pada media yang sudah ditinjau: hanya yang benar; koreksi: semua kecuali keliru;
 * - lintasan tanpa temuan tertaut (di luar frame sampel) hanya ikut bila `includeUnlinked`.
 */
export function selectPlaybackTracks(
  tracks: PlaybackTrack[],
  detections: DetectionView[],
  opts: { mode: GalleryMode; selectedIds: readonly string[]; includeUnlinked: boolean; showAll?: boolean }
): { track: PlaybackTrack; status: TrackStatus }[] {
  const byId = new Map(detections.map((d) => [d.id, d] as const));
  const mediaHasReview = detections.some((d) => d.reviewStatus !== 'belum_ditinjau');
  const rows = tracks
    .map((track) => ({ track, status: trackStatus(track, byId) }))
    .filter((r) => r.status.linked || opts.includeUnlinked);
  if (opts.selectedIds.length > 0) return rows.filter((r) => r.track.detectionIds.some((id) => opts.selectedIds.includes(id)));
  const keep = new Set(
    visibleBoxes(
      rows.map((r) => ({ id: String(r.track.id), reviewStatus: r.status.reviewStatus })),
      { mode: opts.mode, selectedIds: [], mediaHasReview, showAll: opts.showAll }
    ).map((b) => b.id)
  );
  return rows.filter((r) => keep.has(String(r.track.id)));
}

export function parsePlaybackData(raw: string | null | undefined): PlaybackData | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && v.version === 1 && Array.isArray(v.tracks) && typeof v.step === 'number' && typeof v.maxGap === 'number' ? (v as PlaybackData) : null;
  } catch {
    return null;
  }
}
