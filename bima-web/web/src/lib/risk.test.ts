import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBTYPE_PROFILES,
  assessDetection,
  assessWithProfile,
  assessWithCondition,
  DEFAULT_SIGN_TAGS,
  CONDITION_MODEL_LABEL,
  bandForScore,
  computeRisk,
  getSubtypeProfile,
  worstAssessment,
  type Exposure,
  type RiskScore,
  type Severity,
} from './risk';

const LEVELS: (1 | 2 | 3)[] = [1, 2, 3];

test('skor gabungan hanya {1,2,3,4,6,9}; 5, 7, 8 mustahil', () => {
  const seen = new Set<number>();
  for (const s of LEVELS) for (const e of LEVELS) seen.add(computeRisk(s as Severity, e as Exposure).score);
  assert.deepEqual([...seen].sort((a, b) => a - b), [1, 2, 3, 4, 6, 9]);
});

test('pita prioritas: 1-2 rendah, 3-4 sedang, 6 tinggi, 9 kritikal', () => {
  const expected: Record<number, string> = { 1: 'rendah', 2: 'rendah', 3: 'sedang', 4: 'sedang', 6: 'tinggi', 9: 'kritikal' };
  for (const [score, band] of Object.entries(expected)) {
    assert.equal(bandForScore(Number(score) as RiskScore), band);
  }
});

test('Kritikal (9) hanya berasal dari Berat x Tinggi', () => {
  for (const s of LEVELS) {
    for (const e of LEVELS) {
      const r = computeRisk(s as Severity, e as Exposure);
      assert.equal(r.band === 'kritikal', s === 3 && e === 3, `severity ${s} x exposure ${e}`);
    }
  }
});

test('seluruh 9 kombinasi menghasilkan band yang benar', () => {
  const table: [Severity, Exposure, number, string][] = [
    [1, 1, 1, 'rendah'], [1, 2, 2, 'rendah'], [1, 3, 3, 'sedang'],
    [2, 1, 2, 'rendah'], [2, 2, 4, 'sedang'], [2, 3, 6, 'tinggi'],
    [3, 1, 3, 'sedang'], [3, 2, 6, 'tinggi'], [3, 3, 9, 'kritikal'],
  ];
  for (const [s, e, score, band] of table) {
    const r = computeRisk(s, e);
    assert.equal(r.score, score);
    assert.equal(r.band, band);
  }
});

test('input di luar 1-3 ditolak', () => {
  assert.throws(() => computeRisk(0 as Severity, 2), RangeError);
  assert.throws(() => computeRisk(2, 4 as Exposure), RangeError);
});

test('Severity bawaan per subtipe sesuai handoff', () => {
  const expected: Record<string, number | null> = {
    pavedroad_pothole: 3,
    vegetation_blocking: 3,
    pavedroad_crack: 2,
    vegetation_dead: 2,
    weeds: 1,
    sign: 2, // nilai awal, dapat diubah petugas
    banner: null,
    house_notice: null,
  };
  for (const [subtype, sev] of Object.entries(expected)) {
    assert.equal(getSubtypeProfile(subtype)?.severity, sev, subtype);
  }
  assert.equal(SUBTYPE_PROFILES.length, 8);
});

test('Monitoring Kepatuhan tidak pernah diberi skor, termasuk dengan override', () => {
  for (const subtype of ['banner', 'house_notice']) {
    const r = assessDetection(subtype, 3, 3);
    assert.deepEqual(r, { scored: false, reason: 'monitoring_kepatuhan' });
  }
});

test('pothole di jalan ramai = 9 kritikal; weeds di taman = 1 rendah', () => {
  const a = assessDetection('pavedroad_pothole', 3);
  assert.ok(a.scored && a.score === 9 && a.band === 'kritikal');
  const b = assessDetection('weeds', 1);
  assert.ok(b.scored && b.score === 1 && b.band === 'rendah');
});

test('override petugas mengganti Severity bawaan (sign 2 -> 3)', () => {
  const base = assessDetection('sign', 2);
  assert.ok(base.scored && base.severity === 2 && base.score === 4);
  const fixed = assessDetection('sign', 2, 3);
  assert.ok(fixed.scored && fixed.severity === 3 && fixed.score === 6 && fixed.band === 'tinggi');
});

test('tanpa exposure atau subtipe asing -> tidak dinilai, bukan ditebak', () => {
  assert.deepEqual(assessDetection('pavedroad_pothole', null), { scored: false, reason: 'tanpa_exposure' });
  assert.deepEqual(assessDetection('tidak_ada', 2), { scored: false, reason: 'subtipe_tidak_dikenal' });
});

