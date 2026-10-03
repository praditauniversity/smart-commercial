import test from 'node:test';
import assert from 'node:assert/strict';
import { isSchemaOutdatedError } from './db-errors';

test('kolom/tabel hilang dikenali sebagai skema tertinggal', () => {
  assert.equal(isSchemaOutdatedError({ code: 'P2022' }), true);
  assert.equal(isSchemaOutdatedError({ code: 'P2021' }), true);
});

test('klien Prisma lama dengan field baru dikenali; galat lain tidak', () => {
  assert.equal(isSchemaOutdatedError({ name: 'PrismaClientValidationError', message: 'Unknown field `conditionLabel` for select statement' }), true);
  assert.equal(isSchemaOutdatedError({ name: 'PrismaClientValidationError', message: 'Argument `where` is missing' }), false);
  assert.equal(isSchemaOutdatedError({ code: 'P1001' }), false);
  assert.equal(isSchemaOutdatedError(null), false);
});
