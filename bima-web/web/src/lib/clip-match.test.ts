import test from 'node:test';
import assert from 'node:assert/strict';
import { clipMatchNote, matchEvaluatedClip, normalizeFileName, type ClipRef } from './clip-match';

const clips: ClipRef[] = [
  { id: 'c1', fileName: '20260920_080304-002-00.01.17.012-00.02.17.012-seg2.mp4', durationSeconds: 60 },
  { id: 'c2', fileName: '20260920_080304-002-00.00.17.012-00.01.17.012-seg1.mp4', durationSeconds: 61 },
];

test('nama dan durasi cocok -> klip terevaluasi', () => {
  const m = matchEvaluatedClip('20260920_080304-002-00.01.17.012-00.02.17.012-seg2.mp4', 60.82, clips);
  assert.equal(m.status, 'cocok');
  assert.equal(m.status === 'cocok' && m.clip.id, 'c1');
});

test('nama tidak dikenal -> belum dievaluasi', () => {
  assert.equal(matchEvaluatedClip('video_baru.mp4', 60, clips).status, 'tidak_ada');
});

test('nama sama tetapi durasi jauh berbeda -> TIDAK dianggap terevaluasi, dengan catatan', () => {
  const m = matchEvaluatedClip('20260920_080304-002-00.01.17.012-00.02.17.012-seg2.mp4', 120, clips);
  assert.equal(m.status, 'nama_cocok_durasi_berbeda');
  assert.match(clipMatchNote(m)!, /durasi berbeda 60\.0 detik/);
});

test('nama sama tetapi durasi tak diketahui -> tidak dianggap cocok', () => {
  const m = matchEvaluatedClip('20260920_080304-002-00.01.17.012-00.02.17.012-seg2.mp4', null, clips);
  assert.equal(m.status, 'nama_cocok_durasi_berbeda');
  assert.match(clipMatchNote(m)!, /tidak dapat dibaca/);
});

test('huruf besar/kecil, spasi, dan path unduhan diabaikan pada nama', () => {
  assert.equal(normalizeFileName('C:\\Users\\x\\ Seg2.MP4 '), 'seg2.mp4');
  const m = matchEvaluatedClip('  C:\\unduh\\20260920_080304-002-00.01.17.012-00.02.17.012-SEG2.MP4', 60, clips);
  assert.equal(m.status, 'cocok');
});

test('tidak ada catatan untuk kecocokan penuh atau tidak ada', () => {
  assert.equal(clipMatchNote({ status: 'tidak_ada' }), null);
  assert.equal(clipMatchNote({ status: 'cocok', clip: clips[0] }), null);
});
