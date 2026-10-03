/** Pengelompokan temuan per gambar/frame untuk panel "Temuan" di dashboard (murni, mudah diuji). */
import type { PriorityBand } from './risk';

export interface FindingRow {
  id: string;
  sessionId: string;
  sessionName: string;
  mediaAssetId: string;
  frameIndex: number | null;
  className: string;
  displayName: string;
  confidence: number | null;
  band: PriorityBand | null;
  score: number | null;
  condition: string | null;
  bbox: { x: number; y: number; width: number; height: number };
  imageUrl: string | null;
}

export interface FindingTile {
  key: string;
  sessionId: string;
  sessionName: string;
  imageUrl: string;
  worstBand: PriorityBand | null;
  worstScore: number | null;
  boxes: Pick<FindingRow, 'id' | 'className' | 'displayName' | 'bbox' | 'confidence' | 'band' | 'score' | 'condition'>[];
}

/**
 * Satu kartu per (media, frame): semua kotak yang lolos filter pada frame itu digambar bersama.
 * Urutan kartu mengikuti kemunculan pertama pada `rows` (sudah diurutkan dari skor tertinggi); baris tanpa gambar dilewati.
 */
export function groupFindingsByFrame(rows: FindingRow[], limit: number): FindingTile[] {
  const tiles = new Map<string, FindingTile>();
  for (const r of rows) {
    if (!r.imageUrl) continue;
    const key = `${r.mediaAssetId}:${r.frameIndex ?? 'img'}`;
    let tile = tiles.get(key);
    if (!tile) {
      if (tiles.size >= limit) continue;
      tile = { key, sessionId: r.sessionId, sessionName: r.sessionName, imageUrl: r.imageUrl, worstBand: null, worstScore: null, boxes: [] };
      tiles.set(key, tile);
    }
    tile.boxes.push({ id: r.id, className: r.className, displayName: r.displayName, bbox: r.bbox, confidence: r.confidence, band: r.band, score: r.score, condition: r.condition });
    if (r.score !== null && (tile.worstScore === null || r.score > tile.worstScore)) {
      tile.worstScore = r.score;
      tile.worstBand = r.band;
    }
  }
  return [...tiles.values()];
}
