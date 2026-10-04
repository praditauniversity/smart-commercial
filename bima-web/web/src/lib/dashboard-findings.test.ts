import test from 'node:test';
import assert from 'node:assert/strict';
import { groupFindingsByFrame, type FindingRow } from './dashboard-findings';

const row = (id: string, media: string, frame: number | null, score: number | null, img: string | null = `/img/${media}-${frame}.webp`): FindingRow => ({
  id, sessionId: 's1', sessionName: 'Sesi', mediaAssetId: media, frameIndex: frame, className: 'pavedroad_pothole', displayName: 'Jalan berlubang',
  confidence: 0.8, band: score === 9 ? 'kritikal' : score === 2 ? 'rendah' : null, score, condition: null, bbox: { x: 0, y: 0, width: 0.1, height: 0.1 }, imageUrl: img,
});

test('temuan pada frame yang sama digabung dalam satu kartu dengan skor terburuk', () => {
  const tiles = groupFindingsByFrame([row('a', 'm1', 0, 9), row('b', 'm1', 0, 2), row('c', 'm1', 1, 2)], 10);
  assert.equal(tiles.length, 2);
  assert.equal(tiles[0].boxes.length, 2);
  assert.equal(tiles[0].worstScore, 9);
  assert.equal(tiles[0].worstBand, 'kritikal');
});

test('baris tanpa gambar dilewati dan jumlah kartu dibatasi tanpa memotong kotak kartu yang sudah ada', () => {
  const tiles = groupFindingsByFrame([row('a', 'm1', 0, 9, null), row('b', 'm2', 0, 2), row('c', 'm3', 0, 2), row('d', 'm2', 0, 2)], 2);
  assert.deepEqual(tiles.map((t) => t.key), ['m2:0', 'm3:0']);
  assert.equal(tiles[0].boxes.length, 2);
});

test('gambar tunggal tanpa frame index memakai kunci img', () => {
  assert.equal(groupFindingsByFrame([row('a', 'm1', null, null)], 5)[0].key, 'm1:img');
});
