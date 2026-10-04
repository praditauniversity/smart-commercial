import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoAccounts, demoLoginEnabled } from './demo-login';

const seeds = {
  SEED_ADMIN_EMAIL: 'a@x.id', SEED_ADMIN_PASSWORD: 'pa',
  SEED_SURVEYOR_EMAIL: 's@x.id', SEED_SURVEYOR_PASSWORD: 'ps',
  SEED_SUPERVISOR_EMAIL: 'v@x.id', SEED_SUPERVISOR_PASSWORD: 'pv',
};

test('tanpa DEMO_LOGIN_ENABLED tidak ada akun (kata sandi tidak bocor)', () => {
  assert.equal(demoLoginEnabled({ ...seeds }), false);
  assert.deepEqual(buildDemoAccounts({ ...seeds }), []);
  assert.deepEqual(buildDemoAccounts({ ...seeds, DEMO_LOGIN_ENABLED: 'false' }), []);
  assert.deepEqual(buildDemoAccounts({ ...seeds, DEMO_LOGIN_ENABLED: '1' }), []); // hanya "true" yang berlaku
});

test('mode production selalu menonaktifkan, walau flag true', () => {
  assert.equal(demoLoginEnabled({ ...seeds, DEMO_LOGIN_ENABLED: 'true', NODE_ENV: 'production' }), false);
  assert.deepEqual(buildDemoAccounts({ ...seeds, DEMO_LOGIN_ENABLED: 'true', NODE_ENV: 'production' }), []);
});

test('aktif: akun mengikuti nilai SEED_* persis, urut surveyor, supervisor, admin', () => {
  const a = buildDemoAccounts({ ...seeds, DEMO_LOGIN_ENABLED: 'true', NODE_ENV: 'development' });
  assert.deepEqual(a.map((x) => [x.role, x.email, x.password]), [
    ['surveyor', 's@x.id', 'ps'], ['supervisor', 'v@x.id', 'pv'], ['admin', 'a@x.id', 'pa'],
  ]);
});

test('peran tanpa email atau kata sandi dilewati, tidak diisi nilai bawaan', () => {
  const a = buildDemoAccounts({ DEMO_LOGIN_ENABLED: 'true', SEED_ADMIN_EMAIL: 'a@x.id', SEED_ADMIN_PASSWORD: '', SEED_SURVEYOR_EMAIL: 's@x.id', SEED_SURVEYOR_PASSWORD: 'ps' });
  assert.deepEqual(a.map((x) => x.role), ['surveyor']);
});

test('flag dibaca tanpa peka huruf besar/kecil dan spasi', () => {
  assert.equal(demoLoginEnabled({ DEMO_LOGIN_ENABLED: ' TRUE ' }), true);
});
