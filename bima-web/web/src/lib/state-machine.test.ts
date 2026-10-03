import test from 'node:test';
import assert from 'node:assert/strict';
import { canReview, validateSurveySessionTransition } from './state-machine';

test('supervisor dan admin boleh menyetujui; surveyor tidak', () => {
  for (const role of ['supervisor', 'admin']) {
    assert.equal(validateSurveySessionTransition('menunggu_review', 'disetujui', { role }).allowed, true, role);
  }
  const r = validateSurveySessionTransition('menunggu_review', 'disetujui', { role: 'surveyor' });
  assert.equal(r.allowed, false);
  assert.match(r.reason!, /supervisor/);
});

test('menolak: supervisor/admin dengan alasan; tanpa alasan atau surveyor ditolak', () => {
  assert.equal(validateSurveySessionTransition('menunggu_review', 'ditolak', { role: 'supervisor', rejectReason: 'Foto buram' }).allowed, true);
  assert.equal(validateSurveySessionTransition('menunggu_review', 'ditolak', { role: 'supervisor' }).allowed, false);
  assert.equal(validateSurveySessionTransition('menunggu_review', 'ditolak', { role: 'surveyor', rejectReason: 'x' }).allowed, false);
});

test('canReview', () => {
  assert.equal(canReview('supervisor'), true);
  assert.equal(canReview('admin'), true);
  assert.equal(canReview('surveyor'), false);
  assert.equal(canReview(undefined), false);
});

test('submit surveyor tetap bebas peran; hanya status yang dicek', () => {
  assert.equal(validateSurveySessionTransition('selesai_menunggu_submit', 'menunggu_review', { role: 'surveyor' }).allowed, true);
});
