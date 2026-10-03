/** Tipe data tampilan untuk galeri frame / panel narasi (bentuk respons API sesi). */
import type { PriorityBand } from './risk';

export interface FrameView {
  id: string;
  frameIndex: number;
  timestampSeconds: number;
  imageUrl: string;
}

export interface DetectionView {
  id: string;
  mediaAssetId: string;
  frameIndex: number | null;
  timestampSeconds: number | null;
  className: string;
  bbox: string; // JSON {x,y,width,height} ternormalisasi 0-1
  confidence: number | null;
  severity: number | null;
  severitySource: string;
  exposure: number | null;
  riskScore: number | null;
  priorityBand: PriorityBand | null;
  reviewStatus: string; // belum_ditinjau | dikonfirmasi | dikoreksi | keliru
  /** Tahap 2 (rambu): hasil classifier atau koreksi supervisor; null = belum diklasifikasi / bukan rambu. */
  conditionLabel?: 'normal' | 'damaged' | string | null;
  conditionModel?: string | null;
  conditionTag?: { id: string; code: string; label: string; severity: number } | null;
  classDefinition?: {
    id: string;
    displayName: string;
    category: string | null;
    categoryGroup: string | null;
    hasConditionStage?: boolean;
  } | null;
}

export interface EvaluatedClipView {
  id: string;
  clipId: string;
  fileName: string;
  durationSeconds: number;
  referenceCaption: string;
  modelCaption: string;
  bleu: number | null;
  llmOverall: number | null;
  completeness: number | null;
  locationAccuracy: number | null;
  severityAccuracy: number | null;
  categoriesDetected: string; // JSON array
  categoriesMissed: string;
  categoriesHallucinated: string;
  judgeReason: string | null;
  generatorModel: string | null;
}

export function parseBBox(raw: string): { x: number; y: number; width: number; height: number } | null {
  try {
    const b = JSON.parse(raw);
    return ['x', 'y', 'width', 'height'].every((k) => typeof b?.[k] === 'number') ? b : null;
  } catch {
    return null;
  }
}

export function parseList(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}

export function formatTimestamp(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '-';
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

export type GalleryMode = 'pratinjau' | 'koreksi';

/** Status tinjau yang dianggap "benar": dikonfirmasi supervisor, atau dikoreksi (kelas/severity/kondisi) lalu dipertahankan. */
export function isAcceptedFinding(status: string): boolean {
  return status === 'dikonfirmasi' || status === 'dikoreksi';
}

/**
 * Kotak yang digambar pada satu frame, agar kotak tidak bertumpuk:
 * - ada pilihan: hanya kotak yang dipilih (temuan keliru atau lainnya baru tampil saat dipilih di panel);
 * - pratinjau (hanya baca): hanya temuan yang sudah dikonfirmasi benar. Bila media belum pernah ditinjau sama sekali,
 *   semua kecuali keliru ditampilkan (kalau tidak, hasil AI tidak akan terlihat);
 * - koreksi: semua kecuali keliru (yang belum ditinjau tetap terlihat agar bisa dikoreksi).
 */
export function visibleBoxes<T extends { id: string; reviewStatus: string }>(
  frameDetections: T[],
  opts: { mode: GalleryMode; selectedIds: readonly string[]; mediaHasReview: boolean }
): T[] {
  if (opts.selectedIds.length > 0) return frameDetections.filter((d) => opts.selectedIds.includes(d.id));
  if (opts.mode === 'pratinjau' && opts.mediaHasReview) return frameDetections.filter((d) => isAcceptedFinding(d.reviewStatus));
  return frameDetections.filter((d) => d.reviewStatus !== 'keliru');
}

/** Label singkat status tinjau untuk panel temuan. */
export function reviewLabel(status: string): { text: string; tone: 'benar' | 'keliru' | 'belum' } {
  if (isAcceptedFinding(status)) return { text: status === 'dikoreksi' ? 'Benar (dikoreksi)' : 'Benar', tone: 'benar' };
  if (status === 'keliru') return { text: 'Keliru', tone: 'keliru' };
  return { text: 'Belum ditinjau', tone: 'belum' };
}
