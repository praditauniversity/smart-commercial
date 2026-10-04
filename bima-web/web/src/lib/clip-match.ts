/**
 * Pencocokan video yang diunggah terhadap 35 klip uji RQ3 yang sudah dievaluasi.
 *
 * Nama berkas adalah kunci utama (handoff bagian 11). Karena nama mudah berubah/bertabrakan, durasi
 * dipakai sebagai pengaman tambahan: nama sama tetapi durasi berbeda jauh BUKAN klip terevaluasi,
 * supaya narasi/skor klip lain tidak tertempel pada video yang berbeda.
 */
export interface ClipRef {
  id: string;
  fileName: string;
  durationSeconds: number;
}

export type ClipMatch =
  | { status: 'cocok'; clip: ClipRef }
  | { status: 'nama_cocok_durasi_berbeda'; clip: ClipRef; deltaSeconds: number }
  | { status: 'tidak_ada' };

/** Selisih durasi (detik) yang masih dianggap sama: tracker membulatkan durasi klip ke detik penuh. */
export const DURATION_TOLERANCE_SECONDS = 3;

export function normalizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return base.trim().toLowerCase();
}

export function matchEvaluatedClip(
  fileName: string,
  durationSeconds: number | null | undefined,
  clips: ClipRef[],
  tolerance = DURATION_TOLERANCE_SECONDS
): ClipMatch {
  const key = normalizeFileName(fileName);
  const clip = clips.find((c) => normalizeFileName(c.fileName) === key);
  if (!clip) return { status: 'tidak_ada' };
  if (typeof durationSeconds !== 'number' || !Number.isFinite(durationSeconds)) {
    // Durasi tidak diketahui: tidak ada dasar untuk memastikan, jadi jangan dianggap cocok.
    return { status: 'nama_cocok_durasi_berbeda', clip, deltaSeconds: Number.NaN };
  }
  const delta = Math.abs(durationSeconds - clip.durationSeconds);
  return delta <= tolerance ? { status: 'cocok', clip } : { status: 'nama_cocok_durasi_berbeda', clip, deltaSeconds: delta };
}

export function clipMatchNote(m: ClipMatch): string | null {
  if (m.status !== 'nama_cocok_durasi_berbeda') return null;
  return Number.isNaN(m.deltaSeconds)
    ? 'Nama berkas sama dengan klip uji, tetapi durasi video tidak dapat dibaca sehingga tidak dianggap klip yang sudah dievaluasi.'
    : `Nama berkas sama dengan klip uji, tetapi durasi berbeda ${m.deltaSeconds.toFixed(1)} detik (batas ${DURATION_TOLERANCE_SECONDS} detik) sehingga tidak dianggap klip yang sudah dievaluasi.`;
}
