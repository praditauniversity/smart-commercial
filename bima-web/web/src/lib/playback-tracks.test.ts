import test from 'node:test';
import assert from 'node:assert/strict';
import { boxAt, iou, linkTracksToDetections, parsePlaybackData, selectPlaybackTracks, trackStatus, type PlaybackTrack } from './playback-tracks';
import type { DetectionView } from './media-view';

const bbox = (x: number, y: number, w = 0.2, h = 0.2) => JSON.stringify({ x, y, width: w, height: h });
const P = (t: number, x: number, y = 0.4, w = 0.2, h = 0.2, c = 0.9): PlaybackTrack['points'][number] => [t, x, y, w, h, c];

const det = (id: string, over: Partial<DetectionView> = {}): DetectionView => ({
  id, mediaAssetId: 'm', frameIndex: 0, timestampSeconds: 1, className: 'sign', bbox: bbox(0.4, 0.4), confidence: 0.9,
  severity: null, severitySource: 'bawaan', exposure: null, riskScore: null, priorityBand: null, reviewStatus: 'belum_ditinjau', ...over,
});

test('iou: identik 1, terpisah 0', () => {
  const a = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };
  assert.ok(Math.abs(iou(a, a) - 1) < 1e-9);
  assert.equal(iou(a, { x: 0.6, y: 0.6, width: 0.1, height: 0.1 }), 0);
});

test('boxAt: interpolasi linear di antara dua titik', () => {
  const tr: PlaybackTrack = { id: 1, classId: 'c', className: 'sign', detectionIds: [], points: [P(0, 0.2), P(1, 0.6)] };
  const b = boxAt(tr, 0.25, 1, 2.5)!;
  assert.ok(Math.abs(b.x - 0.3) < 1e-9);
  assert.equal(boxAt(tr, 0, 1, 2.5)!.x, 0.2);
});

test('boxAt: ditahan setengah selang di ujung, lalu hilang', () => {
  const tr: PlaybackTrack = { id: 1, classId: 'c', className: 'sign', detectionIds: [], points: [P(2, 0.2), P(3, 0.3)] };
  assert.equal(boxAt(tr, 1.6, 1, 2.5)?.x, 0.2); // 0.4 detik sebelum titik pertama (<= 0.5)
  assert.equal(boxAt(tr, 1.4, 1, 2.5), null);
  assert.equal(boxAt(tr, 3.4, 1, 2.5)?.x, 0.3);
  assert.equal(boxAt(tr, 3.6, 1, 2.5), null);
});

test('boxAt: celah lebih besar dari maxGap tidak diinterpolasi', () => {
  const tr: PlaybackTrack = { id: 1, classId: 'c', className: 'sign', detectionIds: [], points: [P(0, 0.2), P(5, 0.8)] };
  assert.equal(boxAt(tr, 2.5, 0.2, 0.6), null);
  assert.equal(boxAt(tr, 0.05, 0.2, 0.6)?.x, 0.2);
  assert.equal(boxAt(tr, 4.95, 0.2, 0.6)?.x, 0.8);
});

test('link: temuan ditautkan ke lintasan sekelas dengan IoU tertinggi pada waktunya', () => {
  const tracks = [
    { id: 0, classId: 'sign', className: 'sign', points: [P(1, 0.4), P(1.2, 0.41)] },
    { id: 1, classId: 'sign', className: 'sign', points: [P(1, 0.05), P(1.2, 0.05)] },
    { id: 2, classId: 'banner', className: 'banner', points: [P(1, 0.4)] },
  ];
  const out = linkTracksToDetections(tracks, [{ id: 'd1', classId: 'sign', className: 'sign', timestampSeconds: 1, bbox: bbox(0.4, 0.4), confidence: 0.9 }], { timeTolerance: 0.1, iouMin: 0.4 });
  assert.deepEqual(out.find((t) => t.id === 0)!.detectionIds, ['d1']);
  assert.deepEqual(out.find((t) => t.id === 1)!.detectionIds, []);
  assert.deepEqual(out.find((t) => t.id === 2)!.detectionIds, []); // kelas berbeda
  assert.equal(out.length, 3);
});

