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
  { subtype: 'sign', category: 'Rambu', group: 'keselamatan_infrastruktur', label: 'Rambu', severity: 2 },
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
  | { scored: false; reason: 'monitoring_kepatuhan' | 'subtipe_tidak_dikenal' | 'tanpa_exposure' | 'kondisi_normal' };

/** Bagian data master kelas yang dibutuhkan untuk menilai risiko (dibaca dari tabel ClassDefinition). */
export interface ClassRiskProfile {
  categoryGroup: string | null;
  defaultSeverity: number | null;
}

/**
 * Menilai satu temuan dari data master kelas. `severityOverride` adalah koreksi petugas (menggantikan nilai
 * bawaan). Kelompok Monitoring Kepatuhan tidak pernah mendapat skor, apa pun override-nya.
 */
export function assessWithProfile(
  profile: ClassRiskProfile | null | undefined,
  exposure: Exposure | number | null | undefined,
  severityOverride?: Severity | number | null
): DetectionAssessment {
  if (!profile || !profile.categoryGroup) return { scored: false, reason: 'subtipe_tidak_dikenal' };
  if (profile.categoryGroup === 'monitoring_kepatuhan') return { scored: false, reason: 'monitoring_kepatuhan' };
  if (profile.categoryGroup !== 'keselamatan_infrastruktur') return { scored: false, reason: 'subtipe_tidak_dikenal' };
  if (!isExposure(exposure)) return { scored: false, reason: 'tanpa_exposure' };
  const severity = isSeverity(severityOverride) ? severityOverride : profile.defaultSeverity;
  if (!isSeverity(severity)) return { scored: false, reason: 'subtipe_tidak_dikenal' };
  return { scored: true, ...computeRisk(severity, exposure) };
}

/** Menilai satu temuan berdasarkan nama kelas model, memakai tabel bawaan di kode (untuk seed dan tes). */
export function assessDetection(
  subtype: string,
  exposure: Exposure | null | undefined,
  severityOverride?: Severity | null
): DetectionAssessment {
  const p = getSubtypeProfile(subtype);
  if (!p) return { scored: false, reason: 'subtipe_tidak_dikenal' };
  return assessWithProfile({ categoryGroup: p.group, defaultSeverity: p.severity }, exposure, severityOverride);
}

/** Untuk lokasi dengan banyak temuan: skor lokasi = skor tertinggi di antara temuan bernilai. */
export function worstAssessment(items: DetectionAssessment[]): RiskResult | null {
  let worst: RiskResult | null = null;
  for (const it of items) {
    if (it.scored && (!worst || it.score > worst.score)) worst = it;
  }
  return worst;
}

// ---------------------------------------------------------------------------------------------
// Tahap 2 (klasifikasi kondisi per crop), saat ini hanya rambu (sign).
// Classifier: yolo11n-cls "fold0" (hasil 5-fold cross-validation), 2 kelas: damaged | normal.
// Classifier TIDAK menghasilkan subtipe; subtipe (tag) ditetapkan supervisor dan severity-nya dari master tag.
// ---------------------------------------------------------------------------------------------

/** Label wajib ditampilkan di UI dan dokumentasi agar status model jelas bila ditinjau. */
export const CONDITION_MODEL_ID = 'sign_classifier_fold0';
export const CONDITION_MODEL_LABEL = 'classifier fold0, hasil 5-fold cross-validation';

export type ConditionLabel = 'normal' | 'damaged';
/** bawaan = nilai kelas; sementara = rambu rusak tanpa subtipe; tag = dari tag subtipe; petugas = diubah manual. */
export type SeveritySource = 'bawaan' | 'sementara' | 'tag' | 'petugas';

export function isConditionLabel(v: unknown): v is ConditionLabel {
  return v === 'normal' || v === 'damaged';
}

