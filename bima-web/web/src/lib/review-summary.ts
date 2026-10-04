/**
 * Ringkasan hasil koreksi supervisor untuk antrean review. Murni (tanpa I/O).
 * - benar: dikonfirmasi, atau dikoreksi (kelas/severity/kondisi) lalu dipertahankan.
 * - keliru: false positive yang ditandai supervisor.
 * - belumDitinjau: temuan model yang belum disentuh supervisor.
 * - terlewat: false negative yang dicatat supervisor (objek ada di lapangan tetapi tidak terdeteksi); bukan temuan model.
 */
import { isAcceptedFinding } from './media-view';

export interface ReviewCounts {
  benar: number;
  keliru: number;
  belumDitinjau: number;
  terlewat: number;
  /** Jumlah temuan model (benar + keliru + belumDitinjau); terlewat tidak termasuk. */
  totalTemuan: number;
}

export function summarizeReview(reviewStatuses: readonly string[], missedCount: number): ReviewCounts {
  let benar = 0;
  let keliru = 0;
  let belumDitinjau = 0;
  for (const s of reviewStatuses) {
    if (isAcceptedFinding(s)) benar++;
    else if (s === 'keliru') keliru++;
    else belumDitinjau++;
  }
  return { benar, keliru, belumDitinjau, terlewat: missedCount, totalTemuan: benar + keliru + belumDitinjau };
}

/** Sama dengan summarizeReview, dari hasil groupBy (status -> jumlah). */
export function summarizeReviewGroups(groups: readonly { reviewStatus: string; count: number }[], missedCount: number): ReviewCounts {
  const expanded: string[] = [];
  for (const g of groups) for (let i = 0; i < g.count; i++) expanded.push(g.reviewStatus);
  return summarizeReview(expanded, missedCount);
}
