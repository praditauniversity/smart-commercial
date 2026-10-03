/** Titik peta dashboard: satu penanda per lokasi (sesi/koordinat), bukan satu penanda per kotak deteksi (murni, mudah diuji). */
import type { PriorityBand } from './risk';

export interface GeoLike { type?: string; coordinates?: any }

/** Titik representatif [lng, lat]: Point apa adanya; Polygon memakai rata-rata titik sudut (tanpa titik penutup). */
export function representativePoint(geo: GeoLike | null | undefined): [number, number] | null {
  if (!geo || !Array.isArray(geo.coordinates)) return null;
  if (geo.type === 'Point' && typeof geo.coordinates[0] === 'number' && typeof geo.coordinates[1] === 'number') {
    return [geo.coordinates[0], geo.coordinates[1]];
  }
  if (geo.type === 'Polygon' && Array.isArray(geo.coordinates[0])) {
    let ring: number[][] = geo.coordinates[0].filter((p: unknown) => Array.isArray(p) && p.length >= 2);
    if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ring = ring.slice(0, -1);
    if (ring.length === 0) return null;
    return [ring.reduce((n, p) => n + p[0], 0) / ring.length, ring.reduce((n, p) => n + p[1], 0) / ring.length];
  }
  return null;
}

const RANK: Record<PriorityBand, number> = { rendah: 1, sedang: 2, tinggi: 3, kritikal: 4 };

export interface MapDetection {
  className: string;
  displayName: string;
  band: PriorityBand | null;
  score: number | null;
  /** Koordinat khusus temuan; bila kosong dipakai lokasi sesi. */
  geo?: GeoLike | null;
}

export interface MapSessionInput {
  id: string;
  name: string;
  locationAddress: string | null;
  surveyorName: string | null;
  geo: GeoLike | null;
  detections: MapDetection[];
}

export interface MapMarker {
  key: string;
  sessionId: string;
  sessionName: string;
  locationAddress: string | null;
  surveyorName: string | null;
  position: [number, number]; // [lat, lng]
  count: number;
  worstBand: PriorityBand | null;
  worstScore: number | null;
  classes: { displayName: string; count: number }[];
}

export function buildMapMarkers(sessions: MapSessionInput[]): MapMarker[] {
  const markers = new Map<string, MapMarker>();
  const perClass = new Map<string, Map<string, number>>();
  for (const s of sessions) {
    for (const d of s.detections) {
      const p = representativePoint(d.geo) ?? representativePoint(s.geo);
      if (!p) continue;
      const key = `${s.id}:${p[0].toFixed(5)},${p[1].toFixed(5)}`;
      let m = markers.get(key);
      if (!m) {
        m = { key, sessionId: s.id, sessionName: s.name, locationAddress: s.locationAddress, surveyorName: s.surveyorName, position: [p[1], p[0]], count: 0, worstBand: null, worstScore: null, classes: [] };
        markers.set(key, m);
        perClass.set(key, new Map());
      }
      m.count++;
      const pc = perClass.get(key)!;
      pc.set(d.displayName, (pc.get(d.displayName) ?? 0) + 1);
      if (d.band && d.score !== null && (m.worstScore === null || d.score > m.worstScore || (d.score === m.worstScore && RANK[d.band] > RANK[m.worstBand!]))) {
        m.worstBand = d.band;
        m.worstScore = d.score;
      }
    }
  }
  for (const [key, m] of markers) {
    m.classes = [...perClass.get(key)!.entries()].map(([displayName, count]) => ({ displayName, count })).sort((a, b) => b.count - a.count);
  }
  // Risiko tertinggi digambar terakhir agar berada di atas penanda lain.
  return [...markers.values()].sort((a, b) => (a.worstScore ?? 0) - (b.worstScore ?? 0));
}
