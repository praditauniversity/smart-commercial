/**
 * Kolom "kelayakan" adalah sisa alur lama (penilaian manual petugas: layak / cukup layak / tidak layak).
 * Temuan hasil YOLO menyimpan nilai 'tidak_dinilai' (penilaian risiko ada di skor Severity × Exposure,
 * dan validasi ahli dilakukan manual di luar sistem), sehingga lencana kelayakan tidak ditampilkan untuk nilai itu.
 */
const RATED = ['layak', 'cukup_layak', 'tidak_layak'] as const;

export function isFeasibilityRated(value: string | null | undefined): value is (typeof RATED)[number] {
  return !!value && (RATED as readonly string[]).includes(value);
}

export function feasibilityText(value: string | null | undefined): string {
  return isFeasibilityRated(value) ? value.replace('_', ' ') : '-';
}