/** Tag awal (keputusan final): panel hilang/penyok/merosot = Berat, panel/tiang miring = Sedang, pudar = Ringan. */
export const DEFAULT_SIGN_TAGS: readonly { code: string; label: string; severity: Severity; sortOrder: number }[] = [
  { code: 'panel_hilang', label: 'Panel hilang', severity: 3, sortOrder: 1 },
  { code: 'panel_penyok', label: 'Panel penyok', severity: 3, sortOrder: 2 },
  { code: 'panel_merosot', label: 'Panel merosot', severity: 3, sortOrder: 3 },
  { code: 'panel_miring', label: 'Panel miring', severity: 2, sortOrder: 4 },
  { code: 'tiang_miring', label: 'Tiang miring', severity: 2, sortOrder: 5 },
  { code: 'pudar', label: 'Pudar', severity: 1, sortOrder: 6 },
];

export interface ConditionProfile extends ClassRiskProfile {
  hasConditionStage?: boolean;
}

export interface ConditionContext {
  /** Severity manual petugas; menang atas tag dan nilai bawaan. */
  severityOverride?: number | null;
  /** Hasil Tahap 2 / koreksi petugas; null = belum diklasifikasi. */
  condition?: ConditionLabel | string | null;
  /** Severity dari tag subtipe yang ditetapkan (hanya bermakna bila condition = damaged). */
  tagSeverity?: number | null;
}

export type ConditionAssessment =
  | ({ scored: true; severitySource: SeveritySource } & RiskResult)
  | { scored: false; reason: Extract<DetectionAssessment, { scored: false }>['reason'] };

function hasConditionStage(profile: ConditionProfile | null | undefined): boolean {
  return Boolean(profile?.hasConditionStage) && profile?.categoryGroup === 'keselamatan_infrastruktur';
}

/**
 * Severity yang berlaku beserta sumbernya, tanpa memerlukan Exposure.
 * null bila tidak ada severity yang bermakna (kondisi normal, atau profil tidak dikenal).
 * Urutan: manual petugas > tag subtipe (rambu rusak) > nilai sementara kelas (rambu rusak tanpa tag) > nilai bawaan kelas.
 */
export function resolveConditionSeverity(
  profile: ConditionProfile | null | undefined,
  ctx: ConditionContext = {}
): { severity: Severity; source: SeveritySource } | null {
  if (!profile || !profile.categoryGroup || profile.categoryGroup === 'monitoring_kepatuhan') return null;
  const stage = hasConditionStage(profile);
  if (stage && ctx.condition === 'normal') return null;
  if (isSeverity(ctx.severityOverride)) return { severity: ctx.severityOverride, source: 'petugas' };
  if (stage && ctx.condition === 'damaged') {
    if (isSeverity(ctx.tagSeverity)) return { severity: ctx.tagSeverity, source: 'tag' };
    return isSeverity(profile.defaultSeverity) ? { severity: profile.defaultSeverity, source: 'sementara' } : null;
  }
  return isSeverity(profile.defaultSeverity) ? { severity: profile.defaultSeverity, source: 'bawaan' } : null;
}

/**
 * Menilai temuan dengan memperhitungkan Tahap 2.
 * - Kelas tanpa Tahap 2: sama dengan assessWithProfile.
 * - normal: TIDAK masuk penilaian risiko sama sekali (hanya status temuan normal).
 * - damaged: severity = manual petugas > tag subtipe > nilai sementara kelas (diberi sumber "sementara").
 * - belum diklasifikasi (null): nilai bawaan kelas, seperti sebelum Tahap 2 ada.
 */
export function assessWithCondition(
  profile: ConditionProfile | null | undefined,
  exposure: Exposure | number | null | undefined,
  ctx: ConditionContext = {}
): ConditionAssessment {
  if (hasConditionStage(profile) && ctx.condition === 'normal') return { scored: false, reason: 'kondisi_normal' };
  const resolved = resolveConditionSeverity(profile, ctx);
  const a = assessWithProfile(profile, exposure, resolved?.severity ?? null);
  return a.scored && resolved ? { ...a, severitySource: resolved.source } : (a as ConditionAssessment);
}
