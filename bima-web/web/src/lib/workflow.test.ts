import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowFor } from './workflow';
import type { SessionSummary } from './overview';

const s = (status: string): SessionSummary => ({ id: status, name: status, status } as unknown as SessionSummary);
const totals = { sessions: 4, media: 0, validFindings: 10, normalSigns: 0, falsePositives: 0, missed: 0, reviewedFindings: 4 };
const sessions = [s('berlangsung'), s('selesai_menunggu_submit'), s('menunggu_review'), s('ditolak')];

test('alur supervisor: entri -> koreksi -> review', () => {
  const [a, b, c] = workflowFor('supervisor', sessions, totals, '/supervisor/reviews');
  assert.equal(a.value, 2);
  assert.equal(b.value, '4/10');
  assert.equal(c.value, 1);
  assert.equal(c.href, '/supervisor/reviews');
  assert.equal(c.tone, 'amber');
});

test('alur surveyor menghitung sesi miliknya per status', () => {
  const [ready, waiting, fix] = workflowFor('surveyor', sessions, totals, '/x');
  assert.deepEqual([ready.value, waiting.value, fix.value], [1, 1, 1]);
  assert.equal(fix.tone, 'rose');
});
