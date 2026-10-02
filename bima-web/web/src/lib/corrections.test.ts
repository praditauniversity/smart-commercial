import test from 'node:test';
import assert from 'node:assert/strict';
import { isDetectionCorrectionKind, planCorrection, type DetectionState } from './corrections';

const POTHOLE = { categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 3 };
const WEEDS = { categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 1 };
const BANNER = { categoryGroup: 'monitoring_kepatuhan', defaultSeverity: null };

const base = (over: Partial<DetectionState> = {}): DetectionState => ({
  classId: 'c-pothole',
  classProfile: POTHOLE,
  severity: 3,
  severitySource: 'bawaan',
  exposure: 3,
  ...over,
});

test('jenis koreksi yang dikenal', () => {
  assert.ok(isDetectionCorrectionKind('keliru'));
  assert.ok(!isDetectionCorrectionKind('terlewat')); // terlewat bukan koreksi atas temuan
  assert.ok(!isDetectionCorrectionKind('hapus'));
});

test('dikonfirmasi: skor tidak berubah', () => {
  const p = planCorrection(base(), { kind: 'dikonfirmasi' });
  assert.ok(p.ok);
  assert.equal(p.update.reviewStatus, 'dikonfirmasi');
  assert.equal(p.update.riskScore, 9);
  assert.equal(p.update.priorityBand, 'kritikal');
});

test('keliru: ditandai, tidak diubah kelas/severity-nya', () => {
  const p = planCorrection(base(), { kind: 'keliru' });
  assert.ok(p.ok);
  assert.equal(p.update.reviewStatus, 'keliru');
  assert.equal(p.update.classId, 'c-pothole');
  assert.equal(p.update.severity, 3);
});

test('kelas_diubah: severity kembali ke bawaan kelas baru dan skor dihitung ulang', () => {
  const p = planCorrection(base({ severity: 2, severitySource: 'petugas' }), {
    kind: 'kelas_diubah',
    newClass: { id: 'c-weeds', profile: WEEDS },
  });
  assert.ok(p.ok);
  assert.equal(p.update.classId, 'c-weeds');
  assert.equal(p.update.severity, 1);
  assert.equal(p.update.severitySource, 'bawaan');
  assert.equal(p.update.riskScore, 3); // 1 x 3
  assert.equal(p.update.priorityBand, 'sedang');
  assert.equal(p.update.reviewStatus, 'dikoreksi');
});

test('kelas_diubah ke Monitoring Kepatuhan: skor dan severity dikosongkan', () => {
  const p = planCorrection(base(), { kind: 'kelas_diubah', newClass: { id: 'c-banner', profile: BANNER } });
  assert.ok(p.ok);
  assert.equal(p.update.severity, null);
  assert.equal(p.update.riskScore, null);
  assert.equal(p.update.priorityBand, null);
});

test('kelas_diubah: kelas wajib ada dan harus berbeda', () => {
  assert.deepEqual(planCorrection(base(), { kind: 'kelas_diubah' }), { ok: false, error: 'Kelas baru wajib diisi.' });
  const same = planCorrection(base(), { kind: 'kelas_diubah', newClass: { id: 'c-pothole', profile: POTHOLE } });
  assert.equal(same.ok, false);
});

test('severity_diubah: skor dihitung ulang dan sumbernya "petugas"', () => {
  const p = planCorrection(base({ classId: 'c-sign', classProfile: { categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 2 }, severity: 2 }), {
    kind: 'severity_diubah',
    severity: 3,
  });
  assert.ok(p.ok);
  assert.equal(p.update.severity, 3);
  assert.equal(p.update.severitySource, 'petugas');
  assert.equal(p.update.riskScore, 9);
  assert.equal(p.update.priorityBand, 'kritikal');
});

test('severity_diubah ditolak untuk Monitoring Kepatuhan dan nilai di luar 1-3', () => {
  assert.equal(planCorrection(base({ classProfile: BANNER, severity: null }), { kind: 'severity_diubah', severity: 2 }).ok, false);
  assert.equal(planCorrection(base(), { kind: 'severity_diubah', severity: 4 }).ok, false);
  assert.equal(planCorrection(base(), { kind: 'severity_diubah' }).ok, false);
});

test('sesi tanpa zona: tidak ada skor walau severity diubah (Exposure tidak diketahui)', () => {
  const p = planCorrection(base({ exposure: null, severity: null }), { kind: 'severity_diubah', severity: 3 });
  assert.ok(p.ok);
  assert.equal(p.update.riskScore, null);
  assert.equal(p.update.priorityBand, null);
  assert.equal(p.update.severity, 3); // pilihan petugas tidak hilang
  assert.equal(p.update.severitySource, 'petugas');
});
