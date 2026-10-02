import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGET_MS, mediaLatency, parseMetrics, summarizeLatency } from './latency';

const full = {
  upload: { compressAndExtractMs: 157418, frameExtractMs: 28675, uploadMs: 73 },
  yolo: { download_ms: 177, inference_ms: 9500, total_ms: 9700, frames: 24 },
  persistMs: 40,
  processTotalMs: 9800,
};

test('tahap dihitung dari metrik; kompresi = (kompresi+ekstraksi) - ekstraksi', () => {
  const l = mediaLatency(full)!;
  assert.equal(l.stages.kompresi, 157418 - 28675);
  assert.equal(l.stages.ekstraksi_frame, 28675);
  assert.equal(l.stages.simpan_berkas, 73);
  assert.equal(l.stages.inferensi, 9500);
  assert.equal(l.totalMs, 157418 + 73 + 177 + 9500 + 40);
});

test('media yang baru diunggah (belum dideteksi) tidak dihitung ke ringkasan', () => {
  const l = mediaLatency({ upload: { compressAndExtractMs: 1000, frameExtractMs: 200, uploadMs: 10 } })!;
  assert.equal(l.totalMs, null);
  const s = summarizeLatency([l]);
  assert.equal(s.count, 0);
  assert.equal(s.totalMs, null);
});

test('metrik rusak atau kosong diabaikan tanpa melempar galat', () => {
  assert.equal(parseMetrics('bukan json'), null);
  assert.equal(parseMetrics(null), null);
  assert.equal(mediaLatency(null), null);
  const s = summarizeLatency([null, mediaLatency(parseMetrics('{}'))]);
  assert.equal(s.count, 0);
});

test('nilai negatif/non-angka diabaikan', () => {
  const l = mediaLatency({ upload: { compressAndExtractMs: -5 as any, frameExtractMs: 1, uploadMs: 'x' as any }, yolo: { inference_ms: 100 } })!;
  assert.equal(l.stages.kompresi, undefined);
  assert.equal(l.stages.inferensi, 100);
});

test('ringkasan: target 5 menit, persentil, dan tahap terlambat', () => {
  const mk = (total: number) => mediaLatency({ upload: { compressAndExtractMs: total, frameExtractMs: 0, uploadMs: 0 }, yolo: { inference_ms: 0, download_ms: 0 }, persistMs: 0 })!;
  const s = summarizeLatency([mk(60_000), mk(120_000), mk(TARGET_MS), mk(TARGET_MS + 1)]);
  assert.equal(s.count, 4);
  assert.equal(s.withinTarget, 3); // tepat 5 menit masih memenuhi (<=)
  assert.equal(s.overTarget, 1);
  assert.equal(s.totalMs!.max, TARGET_MS + 1);
  assert.equal(s.totalMs!.p50, 120_000);
  assert.equal(s.slowestStage, 'kompresi');
});
