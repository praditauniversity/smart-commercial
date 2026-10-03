/**
 * Aturan koreksi petugas (supervisor/admin) atas temuan model. Murni (tanpa I/O).
 *
 * - "dikonfirmasi": temuan benar.
 * - "keliru": temuan salah (false positive); baris tidak dihapus, hanya ditandai agar riwayat tetap ada.
 * - "kelas_diubah": kelas benar berbeda; Severity kembali ke nilai bawaan kelas baru, kondisi/tag Tahap 2 dikosongkan.
 * - "severity_diubah": mengganti Severity manual (hanya Keselamatan Infrastruktur, dan bukan rambu normal).
 * - "kondisi_diubah": menetapkan kondisi rambu (normal/damaged) dan, bila rusak, tag subtipe dari master tag.
 *   Memilih tag menggantikan Severity manual sebelumnya (sumber menjadi "tag"). Hanya kelas dengan Tahap 2 (rambu).
 * - "terlewat" (false negative) tidak mengubah temuan mana pun; dicatat terpisah pada sesi/media.
 */
import {
  assessWithCondition,
  isConditionLabel,
  isSeverity,
  resolveConditionSeverity,
  type ConditionContext,
  type ConditionProfile,
  type SeveritySource,
} from './risk';

export type DetectionCorrectionKind = 'dikonfirmasi' | 'keliru' | 'kelas_diubah' | 'severity_diubah' | 'kondisi_diubah';
export const DETECTION_CORRECTION_KINDS: readonly DetectionCorrectionKind[] = ['dikonfirmasi', 'keliru', 'kelas_diubah', 'severity_diubah', 'kondisi_diubah'];

export function isDetectionCorrectionKind(v: unknown): v is DetectionCorrectionKind {
  return typeof v === 'string' && (DETECTION_CORRECTION_KINDS as readonly string[]).includes(v);
}

export interface DetectionState {
  classId: string;
  classProfile: ConditionProfile;
  severity: number | null;
  severitySource: string;
  /** Exposure yang berlaku untuk temuan ini (dari zona sesi); null bila sesi tanpa zona. */
  exposure: number | null;
  conditionLabel?: string | null;
  conditionTagId?: string | null;
  /** Severity dari tag yang sedang terpasang (bila ada). */
  tagSeverity?: number | null;
}

export interface CorrectionRequest {
  kind: DetectionCorrectionKind;
  newClass?: { id: string; profile: ConditionProfile };
  severity?: number;
  condition?: string;
  /**
   * Tag yang dipilih (sudah divalidasi aktif dan milik kelas temuan oleh pemanggil).
   * undefined = pertahankan tag yang terpasang; null = lepas tag (kembali "subtipe belum ditentukan").
   */
  tag?: { id: string; severity: number } | null;
}

export interface CorrectionUpdate {
  reviewStatus: 'dikonfirmasi' | 'keliru' | 'dikoreksi';
  classId: string;
  severity: number | null;
  severitySource: SeveritySource;
  exposure: number | null;
  riskScore: number | null;
  priorityBand: string | null;
  conditionLabel: string | null;
  conditionTagId: string | null;
}

export type CorrectionPlan = { ok: true; update: CorrectionUpdate } | { ok: false; error: string };

/**
 * Kolom risiko Detection untuk kelas + Exposure + konteks kondisi tertentu (dipakai juga saat kelas temuan berubah).
 * Tanpa Exposure skor dikosongkan, tetapi Severity yang sudah ditetapkan tetap disimpan. Untuk Monitoring Kepatuhan
 * dan rambu normal, Severity, skor, dan pita dikosongkan, bukan ditebak.
 */
export function riskFields(profile: ConditionProfile, exposure: number | null, ctx: ConditionContext = {}) {
  const a = assessWithCondition(profile, exposure, ctx);
  if (a.scored) {
    return { severity: a.severity as number | null, severitySource: a.severitySource, exposure: a.exposure as number | null, riskScore: a.score as number | null, priorityBand: a.band as string | null };
  }
  const resolved = a.reason === 'tanpa_exposure' ? resolveConditionSeverity(profile, ctx) : null;
  return {
    severity: (resolved?.severity ?? null) as number | null,
    severitySource: (resolved?.source ?? 'bawaan') as SeveritySource,
    exposure: null as number | null, // tanpa skor -> tanpa exposure tersimpan (konsisten dengan perilaku sebelumnya)
    riskScore: null as number | null,
    priorityBand: null as string | null,
  };
}

