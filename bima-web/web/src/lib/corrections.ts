/**
 * Aturan koreksi petugas (supervisor/admin) atas temuan model. Murni (tanpa I/O).
 *
 * - "dikonfirmasi": temuan benar.
 * - "keliru": temuan salah (false positive); baris tidak dihapus, hanya ditandai agar riwayat tetap ada.
 * - "kelas_diubah": kelas benar berbeda; Severity kembali ke nilai bawaan kelas baru, skor dihitung ulang.
 * - "severity_diubah": mengganti Severity (hanya Keselamatan Infrastruktur); skor dihitung ulang.
 * - "terlewat" (false negative) tidak mengubah temuan mana pun; dicatat terpisah pada sesi/media.
 */
import { assessWithProfile, isSeverity, type ClassRiskProfile } from './risk';

export type DetectionCorrectionKind = 'dikonfirmasi' | 'keliru' | 'kelas_diubah' | 'severity_diubah';
export const DETECTION_CORRECTION_KINDS: readonly DetectionCorrectionKind[] = ['dikonfirmasi', 'keliru', 'kelas_diubah', 'severity_diubah'];

export function isDetectionCorrectionKind(v: unknown): v is DetectionCorrectionKind {
  return typeof v === 'string' && (DETECTION_CORRECTION_KINDS as readonly string[]).includes(v);
}

export interface DetectionState {
  classId: string;
  classProfile: ClassRiskProfile;
  severity: number | null;
  severitySource: string;
  /** Exposure yang berlaku untuk temuan ini (dari zona sesi); null bila sesi tanpa zona. */
  exposure: number | null;
}

export interface CorrectionRequest {
  kind: DetectionCorrectionKind;
  newClass?: { id: string; profile: ClassRiskProfile };
  severity?: number;
}

export interface CorrectionUpdate {
  reviewStatus: 'dikonfirmasi' | 'keliru' | 'dikoreksi';
  classId: string;
  severity: number | null;
  severitySource: 'bawaan' | 'petugas';
  exposure: number | null;
  riskScore: number | null;
  priorityBand: string | null;
}

export type CorrectionPlan = { ok: true; update: CorrectionUpdate } | { ok: false; error: string };

/**
 * Kolom risiko Detection untuk kelas + Exposure tertentu (dipakai saat kelas temuan berubah di jalur mana pun).
 * Tanpa Exposure atau untuk Monitoring Kepatuhan, skor dan pita dikosongkan, bukan ditebak.
 */
export function riskFields(profile: ClassRiskProfile, exposure: number | null, severityOverride: number | null) {
  const a = assessWithProfile(profile, exposure, severityOverride);
  return a.scored
    ? { severity: a.severity, exposure: a.exposure, riskScore: a.score, priorityBand: a.band as string }
    : { severity: null as number | null, exposure: exposure ?? null, riskScore: null as number | null, priorityBand: null as string | null };
}

export function planCorrection(state: DetectionState, req: CorrectionRequest): CorrectionPlan {
  const source = state.severitySource === 'petugas' ? 'petugas' : 'bawaan';
  const keep = { classId: state.classId, severity: state.severity, severitySource: source as 'bawaan' | 'petugas', exposure: state.exposure };
  const current = {
    riskScore: assessWithProfile(state.classProfile, state.exposure, source === 'petugas' ? state.severity : null),
  };

  switch (req.kind) {
    case 'dikonfirmasi':
    case 'keliru': {
      const a = current.riskScore;
      return {
        ok: true,
        update: {
          reviewStatus: req.kind,
          ...keep,
          riskScore: a.scored ? a.score : null,
          priorityBand: a.scored ? a.band : null,
        },
      };
    }
    case 'kelas_diubah': {
      if (!req.newClass) return { ok: false, error: 'Kelas baru wajib diisi.' };
      if (req.newClass.id === state.classId) return { ok: false, error: 'Kelas baru sama dengan kelas saat ini.' };
      const r = riskFields(req.newClass.profile, state.exposure, null);
      return {
        ok: true,
        update: { reviewStatus: 'dikoreksi', classId: req.newClass.id, severitySource: 'bawaan', ...r },
      };
    }
    case 'severity_diubah': {
      if (state.classProfile.categoryGroup !== 'keselamatan_infrastruktur') {
        return { ok: false, error: 'Severity hanya berlaku untuk kelompok Keselamatan Infrastruktur.' };
      }
      if (!isSeverity(req.severity)) return { ok: false, error: 'Severity harus 1, 2, atau 3.' };
      const r = riskFields(state.classProfile, state.exposure, req.severity);
      return {
        ok: true,
        // Severity pilihan petugas tetap disimpan walau skor belum bisa dihitung (mis. sesi tanpa zona).
        update: { reviewStatus: 'dikoreksi', classId: state.classId, severitySource: 'petugas', ...r, severity: req.severity },
      };
    }
  }
}
