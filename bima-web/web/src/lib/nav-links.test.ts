import test from 'node:test';
import assert from 'node:assert/strict';
import { isLinkActive, navLinksFor } from './nav-links';
import { canEnterSection } from './access';

test('setiap peran memiliki menu Dashboard dan hanya menu yang boleh dimasukinya', () => {
  for (const role of ['surveyor', 'supervisor', 'admin'] as const) {
    const links = navLinksFor(role);
    assert.ok(links.some((l) => l.label === 'Dashboard'));
    for (const l of links) assert.equal(canEnterSection(role, l.href), true, `${role} -> ${l.href}`);
  }
});

test('menu aktif mengikuti path; /surveyor/new tidak mengaktifkan Sesi Survei', () => {
  const links = navLinksFor('surveyor');
  const sessions = links.find((l) => l.href === '/surveyor/sessions')!;
  const fresh = links.find((l) => l.href === '/surveyor/new')!;
  assert.equal(isLinkActive(sessions, '/surveyor/sessions/abc'), true);
  assert.equal(isLinkActive(sessions, '/surveyor/new'), false);
  assert.equal(isLinkActive(fresh, '/surveyor/new'), true);
  const sup = navLinksFor('supervisor')[0];
  assert.equal(isLinkActive(sup, '/supervisor/sessions/xyz'), true);
});
