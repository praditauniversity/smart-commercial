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
  classDefinition?: {
    id: string;
    displayName: string;
    category: string | null;
    categoryGroup: string | null;
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
