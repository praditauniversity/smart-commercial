import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  canCorrect,
  canEnterSection,
  canMutateSessionOf,
  canViewSessionOf,
  homePathForRole,
  normalizeRole,
  seesAllSurveyors,
} from './access';

test('normalizeRole: nilai tak dikenal jatuh ke surveyor (paling terbatas)', () => {
  assert.equal(normalizeRole('admin'), 'admin');
  assert.equal(normalizeRole('supervisor'), 'supervisor');
  assert.equal(normalizeRole('manajer'), 'surveyor');
  assert.equal(normalizeRole(undefined), 'surveyor');
});

test('halaman awal tiap peran', () => {
  assert.equal(homePathForRole('admin'), '/admin/dashboard');
  assert.equal(homePathForRole('supervisor'), '/supervisor/dashboard');
  assert.equal(homePathForRole('surveyor'), '/surveyor/sessions');
});

test('akses bagian aplikasi', () => {
  assert.equal(canEnterSection('surveyor', '/admin/dashboard'), false);
  assert.equal(canEnterSection('supervisor', '/admin/dashboard'), false);
  assert.equal(canEnterSection('admin', '/admin/dashboard'), true);
  assert.equal(canEnterSection('surveyor', '/supervisor/dashboard'), false);
  assert.equal(canEnterSection('supervisor', '/supervisor/dashboard'), true);
  assert.equal(canEnterSection('admin', '/supervisor/dashboard'), true);
  assert.equal(canEnterSection('supervisor', '/surveyor/sessions'), false);
  assert.equal(canEnterSection('surveyor', '/surveyor/sessions'), true);
  assert.equal(canEnterSection('admin', '/surveyor/sessions'), true);
});

test('awalan mirip tidak membuka bagian lain (/administrator, /supervisors)', () => {
  assert.equal(canEnterSection('surveyor', '/administrator'), true); // bukan /admin: tidak dijaga bagian ini
  assert.equal(canEnterSection('surveyor', '/admin'), false);
  assert.equal(canEnterSection('surveyor', '/supervisor'), false);
});

test('melihat sesi: surveyor hanya miliknya; supervisor dan admin semua', () => {
  assert.equal(canViewSessionOf('surveyor', 'u1', 'u1'), true);
  assert.equal(canViewSessionOf('surveyor', 'u1', 'u2'), false);
  assert.equal(canViewSessionOf('supervisor', 'u9', 'u2'), true);
  assert.equal(canViewSessionOf('admin', 'u9', 'u2'), true);
});

test('mengubah sesi: supervisor TIDAK PERNAH; surveyor hanya miliknya; admin semua', () => {
  assert.equal(canMutateSessionOf('supervisor', 'u9', 'u2'), false);
  assert.equal(canMutateSessionOf('supervisor', 'u2', 'u2'), false);
  assert.equal(canMutateSessionOf('surveyor', 'u1', 'u1'), true);
  assert.equal(canMutateSessionOf('surveyor', 'u1', 'u2'), false);
  assert.equal(canMutateSessionOf('admin', 'u9', 'u2'), true);
});

test('koreksi dan cakupan dashboard', () => {
  assert.deepEqual(ROLES.filter(canCorrect), ['supervisor', 'admin']);
  assert.deepEqual(ROLES.filter(seesAllSurveyors), ['supervisor', 'admin']);
});
