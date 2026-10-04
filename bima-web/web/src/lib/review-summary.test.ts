import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeReview, summarizeReviewGroups } from './review-summary';

test('benar = dikonfirmasi + dikoreksi; keliru dan belum ditinjau terpisah; terlewat bukan temuan model', () => {
  const r = summarizeReview(['dikonfirmasi', 'dikoreksi', 'keliru', 'belum_ditinjau', 'belum_ditinjau', 'dikonfirmasi'], 3);
  assert.deepEqual(r, { benar: 3, keliru: 1, belumDitinjau: 2, terlewat: 3, totalTemuan: 6 });
});

test('sesi kosong', () => {
  assert.deepEqual(summarizeReview([], 0), { benar: 0, keliru: 0, belumDitinjau: 0, terlewat: 0, totalTemuan: 0 });
});

test('hasil groupBy memberi angka yang sama', () => {
  const r = summarizeReviewGroups([{ reviewStatus: 'dikonfirmasi', count: 4 }, { reviewStatus: 'keliru', count: 2 }, { reviewStatus: 'belum_ditinjau', count: 1 }], 1);
  assert.deepEqual(r, { benar: 4, keliru: 2, belumDitinjau: 1, terlewat: 1, totalTemuan: 7 });
});
