/** Status alur kerja di dashboard per peran (murni, mudah diuji). */
import type { Overview, SessionSummary } from './overview';

export interface WorkflowItemData {
  label: string;
  value: string | number;
  hint: string;
  href?: string;
  tone: 'amber' | 'blue' | 'emerald' | 'rose' | 'slate';
}

const count = (sessions: SessionSummary[], statuses: string[]) => sessions.filter((s) => statuses.includes(s.status)).length;

/**
 * Supervisor/admin mengikuti alur: surveyor entri temuan -> supervisor koreksi -> review dan persetujuan.
 * Surveyor melihat posisi sesinya sendiri: siap diajukan, menunggu review, dan yang perlu diperbaiki.
 */
export function workflowFor(role: 'surveyor' | 'supervisor' | 'admin', sessions: SessionSummary[], totals: Overview['totals'], reviewsHref: string): WorkflowItemData[] {
  if (role === 'surveyor') {
    const ready = count(sessions, ['selesai_menunggu_submit']);
    const waiting = count(sessions, ['menunggu_review']);
    const fix = count(sessions, ['ditolak', 'perlu_perbaikan']);
    return [
      { label: 'Siap diajukan', value: ready, hint: 'sesi selesai, belum dikirim ke supervisor', href: '/surveyor/sessions?status=selesai_menunggu_submit', tone: ready > 0 ? 'blue' : 'slate' },
      { label: 'Menunggu review', value: waiting, hint: 'menunggu disetujui/direview supervisor', href: '/surveyor/sessions?status=menunggu_review', tone: 'slate' },
      { label: 'Perlu perbaikan', value: fix, hint: 'ditolak atau draf revisi', href: '/surveyor/sessions?status=perlu_perbaikan', tone: fix > 0 ? 'rose' : 'slate' },
    ];
  }
  const entering = count(sessions, ['berlangsung', 'selesai_menunggu_submit']);
  const pending = count(sessions, ['menunggu_review']);
  const allReviewed = totals.validFindings > 0 && totals.reviewedFindings >= totals.validFindings;
  return [
    { label: 'Entri surveyor', value: entering, hint: 'sesi sedang dientri atau belum diajukan', tone: 'blue' },
    { label: 'Koreksi supervisor', value: `${totals.reviewedFindings}/${totals.validFindings}`, hint: 'deteksi sudah ditinjau', tone: allReviewed ? 'emerald' : 'slate' },
    { label: 'Review & persetujuan', value: pending, hint: 'pengajuan menunggu disetujui/direview', href: reviewsHref, tone: pending > 0 ? 'amber' : 'slate' },
  ];
}
