/**
 * Modul penilaian risiko (RQ4): Skor Risiko = Severity (1-3) x Exposure (1-3).
 *
 * Murni (tanpa I/O) agar mudah diuji. Skema mengikuti BAB II.A.5 tesis:
 * - Hanya kelompok "Keselamatan Infrastruktur" yang dapat skor risiko.
 * - Kelompok "Monitoring Kepatuhan" (spanduk, notis jual/sewa) hanya dilaporkan, tanpa skor.
 */

export type Severity = 1 | 2 | 3;
export type Exposure = 1 | 2 | 3;
/** Nilai diskrit yang mungkin: 5, 7, dan 8 mustahil secara matematis. */
export type RiskScore = 1 | 2 | 3 | 4 | 6 | 9;
export type PriorityBand = 'rendah' | 'sedang' | 'tinggi' | 'kritikal';
export type CategoryGroup = 'keselamatan_infrastruktur' | 'monitoring_kepatuhan';

export const SEVERITY_LABEL: Record<Severity, string> = { 1: 'Ringan', 2: 'Sedang', 3: 'Berat' };
export const EXPOSURE_LABEL: Record<Exposure, string> = { 1: 'Rendah', 2: 'Sedang', 3: 'Tinggi' };
export const BAND_LABEL: Record<PriorityBand, string> = {
  rendah: 'Rendah',
  sedang: 'Sedang',
  tinggi: 'Tinggi',
  kritikal: 'Kritikal',
};
export const GROUP_LABEL: Record<CategoryGroup, string> = {
  keselamatan_infrastruktur: 'Keselamatan Infrastruktur',
  monitoring_kepatuhan: 'Monitoring Kepatuhan',
};

export interface SubtypeProfile {
  /** Nama kelas keluaran model YOLO. */
  subtype: string;
  /** Kategori manusiawi (Jalan, Vegetasi, Rambu, Spanduk/Banner, Notis jual/sewa). */
  category: string;
  group: CategoryGroup;
  /** Label manusiawi subtipe, bukan nama kelas mentah. */
  label: string;
  /** Severity bawaan; null untuk kelompok tanpa skor risiko. */
  severity: Severity | null;
}

/**
 * Pemetaan kelas model -> kategori, kelompok, dan Severity bawaan.
 * `sign` hanya satu kelas (Stage 2 kondisi normal/rusak belum tersedia), sehingga Severity
 * bawaan 2 (Sedang) adalah NILAI AWAL yang dapat diubah petugas, bukan hasil klasifikasi model.
 */
export const SUBTYPE_PROFILES: readonly SubtypeProfile[] = [
  { subtype: 'pavedroad_pothole', category: 'Jalan', group: 'keselamatan_infrastruktur', label: 'Jalan berlubang', severity: 3 },
  { subtype: 'pavedroad_crack', category: 'Jalan', group: 'keselamatan_infrastruktur', label: 'Retak permukaan jalan', severity: 2 },
  { subtype: 'vegetation_blocking', category: 'Vegetasi', group: 'keselamatan_infrastruktur', label: 'Vegetasi menghalangi objek', severity: 3 },
  { subtype: 'vegetation_dead', category: 'Vegetasi', group: 'keselamatan_infrastruktur', label: 'Vegetasi mati berisiko tumbang', severity: 2 },
  { subtype: 'weeds', category: 'Vegetasi', group: 'keselamatan_infrastruktur', label: 'Rumput liar / gulma', severity: 1 },
  { subtype: 'sign', category: 'Rambu', group: 'keselamatan_infrastruktur', label: 'Rambu (kondisi belum diklasifikasi)', severity: 2 },
  { subtype: 'banner', category: 'Spanduk/Banner', group: 'monitoring_kepatuhan', label: 'Spanduk / banner', severity: null },
  { subtype: 'house_notice', category: 'Notis jual/sewa', group: 'monitoring_kepatuhan', label: 'Notis jual / sewa rumah', severity: null },
];

export function getSubtypeProfile(subtype: string): SubtypeProfile | undefined {
  return SUBTYPE_PROFILES.find((p) => p.subtype === subtype);
}

export function isSeverity(v: unknown): v is Severity {
  return v === 1 || v === 2 || v === 3;
}

export function isExposure(v: unknown): v is Exposure {
  return v === 1 || v === 2 || v === 3;
}

/** Pita prioritas: 1-2 Rendah, 3-4 Sedang, 6 Tinggi, 9 Kritikal. */
export function bandForScore(score: RiskScore): PriorityBand {
  if (score >= 9) return 'kritikal';
  if (score >= 6) return 'tinggi';
  if (score >= 3) return 'sedang';
  return 'rendah';
}

export function computeScore(severity: Severity, exposure: Exposure): RiskScore {
  return (severity * exposure) as RiskScore;
}

export interface RiskResult {
  severity: Severity;
  exposure: Exposure;
  score: RiskScore;
  band: PriorityBand;
}

export function computeRisk(severity: Severity, exposure: Exposure): RiskResult {
  if (!isSeverity(severity)) throw new RangeError(`Severity harus 1, 2, atau 3 (diterima: ${String(severity)})`);
  if (!isExposure(exposure)) throw new RangeError(`Exposure harus 1, 2, atau 3 (diterima: ${String(exposure)})`);
  const score = computeScore(severity, exposure);
  return { severity, exposure, score, band: bandForScore(score) };
}

export type DetectionAssessment =
  | ({ scored: true } & RiskResult)
  | { scored: false; reason: 'monitoring_kepatuhan' | 'subtipe_tidak_dikenal' | 'tanpa_exposure' };

/**
 * Menilai satu temuan. `severityOverride` adalah koreksi petugas (menggantikan nilai bawaan).
 * Temuan Monitoring Kepatuhan tidak pernah mendapat skor, apa pun override-nya.
 */
export function assessDetection(
  subtype: string,
  exposure: Exposure | null | undefined,
  severityOverride?: Severity | null
): DetectionAssessment {
  const profile = getSubtypeProfile(subtype);
  if (!profile) return { scored: false, reason: 'subtipe_tidak_dikenal' };
  if (profile.group === 'monitoring_kepatuhan') return { scored: false, reason: 'monitoring_kepatuhan' };
  if (!isExposure(exposure)) return { scored: false, reason: 'tanpa_exposure' };
  const severity = isSeverity(severityOverride) ? severityOverride : profile.severity;
  if (!isSeverity(severity)) return { scored: false, reason: 'subtipe_tidak_dikenal' };
  return { scored: true, ...computeRisk(severity, exposure) };
}

/** Untuk lokasi dengan banyak temuan: skor lokasi = skor tertinggi di antara temuan bernilai. */
export function worstAssessment(items: DetectionAssessment[]): RiskResult | null {
  let worst: RiskResult | null = null;
  for (const it of items) {
    if (it.scored && (!worst || it.score > worst.score)) worst = it;
  }
  return worst;
}
