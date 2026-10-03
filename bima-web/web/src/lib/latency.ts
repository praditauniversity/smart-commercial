/**
 * Ringkasan latensi per modul (instrumentasi yang disarankan BAB V). Murni.
 * Sumber: MediaAsset.processingMetrics (diisi saat unggah dan saat proses YOLO).
 *
 * "End-to-end" di sini = waktu KOMPUTASI sistem untuk satu media (kompresi + ekstraksi frame + simpan + deteksi +
 * simpan hasil). Jeda menunggu manusia (mis. surveyor menekan "proses" belakangan) TIDAK dihitung.
 */
export const TARGET_MS = 5 * 60 * 1000;

export interface RawMetrics {
  upload?: { compressAndExtractMs?: number; frameExtractMs?: number; uploadMs?: number };
  yolo?: { download_ms?: number; inference_ms?: number; stage2_ms?: number; stage2_crops?: number; total_ms?: number; per_model_ms?: Record<string, number>; frames?: number };
  persistMs?: number;
  processTotalMs?: number;
}

export const STAGES = ['kompresi', 'ekstraksi_frame', 'simpan_berkas', 'unduh_frame', 'inferensi', 'klasifikasi_kondisi', 'simpan_hasil'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  kompresi: 'Kompresi video 720p',
  ekstraksi_frame: 'Ekstraksi frame (dari berkas asli)',
  simpan_berkas: 'Simpan berkas & frame',
  unduh_frame: 'Baca frame (ai-service)',
  inferensi: 'Inferensi YOLO (6 model)',
  klasifikasi_kondisi: 'Klasifikasi kondisi rambu (Tahap 2)',
  simpan_hasil: 'Simpan temuan & skor risiko',
};

export interface MediaLatency {
  stages: Partial<Record<Stage, number>>;
  /** Total komputasi; null bila media belum selesai diproses (tahap deteksi belum ada). */
  totalMs: number | null;
}

export function parseMetrics(raw: string | null | undefined): RawMetrics | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as RawMetrics) : null;
  } catch {
    return null;
  }
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);

export function mediaLatency(m: RawMetrics | null): MediaLatency | null {
  if (!m) return null;
  const compressAndExtract = num(m.upload?.compressAndExtractMs);
  const extract = num(m.upload?.frameExtractMs) ?? 0;
  const stages: Partial<Record<Stage, number>> = {};
  if (compressAndExtract !== undefined) {
    stages.kompresi = Math.max(0, compressAndExtract - extract);
    stages.ekstraksi_frame = extract;
  }
  if (num(m.upload?.uploadMs) !== undefined) stages.simpan_berkas = m.upload!.uploadMs!;
  if (num(m.yolo?.download_ms) !== undefined) stages.unduh_frame = m.yolo!.download_ms!;
  if (num(m.yolo?.inference_ms) !== undefined) stages.inferensi = m.yolo!.inference_ms!;
  // Hanya dicatat bila Tahap 2 berjalan; media tanpa rambu/ tanpa Tahap 2 tidak memiliki tahap ini.
  if ((num(m.yolo?.stage2_crops) ?? 0) > 0 && num(m.yolo?.stage2_ms) !== undefined) stages.klasifikasi_kondisi = m.yolo!.stage2_ms!;
  if (num(m.persistMs) !== undefined) stages.simpan_hasil = m.persistMs!;
  const detected = m.yolo !== undefined;
  const totalMs = detected ? Object.values(stages).reduce((n, v) => n + (v ?? 0), 0) : null;
  return { stages, totalMs };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export interface LatencySummary {
  count: number; // media yang sudah lengkap (unggah + deteksi)
  withinTarget: number;
  overTarget: number;
  totalMs: { mean: number; p50: number; p95: number; max: number } | null;
  stageMeanMs: Partial<Record<Stage, number>>;
  /** Tahap yang paling memakan waktu rata-rata (kandidat optimasi). */
  slowestStage: Stage | null;
}

export function summarizeLatency(items: (MediaLatency | null)[]): LatencySummary {
  const complete = items.filter((x): x is MediaLatency & { totalMs: number } => !!x && x.totalMs !== null);
  const totals = complete.map((x) => x.totalMs).sort((a, b) => a - b);
  const stageMeanMs: Partial<Record<Stage, number>> = {};
  for (const s of STAGES) {
    const vals = complete.map((x) => x.stages[s]).filter((v): v is number => v !== undefined);
    if (vals.length) stageMeanMs[s] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  const slowest = (Object.entries(stageMeanMs) as [Stage, number][]).sort((a, b) => b[1] - a[1])[0];
  return {
    count: complete.length,
    withinTarget: totals.filter((t) => t <= TARGET_MS).length,
    overTarget: totals.filter((t) => t > TARGET_MS).length,
    totalMs: totals.length
      ? { mean: totals.reduce((a, b) => a + b, 0) / totals.length, p50: percentile(totals, 50), p95: percentile(totals, 95), max: totals[totals.length - 1] }
      : null,
    stageMeanMs,
    slowestStage: slowest ? slowest[0] : null,
  };
}
