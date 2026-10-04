import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOverview, summarizeSession, type OverviewDetection, type OverviewSessionInput } from './overview';

const det = (className: string, group: string, band: any, score: number | null, reviewStatus = 'belum_ditinjau'): OverviewDetection => ({
  className, displayName: className, group, band, score, reviewStatus,
});
const session = (id: string, detections: OverviewDetection[], extra: Partial<OverviewSessionInput> = {}): OverviewSessionInput => ({
  id, name: id, status: 'berlangsung', surveyDate: '2026-10-01', surveyor: { id: 'u1', name: 'S1' }, zone: null, mediaCount: 1, missedCount: 0, detections, ...extra,
});

test('skor lokasi = temuan valid terburuk; Monitoring Kepatuhan tidak ikut skor', () => {
  const s = summarizeSession(session('a', [
    det('weeds', 'keselamatan_infrastruktur', 'sedang', 3),
    det('pavedroad_pothole', 'keselamatan_infrastruktur', 'kritikal', 9),
    det('banner', 'monitoring_kepatuhan', null, null),
  ]));
  assert.equal(s.worstBand, 'kritikal');
  assert.equal(s.worstScore, 9);
  assert.equal(s.infraCount, 2);
  assert.equal(s.complianceCount, 1);
  assert.equal(s.bandCounts.kritikal, 1);
  assert.equal(s.bandCounts.belumDinilai, 0);
});

test('temuan "keliru" dikeluarkan dari skor dan hitungan valid, dilaporkan terpisah', () => {
  const s = summarizeSession(session('a', [
    det('pavedroad_pothole', 'keselamatan_infrastruktur', 'kritikal', 9, 'keliru'),
    det('weeds', 'keselamatan_infrastruktur', 'rendah', 1),
  ]));
  assert.equal(s.worstBand, 'rendah');
  assert.equal(s.falsePositiveCount, 1);
  assert.equal(s.valid, 1);
});

test('sesi tanpa zona: temuan infrastruktur masuk "belum dinilai", bukan ditebak', () => {
  const s = summarizeSession(session('a', [det('weeds', 'keselamatan_infrastruktur', null, null)]));
  assert.equal(s.bandCounts.belumDinilai, 1);
  assert.equal(s.worstBand, null);
});

test('sesi hanya Monitoring Kepatuhan: tidak ada skor lokasi', () => {
  const s = summarizeSession(session('a', [det('banner', 'monitoring_kepatuhan', null, null), det('house_notice', 'monitoring_kepatuhan', null, null)]));
  assert.equal(s.worstScore, null);
  assert.equal(s.complianceCount, 2);
  assert.equal(s.infraCount, 0);
});

test('ringkasan total dan urutan: lokasi paling berisiko di atas', () => {
  const o = buildOverview([
    session('rendah', [det('weeds', 'keselamatan_infrastruktur', 'rendah', 1)], { surveyDate: '2026-10-03' }),
    session('kritikal', [det('pavedroad_pothole', 'keselamatan_infrastruktur', 'kritikal', 9)], { surveyDate: '2026-10-01', missedCount: 2 }),
    session('kosong', [], { surveyDate: '2026-10-05' }),
  ]);
  assert.deepEqual(o.sessions.map((s) => s.id), ['kritikal', 'rendah', 'kosong']);
  assert.equal(o.totals.sessions, 3);
  assert.equal(o.totals.validFindings, 2);
  assert.equal(o.totals.missed, 2);
  assert.equal(o.bands.kritikal, 1);
  assert.equal(o.bands.rendah, 1);
  assert.deepEqual(o.byClass.map((c) => c.className).sort(), ['pavedroad_pothole', 'weeds']);
});

test('jumlah tinjauan: hanya temuan valid yang sudah ditinjau', () => {
  const s = summarizeSession(session('a', [
    det('weeds', 'keselamatan_infrastruktur', 'rendah', 1, 'dikonfirmasi'),
    det('weeds', 'keselamatan_infrastruktur', 'rendah', 1, 'dikoreksi'),
    det('weeds', 'keselamatan_infrastruktur', 'rendah', 1),
    det('weeds', 'keselamatan_infrastruktur', 'rendah', 1, 'keliru'),
  ]));
  assert.equal(s.reviewed, 2);
  assert.equal(s.valid, 3);
});

test('rambu normal: dihitung sebagai normal (tanpa skor), BUKAN "belum dinilai", dan tidak ikut skor lokasi', () => {
  const d = (cond: string | null, band: any, score: number | null): OverviewDetection => ({ className: 'sign', displayName: 'Rambu', group: 'keselamatan_infrastruktur', band, score, reviewStatus: 'belum_ditinjau', condition: cond });
  const s = summarizeSession(session('a', [d('normal', null, null), d('normal', null, null), d('damaged', 'tinggi', 6)]));
  assert.equal(s.normalCount, 2);
  assert.equal(s.infraCount, 1);
  assert.equal(s.bandCounts.belumDinilai, 0);
  assert.equal(s.worstBand, 'tinggi');
  const only = summarizeSession(session('b', [d('normal', null, null)]));
  assert.equal(only.worstScore, null);
  assert.equal(only.normalCount, 1);
  const o = buildOverview([session('a', [d('normal', null, null)]), session('b', [d('normal', null, null)])]);
  assert.equal(o.totals.normalSigns, 2);
});
