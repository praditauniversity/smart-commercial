import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMapMarkers, representativePoint } from './map-points';

test('titik representatif: Point apa adanya, Polygon = rata-rata sudut tanpa titik penutup', () => {
  assert.deepEqual(representativePoint({ type: 'Point', coordinates: [106.8, -6.2] }), [106.8, -6.2]);
  const p = representativePoint({ type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] })!;
  assert.deepEqual(p, [1, 1]);
  assert.equal(representativePoint(null), null);
  assert.equal(representativePoint({ type: 'LineString', coordinates: [[0, 0]] }), null);
});

test('satu penanda per lokasi dengan jumlah, skor terburuk, dan rincian kelas', () => {
  const geo = { type: 'Point', coordinates: [106.8, -6.2] };
  const markers = buildMapMarkers([
    { id: 's1', name: 'Sesi 1', locationAddress: null, surveyorName: 'A', geo, detections: [
      { className: 'pothole', displayName: 'Jalan berlubang', band: 'rendah', score: 2 },
      { className: 'pothole', displayName: 'Jalan berlubang', band: 'kritikal', score: 9 },
      { className: 'weeds', displayName: 'Gulma', band: null, score: null },
    ] },
    { id: 's2', name: 'Tanpa lokasi', locationAddress: null, surveyorName: null, geo: null, detections: [{ className: 'weeds', displayName: 'Gulma', band: null, score: null }] },
  ]);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].count, 3);
  assert.equal(markers[0].worstBand, 'kritikal');
  assert.deepEqual(markers[0].position, [-6.2, 106.8]);
  assert.deepEqual(markers[0].classes[0], { displayName: 'Jalan berlubang', count: 2 });
});
