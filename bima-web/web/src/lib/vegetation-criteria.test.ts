import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVegetationCriteria, parseVegetationCriteria } from './vegetation-criteria';

test('vegetation selections discard unknown values and duplicates before storing', () => {
  assert.deepEqual(
    normalizeVegetationCriteria(['weeds', 7, 'unknown', 'dead_parts', 'weeds', null]),
    ['weeds', 'dead_parts']
  );
});

test('vegetation selections reject non-array input', () => {
  for (const value of [null, undefined, 'weeds', { weeds: true }]) {
    assert.deepEqual(normalizeVegetationCriteria(value), []);
  }
});

test('stored vegetation selections resolve to the Indonesian condition criteria', () => {
  const stored = JSON.stringify(normalizeVegetationCriteria(['forked_trunk', 'overlapping']));
  assert.deepEqual(parseVegetationCriteria(stored), [
    'Batang ganda berbentuk V',
    'Vegetasi saling bertumpu atau terlalu rapat',
  ]);
});

test('invalid stored vegetation data cannot introduce arbitrary condition text', () => {
  for (const stored of ['not JSON', '{}', 'null', '["unknown", 5]', undefined]) {
    assert.deepEqual(parseVegetationCriteria(stored), []);
  }
});
