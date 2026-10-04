import test from 'node:test';
import assert from 'node:assert/strict';
import { feasibilityText, isFeasibilityRated } from './feasibility';

test('nilai kelayakan lama dikenali, tidak_dinilai tidak ditampilkan', () => {
  assert.equal(isFeasibilityRated('layak'), true);
  assert.equal(isFeasibilityRated('cukup_layak'), true);
  assert.equal(isFeasibilityRated('tidak_layak'), true);
  assert.equal(isFeasibilityRated('tidak_dinilai'), false);
  assert.equal(isFeasibilityRated(undefined), false);
  assert.equal(feasibilityText('cukup_layak'), 'cukup layak');
  assert.equal(feasibilityText('tidak_dinilai'), '-');
});