test('link: dua temuan pada waktu berbeda dapat berbagi satu lintasan', () => {
  const tracks = [{ id: 0, classId: 'sign', className: 'sign', points: [P(1, 0.4), P(3, 0.42)] }];
  const dets = [
    { id: 'a', classId: 'sign', className: 'sign', timestampSeconds: 1, bbox: bbox(0.4, 0.4), confidence: 0.9 },
    { id: 'b', classId: 'sign', className: 'sign', timestampSeconds: 3, bbox: bbox(0.42, 0.4), confidence: 0.8 },
  ];
  assert.deepEqual(linkTracksToDetections(tracks, dets, { timeTolerance: 0.1, iouMin: 0.4 })[0].detectionIds, ['a', 'b']);
});

test('link: temuan tanpa pasangan dibuatkan lintasan satu titik dari kotaknya sendiri', () => {
  const out = linkTracksToDetections([], [{ id: 'x', classId: 'sign', className: 'sign', timestampSeconds: 2, bbox: bbox(0.3, 0.3), confidence: 0.3 }], { timeTolerance: 0.1, iouMin: 0.4 });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].detectionIds, ['x']);
  assert.deepEqual(out[0].points, [[2, 0.3, 0.3, 0.2, 0.2, 0.3]]);
});

test('trackStatus: benar > belum ditinjau > keliru; tanpa tautan = belum ditinjau', () => {
  const tr: PlaybackTrack = { id: 1, classId: 'c', className: 'sign', detectionIds: ['a', 'b'], points: [P(0, 0.2)] };
  const m = (a: string, b: string) => new Map([['a', det('a', { reviewStatus: a })], ['b', det('b', { reviewStatus: b })]]);
  assert.equal(trackStatus(tr, m('keliru', 'dikonfirmasi')).reviewStatus, 'dikonfirmasi');
  assert.equal(trackStatus(tr, m('keliru', 'belum_ditinjau')).reviewStatus, 'belum_ditinjau');
  assert.equal(trackStatus(tr, m('keliru', 'keliru')).reviewStatus, 'keliru');
  assert.deepEqual(trackStatus({ ...tr, detectionIds: [] }, new Map()), { reviewStatus: 'belum_ditinjau', display: null, linked: false });
});

test('selectPlaybackTracks (koreksi): lintasan temuan keliru tidak digambar', () => {
  const tracks: PlaybackTrack[] = [
    { id: 1, classId: 'c', className: 'sign', detectionIds: ['ok'], points: [P(0, 0.2)] },
    { id: 2, classId: 'c', className: 'sign', detectionIds: ['bad'], points: [P(0, 0.5)] },
    { id: 3, classId: 'c', className: 'sign', detectionIds: [], points: [P(0, 0.7)] },
  ];
  const dets = [det('ok', { reviewStatus: 'dikonfirmasi' }), det('bad', { reviewStatus: 'keliru' })];
  const ids = (r: ReturnType<typeof selectPlaybackTracks>) => r.map((x) => x.track.id);
  assert.deepEqual(ids(selectPlaybackTracks(tracks, dets, { mode: 'koreksi', selectedIds: [], includeUnlinked: false })), [1]);
  assert.deepEqual(ids(selectPlaybackTracks(tracks, dets, { mode: 'koreksi', selectedIds: [], includeUnlinked: true })), [1, 3]);
  assert.deepEqual(ids(selectPlaybackTracks(tracks, dets, { mode: 'koreksi', selectedIds: ['bad'], includeUnlinked: false })), [2]);
  assert.deepEqual(ids(selectPlaybackTracks(tracks, dets, { mode: 'koreksi', selectedIds: [], includeUnlinked: false, showAll: true })), [1, 2]);
});

test('parsePlaybackData: menolak data rusak', () => {
  assert.equal(parsePlaybackData(null), null);
  assert.equal(parsePlaybackData('{bukan json'), null);
  assert.equal(parsePlaybackData('{"version":2}'), null);
  assert.ok(parsePlaybackData('{"version":1,"step":0.2,"maxGap":0.6,"tracks":[]}'));
});
