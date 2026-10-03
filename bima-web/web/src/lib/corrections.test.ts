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

// ---------------------------------------------------------------------------------------------
// Tahap 2 rambu: kondisi_diubah
// ---------------------------------------------------------------------------------------------
const SIGN = { categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 2, hasConditionStage: true };
const signState = (over: Partial<DetectionState> = {}): DetectionState => ({
  classId: 'c-sign',
  classProfile: SIGN,
  severity: 2,
  severitySource: 'sementara',
  exposure: 3,
  conditionLabel: 'damaged',
  conditionTagId: null,
  tagSeverity: null,
  ...over,
});

test('kondisi_diubah ke normal: skor, severity, dan tag dikosongkan', () => {
  const p = planCorrection(signState({ conditionTagId: 't1', tagSeverity: 3, severity: 3, severitySource: 'tag' }), { kind: 'kondisi_diubah', condition: 'normal' });
  assert.ok(p.ok);
  assert.equal(p.update.conditionLabel, 'normal');
  assert.equal(p.update.conditionTagId, null);
  assert.equal(p.update.severity, null);
  assert.equal(p.update.riskScore, null);
  assert.equal(p.update.priorityBand, null);
});

test('kondisi_diubah ke damaged tanpa tag: severity sementara 2, skor 6 (exposure 3)', () => {
  const p = planCorrection(signState({ conditionLabel: 'normal', severity: null, severitySource: 'bawaan' }), { kind: 'kondisi_diubah', condition: 'damaged' });
  assert.ok(p.ok);
  assert.equal(p.update.severity, 2);
  assert.equal(p.update.severitySource, 'sementara');
  assert.equal(p.update.riskScore, 6);
  assert.equal(p.update.conditionTagId, null);
});

test('memilih tag: severity dari tag (panel_hilang = 3), skor 9 kritikal, sumber "tag"', () => {
  const p = planCorrection(signState(), { kind: 'kondisi_diubah', condition: 'damaged', tag: { id: 't-hilang', severity: 3 } });
  assert.ok(p.ok);
  assert.equal(p.update.severity, 3);
  assert.equal(p.update.severitySource, 'tag');
  assert.equal(p.update.riskScore, 9);
  assert.equal(p.update.priorityBand, 'kritikal');
  assert.equal(p.update.conditionTagId, 't-hilang');
});

test('tag pudar (1) pada exposure rendah -> skor 1 rendah', () => {
  const p = planCorrection(signState({ exposure: 1 }), { kind: 'kondisi_diubah', condition: 'damaged', tag: { id: 't-pudar', severity: 1 } });
  assert.ok(p.ok);
  assert.equal(p.update.riskScore, 1);
  assert.equal(p.update.priorityBand, 'rendah');
});

test('tag baru menggantikan severity manual lama; tanpa tag baru severity manual tetap', () => {
  const manual = signState({ severity: 1, severitySource: 'petugas' });
  const withTag = planCorrection(manual, { kind: 'kondisi_diubah', condition: 'damaged', tag: { id: 't', severity: 3 } });
  assert.ok(withTag.ok);
  assert.equal(withTag.update.severity, 3);
  assert.equal(withTag.update.severitySource, 'tag');
  const noTag = planCorrection(manual, { kind: 'kondisi_diubah', condition: 'damaged' });
  assert.ok(noTag.ok);
  assert.equal(noTag.update.severity, 1);
  assert.equal(noTag.update.severitySource, 'petugas');
});

test('menyimpan ulang kondisi damaged mempertahankan tag yang sudah terpasang', () => {
  const p = planCorrection(signState({ conditionTagId: 't-miring', tagSeverity: 2, severity: 2, severitySource: 'tag' }), { kind: 'kondisi_diubah', condition: 'damaged' });
  assert.ok(p.ok);
  assert.equal(p.update.conditionTagId, 't-miring');
  assert.equal(p.update.severitySource, 'tag');
});

test('kondisi_diubah ditolak untuk kelas tanpa Tahap 2 (bukan rambu)', () => {
  const pothole = signState({ classProfile: { categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 3, hasConditionStage: false }, conditionLabel: null });
  const p = planCorrection(pothole, { kind: 'kondisi_diubah', condition: 'damaged', tag: { id: 't', severity: 3 } });
  assert.equal(p.ok, false);
  const banner = signState({ classProfile: { categoryGroup: 'monitoring_kepatuhan', defaultSeverity: null }, conditionLabel: null });
  assert.equal(planCorrection(banner, { kind: 'kondisi_diubah', condition: 'normal' }).ok, false);
});

test('kondisi tidak valid dan tag pada rambu normal ditolak', () => {
  assert.equal(planCorrection(signState(), { kind: 'kondisi_diubah', condition: 'rusak' }).ok, false);
  assert.equal(planCorrection(signState(), { kind: 'kondisi_diubah' }).ok, false);
  assert.equal(planCorrection(signState(), { kind: 'kondisi_diubah', condition: 'normal', tag: { id: 't', severity: 3 } }).ok, false);
});

test('severity_diubah ditolak pada rambu normal (tidak punya skor)', () => {
  const p = planCorrection(signState({ conditionLabel: 'normal', severity: null }), { kind: 'severity_diubah', severity: 3 });
  assert.equal(p.ok, false);
});

test('kelas_diubah dari rambu: hasil Tahap 2 dikosongkan', () => {
  const p = planCorrection(signState({ conditionTagId: 't1', tagSeverity: 3 }), {
    kind: 'kelas_diubah',
    newClass: { id: 'c-weeds', profile: { categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 1, hasConditionStage: false } },
  });
  assert.ok(p.ok);
  assert.equal(p.update.conditionLabel, null);
  assert.equal(p.update.conditionTagId, null);
  assert.equal(p.update.severity, 1);
});

test('dikonfirmasi pada rambu normal tetap tanpa skor', () => {
  const p = planCorrection(signState({ conditionLabel: 'normal', severity: null }), { kind: 'dikonfirmasi' });
  assert.ok(p.ok);
  assert.equal(p.update.riskScore, null);
  assert.equal(p.update.conditionLabel, 'normal');
});

test('sesi tanpa zona: kondisi damaged + tag menyimpan severity, skor kosong', () => {
  const p = planCorrection(signState({ exposure: null }), { kind: 'kondisi_diubah', condition: 'damaged', tag: { id: 't', severity: 3 } });
  assert.ok(p.ok);
  assert.equal(p.update.severity, 3);
  assert.equal(p.update.riskScore, null);
});

test('tag dilepas eksplisit (null): kembali severity sementara; tidak dikirim (undefined): tag lama dipertahankan', () => {
  const withTag = signState({ conditionTagId: 't-miring', tagSeverity: 3, severity: 3, severitySource: 'tag' });
  const cleared = planCorrection(withTag, { kind: 'kondisi_diubah', condition: 'damaged', tag: null });
  assert.ok(cleared.ok);
  assert.equal(cleared.update.conditionTagId, null);
  assert.equal(cleared.update.severity, 2);
  assert.equal(cleared.update.severitySource, 'sementara');
  const kept = planCorrection(withTag, { kind: 'kondisi_diubah', condition: 'damaged' });
  assert.ok(kept.ok);
  assert.equal(kept.update.conditionTagId, 't-miring');
  assert.equal(kept.update.severitySource, 'tag');
});