export function planCorrection(state: DetectionState, req: CorrectionRequest): CorrectionPlan {
  const manual = state.severitySource === 'petugas' && isSeverity(state.severity) ? state.severity : null;
  const stateCtx: ConditionContext = { severityOverride: manual, condition: state.conditionLabel ?? null, tagSeverity: state.tagSeverity ?? null };
  const keepCondition = { conditionLabel: state.conditionLabel ?? null, conditionTagId: state.conditionTagId ?? null };
  const group = state.classProfile.categoryGroup;

  switch (req.kind) {
    case 'dikonfirmasi':
    case 'keliru':
      return {
        ok: true,
        update: { reviewStatus: req.kind, classId: state.classId, ...riskFields(state.classProfile, state.exposure, stateCtx), ...keepCondition },
      };

    case 'kelas_diubah': {
      if (!req.newClass) return { ok: false, error: 'Kelas baru wajib diisi.' };
      if (req.newClass.id === state.classId) return { ok: false, error: 'Kelas baru sama dengan kelas saat ini.' };
      return {
        ok: true,
        update: {
          reviewStatus: 'dikoreksi',
          classId: req.newClass.id,
          ...riskFields(req.newClass.profile, state.exposure, {}),
          // Hasil Tahap 2 milik kelas lama tidak berlaku pada kelas baru.
          conditionLabel: null,
          conditionTagId: null,
        },
      };
    }

    case 'severity_diubah': {
      if (group !== 'keselamatan_infrastruktur') return { ok: false, error: 'Severity hanya berlaku untuk kelompok Keselamatan Infrastruktur.' };
      if (!isSeverity(req.severity)) return { ok: false, error: 'Severity harus 1, 2, atau 3.' };
      if (state.classProfile.hasConditionStage && state.conditionLabel === 'normal') {
        return { ok: false, error: 'Rambu berkondisi normal tidak memiliki skor risiko. Ubah kondisinya menjadi rusak terlebih dahulu.' };
      }
      return {
        ok: true,
        update: {
          reviewStatus: 'dikoreksi',
          classId: state.classId,
          ...riskFields(state.classProfile, state.exposure, { ...stateCtx, severityOverride: req.severity }),
          ...keepCondition,
        },
      };
    }

    case 'kondisi_diubah': {
      if (!state.classProfile.hasConditionStage || group !== 'keselamatan_infrastruktur') {
        return { ok: false, error: 'Kondisi hanya berlaku untuk kelas dengan Tahap 2 (rambu).' };
      }
      if (!isConditionLabel(req.condition)) return { ok: false, error: 'Kondisi harus "normal" atau "damaged".' };

      if (req.condition === 'normal') {
        if (req.tag) return { ok: false, error: 'Tag subtipe hanya untuk rambu rusak.' };
        return {
          ok: true,
          update: {
            reviewStatus: 'dikoreksi',
            classId: state.classId,
            ...riskFields(state.classProfile, state.exposure, { condition: 'normal' }),
            conditionLabel: 'normal',
            conditionTagId: null,
          },
        };
      }

      // damaged
      const wasDamaged = state.conditionLabel === 'damaged';
      const kept = wasDamaged && state.conditionTagId && isSeverity(state.tagSeverity) ? { id: state.conditionTagId, severity: state.tagSeverity } : null;
      const tag = req.tag !== undefined ? req.tag : kept;
      return {
        ok: true,
        update: {
          reviewStatus: 'dikoreksi',
          classId: state.classId,
          // Tag yang baru dipilih menggantikan Severity manual; tanpa tag baru, Severity manual lama tetap berlaku.
          ...riskFields(state.classProfile, state.exposure, {
            condition: 'damaged',
            tagSeverity: tag?.severity ?? null,
            severityOverride: req.tag ? null : manual,
          }),
          conditionLabel: 'damaged',
          conditionTagId: tag?.id ?? null,
        },
      };
    }
  }
}
