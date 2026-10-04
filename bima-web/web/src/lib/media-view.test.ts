import test from 'node:test';
import assert from 'node:assert/strict';
import { isAcceptedFinding, nearestFrame, reviewLabel, visibleBoxes } from './media-view';

const D = (id: string, reviewStatus: string) => ({ id, reviewStatus });
const dets = [D('a', 'dikonfirmasi'), D('b', 'keliru'), D('c', 'belum_ditinjau'), D('d', 'dikoreksi')];

test('pratinjau pada media yang sudah ditinjau: hanya yang benar (dikonfirmasi/dikoreksi)', () => {
  const ids = visibleBoxes(dets, { mode: 'pratinjau', selectedIds: [], mediaHasReview: true }).map((d) => d.id);
  assert.deepEqual(ids, ['a', 'd']);
});

test('pratinjau pada media yang belum pernah ditinjau: semua kecuali keliru agar hasil AI terlihat', () => {
  const ids = visibleBoxes(dets, { mode: 'pratinjau', selectedIds: [], mediaHasReview: false }).map((d) => d.id);
  assert.deepEqual(ids, ['a', 'c', 'd']);
});

test('koreksi: semua kecuali keliru, termasuk yang belum ditinjau', () => {
  const ids = visibleBoxes(dets, { mode: 'koreksi', selectedIds: [], mediaHasReview: true }).map((d) => d.id);
  assert.deepEqual(ids, ['a', 'c', 'd']);
});

test('ada pilihan: hanya kotak terpilih yang tampil (keliru muncul saat dipilih, tanpa kotak lain)', () => {
  for (const mode of ['pratinjau', 'koreksi'] as const) {
    assert.deepEqual(visibleBoxes(dets, { mode, selectedIds: ['b'], mediaHasReview: true }).map((d) => d.id), ['b']);
    assert.deepEqual(visibleBoxes(dets, { mode, selectedIds: ['b', 'c'], mediaHasReview: true }).map((d) => d.id), ['b', 'c']);
  }
  // pilihan dari frame lain tidak memunculkan apa pun di frame ini
  assert.deepEqual(visibleBoxes(dets, { mode: 'koreksi', selectedIds: ['zzz'], mediaHasReview: true }), []);
});

test('label status tinjau', () => {
  assert.equal(isAcceptedFinding('dikonfirmasi'), true);
  assert.equal(isAcceptedFinding('keliru'), false);
  assert.deepEqual(reviewLabel('belum_ditinjau'), { text: 'Belum ditinjau', tone: 'belum' });
  assert.equal(reviewLabel('dikoreksi').tone, 'benar');
  assert.equal(reviewLabel('keliru').tone, 'keliru');
});

test('showAll (slider digeser): semua kotak tampil, tetapi pilihan tetap menang', () => {
  for (const mode of ['pratinjau', 'koreksi'] as const) {
    assert.deepEqual(visibleBoxes(dets, { mode, selectedIds: [], mediaHasReview: true, showAll: true }).map((d) => d.id), ['a', 'b', 'c', 'd']);
    assert.deepEqual(visibleBoxes(dets, { mode, selectedIds: ['c'], mediaHasReview: true, showAll: true }).map((d) => d.id), ['c']);
  }
});

const F = (frameIndex: number, timestampSeconds: number) => ({ id: `f${frameIndex}`, frameIndex, timestampSeconds, imageUrl: '' });

test('nearestFrame: memilih frame sampel terdekat dari posisi putar', () => {
  const frames = [F(0, 0), F(1, 2), F(2, 4)];
  assert.equal(nearestFrame(frames, 0.9, 1)?.frameIndex, 0);
  assert.equal(nearestFrame(frames, 1.1, 1)?.frameIndex, 1);
  assert.equal(nearestFrame(frames, 3.9, 1)?.frameIndex, 2);
});

test('nearestFrame: null bila terlalu jauh dari semua frame sampel atau tanpa frame', () => {
  assert.equal(nearestFrame([F(0, 0), F(1, 2)], 9, 1), null);
  assert.equal(nearestFrame([], 0, 1), null);
});
