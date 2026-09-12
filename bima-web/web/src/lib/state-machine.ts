export type SurveySessionStatus =
  | 'berlangsung'
  | 'selesai_menunggu_submit'
  | 'menunggu_review'
  | 'disetujui'
  | 'ditolak'
  | 'perlu_perbaikan';

export type MediaAssetStatus =
  | 'queued'
  | 'uploading'
  | 'uploaded'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'deleted';

export interface ValidationContext {
  activeMediaCount?: number;
  processingMediaCount?: number;
  failedMediaCount?: number;
  unresolvedConflictCount?: number;
  rejectReason?: string;
  role?: string;
}

export class StateMachineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StateMachineError';
  }
}

/**
 * Validates whether a SurveySession can transition from currentStatus to nextStatus
 */
export function validateSurveySessionTransition(
  currentStatus: SurveySessionStatus,
  nextStatus: SurveySessionStatus,
  context: ValidationContext = {}
): { allowed: boolean; reason?: string } {
  // 1. berlangsung -> selesai_menunggu_submit (Akhiri Survei)
  if (currentStatus === 'berlangsung' && nextStatus === 'selesai_menunggu_submit') {
    return { allowed: true };
  }

  // 2. selesai_menunggu_submit -> menunggu_review (Submit)
  if (currentStatus === 'selesai_menunggu_submit' && nextStatus === 'menunggu_review') {
    if ((context.processingMediaCount ?? 0) > 0) {
      return {
        allowed: false,
        reason: `Tidak dapat submit: Masih ada ${context.processingMediaCount} media yang sedang diproses atau diupload.`,
      };
    }
    if ((context.failedMediaCount ?? 0) > 0) {
      return {
        allowed: false,
        reason: `Tidak dapat submit: Masih ada ${context.failedMediaCount} media gagal. Hapus atau proses ulang media tersebut sebelum submit.`,
      };
    }
    if ((context.unresolvedConflictCount ?? 0) > 0) {
      return {
        allowed: false,
        reason: `Tidak dapat submit: Terdapat ${context.unresolvedConflictCount} konflik kelas yang belum diselesaikan.`,
      };
    }
    return { allowed: true };
  }

  // 3. menunggu_review -> disetujui (Approve)
  if (currentStatus === 'menunggu_review' && nextStatus === 'disetujui') {
    if (context.role !== 'admin') {
      return { allowed: false, reason: 'Hanya admin yang berhak menyetujui survei.' };
    }
    return { allowed: true };
  }

  // 4. menunggu_review -> ditolak (Reject)
  if (currentStatus === 'menunggu_review' && nextStatus === 'ditolak') {
    if (context.role !== 'admin') {
      return { allowed: false, reason: 'Hanya admin yang berhak menolak survei.' };
    }
    if (!context.rejectReason || context.rejectReason.trim() === '') {
      return { allowed: false, reason: 'Admin wajib memilih alasan penolakan survei.' };
    }
    return { allowed: true };
  }

  // 5. ditolak -> perlu_perbaikan (Buat Revisi)
  if (currentStatus === 'ditolak' && nextStatus === 'perlu_perbaikan') {
    return { allowed: true };
  }

  // 6. perlu_perbaikan -> menunggu_review (Re-submit)
  if (currentStatus === 'perlu_perbaikan' && nextStatus === 'menunggu_review') {
    if ((context.processingMediaCount ?? 0) > 0) {
      return {
        allowed: false,
        reason: `Tidak dapat re-submit: Masih ada ${context.processingMediaCount} media dalam proses.`,
      };
    }
    if ((context.failedMediaCount ?? 0) > 0) {
      return {
        allowed: false,
        reason: `Tidak dapat re-submit: Masih ada media gagal. Hapus atau ulangi proses sebelum submit.`,
      };
    }
    if ((context.unresolvedConflictCount ?? 0) > 0) {
      return {
        allowed: false,
        reason: `Tidak dapat re-submit: Terdapat ${context.unresolvedConflictCount} konflik kelas yang belum diselesaikan.`,
      };
    }
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Transisi status tidak valid: dari "${currentStatus}" ke "${nextStatus}".`,
  };
}

/**
 * Validates whether a MediaAsset can transition from currentStatus to nextStatus
 */
export function validateMediaAssetTransition(
  currentStatus: MediaAssetStatus,
  nextStatus: MediaAssetStatus
): { allowed: boolean; reason?: string } {
  if (nextStatus === 'deleted') {
    return { allowed: true };
  }

  const validTransitions: Record<MediaAssetStatus, MediaAssetStatus[]> = {
    queued: ['uploading', 'failed', 'deleted'],
    uploading: ['uploaded', 'failed', 'deleted'],
    uploaded: ['processing', 'failed', 'deleted'],
    processing: ['completed', 'failed', 'deleted'],
    completed: ['processing', 'deleted'], // Allow re-processing if retry triggered
    failed: ['processing', 'queued', 'deleted'], // Allow retry
    deleted: [],
  };

  const allowedNext = validTransitions[currentStatus] || [];
  if (allowedNext.includes(nextStatus)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Transisi media status tidak valid: dari "${currentStatus}" ke "${nextStatus}".`,
  };
}
