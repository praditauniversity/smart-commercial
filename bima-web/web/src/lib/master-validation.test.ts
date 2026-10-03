import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClassRisk, validateConditionTag, validateZone } from './master-validation';

test('kelas infrastruktur wajib severity 1-3', () => {
  assert.deepEqual(validateClassRisk({ categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 2 }), []);
  assert.equal(validateClassRisk({ categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: null }).length, 1);
  assert.equal(validateClassRisk({ categoryGroup: 'keselamatan_infrastruktur', defaultSeverity: 4 }).length, 1);
});

test('kelas Monitoring Kepatuhan tidak boleh punya severity', () => {
  assert.deepEqual(validateClassRisk({ categoryGroup: 'monitoring_kepatuhan', defaultSeverity: null }), []);
  assert.equal(validateClassRisk({ categoryGroup: 'monitoring_kepatuhan', defaultSeverity: 2 }).length, 1);
});

test('tanpa kelompok: severity harus kosong; kelompok asing ditolak', () => {
  assert.deepEqual(validateClassRisk({ categoryGroup: null, defaultSeverity: null }), []);
  assert.equal(validateClassRisk({ categoryGroup: null, defaultSeverity: 2 }).length, 1);
  assert.equal(validateClassRisk({ categoryGroup: 'lain', defaultSeverity: null }).length, 1);
});

test('zona: semua field wajib saat membuat; exposure 1-3', () => {
  assert.deepEqual(validateZone({ code: 'ZN-01', name: 'Jalan', zoneType: 'jalan_utama', exposure: 3 }), []);
  assert.ok(validateZone({}).length >= 4);
  assert.equal(validateZone({ code: 'ZN-01', name: 'x', zoneType: 'jalan_utama', exposure: 5 }).length, 1);
  assert.equal(validateZone({ code: 'a', name: 'x', zoneType: 'jalan_utama', exposure: 1 }).length, 1);
  assert.equal(validateZone({ code: 'ZN-01', name: 'x', zoneType: 'pasar', exposure: 1 }).length, 1);
});

test('pembaruan sebagian hanya memeriksa field yang dikirim', () => {
  assert.deepEqual(validateZone({ exposure: 2 }, { partial: true }), []);
  assert.equal(validateZone({ exposure: 0 }, { partial: true }).length, 1);
});

test('tag kondisi: kode, label, severity 1-3 wajib; kode hanya huruf kecil/angka/_', () => {
  assert.deepEqual(validateConditionTag({ code: 'panel_hilang', label: 'Panel hilang', severity: 3 }), []);
  assert.ok(validateConditionTag({}).length >= 3);
  assert.equal(validateConditionTag({ code: 'Panel Hilang', label: 'x', severity: 3 }).length, 1);
  assert.equal(validateConditionTag({ code: 'ok_tag', label: 'x', severity: 0 }).length, 1);
  assert.equal(validateConditionTag({ code: 'ok_tag', label: '  ', severity: 2 }).length, 1);
});

test('tag kondisi: pembaruan sebagian hanya memeriksa field yang dikirim', () => {
  assert.deepEqual(validateConditionTag({ severity: 2 }, { partial: true }), []);
  assert.equal(validateConditionTag({ severity: 7 }, { partial: true }).length, 1);
});