test('skor lokasi = temuan terburuk; hanya Monitoring Kepatuhan -> null', () => {
  const w = worstAssessment([assessDetection('weeds', 2), assessDetection('pavedroad_crack', 3), assessDetection('banner', 3)]);
  assert.equal(w?.score, 6);
  assert.equal(worstAssessment([assessDetection('banner', 2), assessDetection('house_notice', 2)]), null);
});

test('penilaian dari data master kelas (DB): memakai defaultSeverity dan kelompok yang tersimpan', () => {
  const r = assessWithProfile({ categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 3 }, 3);
  assert.ok(r.scored && r.score === 9 && r.band === 'kritikal');
  // admin mengubah Severity bawaan di data master -> hasil mengikuti
  const edited = assessWithProfile({ categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 1 }, 3);
  assert.ok(edited.scored && edited.score === 3);
});

test('data master tidak lengkap -> tidak dinilai, tidak ditebak', () => {
  assert.deepEqual(assessWithProfile(null, 2), { scored: false, reason: 'subtipe_tidak_dikenal' });
  assert.deepEqual(assessWithProfile({ categoryGroup: null, defaultSeverity: 2 }, 2), { scored: false, reason: 'subtipe_tidak_dikenal' });
  assert.deepEqual(assessWithProfile({ categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: null }, 2), { scored: false, reason: 'subtipe_tidak_dikenal' });
  assert.deepEqual(assessWithProfile({ categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 9 }, 2), { scored: false, reason: 'subtipe_tidak_dikenal' });
  assert.deepEqual(assessWithProfile({ categoryGroup: 'monitoring_kepatuhan', defaultSeverity: 3 }, 3), { scored: false, reason: 'monitoring_kepatuhan' });
});

const SIGN = { categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 2, hasConditionStage: true };

test('tag awal rambu sesuai keputusan final (6 tag, severity 3/3/3/2/2/1)', () => {
  const m = Object.fromEntries(DEFAULT_SIGN_TAGS.map((t) => [t.code, t.severity]));
  assert.deepEqual(m, { panel_hilang: 3, panel_penyok: 3, panel_merosot: 3, panel_miring: 2, tiang_miring: 2, pudar: 1 });
  assert.equal(DEFAULT_SIGN_TAGS.length, 6);
});

test('rambu normal: TIDAK dinilai sama sekali, apa pun exposure maupun severity manual', () => {
  for (const exp of [1, 2, 3]) {
    assert.deepEqual(assessWithCondition(SIGN, exp, { condition: 'normal' }), { scored: false, reason: 'kondisi_normal' });
  }
  assert.deepEqual(assessWithCondition(SIGN, 3, { condition: 'normal', severityOverride: 3 }), { scored: false, reason: 'kondisi_normal' });
});

test('rambu rusak tanpa tag: severity sementara kelas (2), sumber "sementara"', () => {
  const a = assessWithCondition(SIGN, 3, { condition: 'damaged' });
  assert.ok(a.scored);
  assert.equal(a.severity, 2);
  assert.equal(a.severitySource, 'sementara');
  assert.equal(a.score, 6);
  assert.equal(a.band, 'tinggi');
});

test('rambu rusak dengan tag: severity dari tag, sumber "tag"', () => {
  const hilang = assessWithCondition(SIGN, 3, { condition: 'damaged', tagSeverity: 3 });
  assert.ok(hilang.scored && hilang.score === 9 && hilang.band === 'kritikal' && hilang.severitySource === 'tag');
  const pudar = assessWithCondition(SIGN, 1, { condition: 'damaged', tagSeverity: 1 });
  assert.ok(pudar.scored && pudar.score === 1 && pudar.band === 'rendah');
});

test('severity manual petugas menang atas tag; tag tidak berlaku pada rambu normal', () => {
  const a = assessWithCondition(SIGN, 3, { condition: 'damaged', tagSeverity: 3, severityOverride: 1 });
  assert.ok(a.scored && a.severity === 1 && a.severitySource === 'petugas');
});

test('rambu belum diklasifikasi (Tahap 2 tidak aktif): perilaku lama, nilai bawaan kelas', () => {
  const a = assessWithCondition(SIGN, 2, { condition: null });
  assert.ok(a.scored && a.severity === 2 && a.severitySource === 'bawaan' && a.score === 4);
});

test('kelas tanpa Tahap 2 mengabaikan kondisi dan tag', () => {
  const pothole = { categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 3 };
  const a = assessWithCondition(pothole, 3, { condition: 'normal', tagSeverity: 1 });
  assert.ok(a.scored && a.severity === 3 && a.severitySource === 'bawaan');
});

test('tanpa exposure: tidak dinilai walau rusak; label model tersedia', () => {
  assert.deepEqual(assessWithCondition(SIGN, null, { condition: 'damaged', tagSeverity: 3 }), { scored: false, reason: 'tanpa_exposure' });
  assert.match(CONDITION_MODEL_LABEL, /fold0.*5-fold cross-validation/);
});
