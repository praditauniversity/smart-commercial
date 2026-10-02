/** Validasi data master penilaian risiko (murni). Mengembalikan daftar galat; kosong = valid. */
import { isExposure, isSeverity } from './risk';

export const CATEGORY_GROUPS = ['keselamatan_infrastruktur', 'monitoring_kepatuhan'] as const;
export const ZONE_TYPES = ['jalan_utama', 'hunian', 'area_minim_aktivitas'] as const;

export interface ClassRiskInput {
  categoryGroup?: string | null;
  category?: string | null;
  defaultSeverity?: number | null;
}

export function validateClassRisk(input: ClassRiskInput): string[] {
  const errors: string[] = [];
  const group = input.categoryGroup ?? null;
  if (group !== null && !(CATEGORY_GROUPS as readonly string[]).includes(group)) {
    errors.push('Kelompok harus "keselamatan_infrastruktur", "monitoring_kepatuhan", atau kosong.');
  }
  if (group === 'keselamatan_infrastruktur' && !isSeverity(input.defaultSeverity)) {
    errors.push('Keselamatan Infrastruktur wajib memiliki Severity bawaan 1, 2, atau 3.');
  }
  if (group === 'monitoring_kepatuhan' && input.defaultSeverity !== null && input.defaultSeverity !== undefined) {
    errors.push('Monitoring Kepatuhan tidak memiliki skor risiko; Severity harus kosong.');
  }
  if (group === null && input.defaultSeverity !== null && input.defaultSeverity !== undefined) {
    errors.push('Severity hanya boleh diisi bila kelompok dipilih.');
  }
  if (input.category !== undefined && input.category !== null && input.category.trim() === '') {
    errors.push('Kategori tidak boleh berupa teks kosong (isi atau kosongkan).');
  }
  return errors;
}

export interface ZoneInput {
  code?: string;
  name?: string;
  zoneType?: string;
  exposure?: number;
}

export function validateZone(input: ZoneInput, { partial = false }: { partial?: boolean } = {}): string[] {
  const errors: string[] = [];
  const need = (v: unknown, label: string) => {
    if (!partial && (v === undefined || v === null || String(v).trim() === '')) errors.push(`${label} wajib diisi.`);
  };
  need(input.code, 'Kode');
  need(input.name, 'Nama');
  need(input.zoneType, 'Jenis zona');
  need(input.exposure, 'Exposure');
  if (input.code !== undefined && !/^[A-Za-z0-9_-]{2,32}$/.test(input.code)) errors.push('Kode 2-32 karakter: huruf, angka, "-" atau "_".');
  if (input.name !== undefined && input.name.trim() === '') errors.push('Nama tidak boleh kosong.');
  if (input.zoneType !== undefined && !(ZONE_TYPES as readonly string[]).includes(input.zoneType)) errors.push('Jenis zona tidak valid.');
  if (input.exposure !== undefined && !isExposure(input.exposure)) errors.push('Exposure harus 1, 2, atau 3.');
  return errors;
}
