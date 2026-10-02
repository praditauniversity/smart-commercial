/**
 * Agregasi ringkasan dashboard (murni). Temuan berstatus "keliru" TIDAK dihitung sebagai temuan valid
 * (dilaporkan terpisah). Skor lokasi = temuan valid terburuk; Monitoring Kepatuhan tidak ikut skor.
 */
import type { PriorityBand } from './risk';

export interface OverviewDetection {
  className: string;
  displayName: string;
  group: string | null;
  band: PriorityBand | null;
  score: number | null;
  reviewStatus: string;
}

export interface OverviewSessionInput {
  id: string;
  name: string;
  status: string;
  surveyDate: string;
  surveyor: { id: string; name: string };
  zone: { id: string; name: string; exposure: number; isSimulated: boolean } | null;
  mediaCount: number;
  missedCount: number;
  detections: OverviewDetection[];
}

const RANK: Record<PriorityBand, number> = { rendah: 1, sedang: 2, tinggi: 3, kritikal: 4 };
const emptyBands = () => ({ rendah: 0, sedang: 0, tinggi: 0, kritikal: 0, belumDinilai: 0 });

export interface SessionSummary {
  id: string;
  name: string;
  status: string;
  surveyDate: string;
  surveyor: { id: string; name: string };
  zone: OverviewSessionInput['zone'];
  mediaCount: number;
  missedCount: number;
  infraCount: number;
  complianceCount: number;
  falsePositiveCount: number;
  bandCounts: ReturnType<typeof emptyBands>;
  worstBand: PriorityBand | null;
  worstScore: number | null;
  reviewed: number; // temuan valid yang sudah ditinjau petugas
  valid: number;
}

export function summarizeSession(s: OverviewSessionInput): SessionSummary {
  const valid = s.detections.filter((d) => d.reviewStatus !== 'keliru');
  const bandCounts = emptyBands();
  let worst: OverviewDetection | null = null;
  let infraCount = 0;
  let complianceCount = 0;
  for (const d of valid) {
    if (d.group === 'monitoring_kepatuhan') {
      complianceCount++;
      continue;
    }
    infraCount++;
    if (d.band) {
      bandCounts[d.band]++;
      if (!worst || (d.score ?? 0) > (worst.score ?? 0)) worst = d;
    } else {
      bandCounts.belumDinilai++;
    }
  }
  return {
    id: s.id,
    name: s.name,
    status: s.status,
    surveyDate: s.surveyDate,
    surveyor: s.surveyor,
    zone: s.zone,
    mediaCount: s.mediaCount,
    missedCount: s.missedCount,
    infraCount,
    complianceCount,
    falsePositiveCount: s.detections.length - valid.length,
    bandCounts,
    worstBand: worst?.band ?? null,
    worstScore: worst?.score ?? null,
    reviewed: valid.filter((d) => d.reviewStatus !== 'belum_ditinjau').length,
    valid: valid.length,
  };
}

export interface Overview {
  totals: { sessions: number; media: number; validFindings: number; falsePositives: number; missed: number; reviewedFindings: number };
  bands: ReturnType<typeof emptyBands>;
  byClass: { className: string; displayName: string; group: string | null; count: number }[];
  sessions: SessionSummary[];
}

export function buildOverview(inputs: OverviewSessionInput[]): Overview {
  const sessions = inputs.map(summarizeSession);
  const bands = emptyBands();
  const classes = new Map<string, { className: string; displayName: string; group: string | null; count: number }>();
  for (const inp of inputs) {
    for (const d of inp.detections) {
      if (d.reviewStatus === 'keliru') continue;
      const c = classes.get(d.className) ?? { className: d.className, displayName: d.displayName, group: d.group, count: 0 };
      c.count++;
      classes.set(d.className, c);
    }
  }
  for (const s of sessions) for (const k of Object.keys(bands) as (keyof typeof bands)[]) bands[k] += s.bandCounts[k];

  // Urut: skor terburuk dulu (lokasi paling berisiko di atas), lalu tanggal terbaru.
  sessions.sort(
    (a, b) =>
      (b.worstBand ? RANK[b.worstBand] : 0) - (a.worstBand ? RANK[a.worstBand] : 0) ||
      (b.worstScore ?? 0) - (a.worstScore ?? 0) ||
      b.surveyDate.localeCompare(a.surveyDate)
  );

  return {
    totals: {
      sessions: sessions.length,
      media: sessions.reduce((n, s) => n + s.mediaCount, 0),
      validFindings: sessions.reduce((n, s) => n + s.valid, 0),
      falsePositives: sessions.reduce((n, s) => n + s.falsePositiveCount, 0),
      missed: sessions.reduce((n, s) => n + s.missedCount, 0),
      reviewedFindings: sessions.reduce((n, s) => n + s.reviewed, 0),
    },
    bands,
    byClass: [...classes.values()].sort((a, b) => b.count - a.count),
    sessions,
  };
}
