import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_FRAMES, planFrameTimestamps } from './frame-plan';

test('klip pendek mengikuti 0,5 fps', () => {
  assert.deepEqual(planFrameTimestamps(10), [1, 3, 5, 7, 9]);
});

test('klip 60,82 dtk -> 24 frame merata hingga ujung klip (sama dengan sisi Python)', () => {
  const ts = planFrameTimestamps(60.82);
  assert.equal(ts.length, MAX_FRAMES);
  assert.equal(ts[0], 1.267); // nilai yang sama dengan hasil endpoint ai-service
  assert.ok(ts[ts.length - 1] > 60.82 - 2.6);
  const steps = ts.slice(1).map((t, i) => t - ts[i]);
  assert.ok(Math.max(...steps) - Math.min(...steps) < 0.01);
});

test('video panjang tetap maksimal 24 frame', () => {
  assert.equal(planFrameTimestamps(20 * 60).length, 24);
});

test('input tidak valid', () => {
  assert.deepEqual(planFrameTimestamps(0), [0]);
  assert.deepEqual(planFrameTimestamps(-1), [0]);
  assert.deepEqual(planFrameTimestamps(Number.NaN), [0]);
  assert.equal(planFrameTimestamps(0.5).length, 1);
});
