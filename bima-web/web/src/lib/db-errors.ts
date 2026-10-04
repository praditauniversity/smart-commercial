/**
 * Mengenali galat Prisma yang berarti "skema database tertinggal dari kode" (kolom/tabel belum ada,
 * atau klien Prisma belum digenerate ulang), agar pesannya memberi langkah perbaikan, bukan hanya "gagal".
 */
export const SCHEMA_OUTDATED_HINT =
  'Skema database belum diperbarui. Jalankan di folder web: npx prisma migrate deploy && npx prisma generate && npm run seed:risk, lalu restart server.';

export function isSchemaOutdatedError(error: unknown): boolean {
  const e = error as { code?: string; name?: string; message?: string } | null;
  if (!e) return false;
  // P2021 tabel tidak ada, P2022 kolom tidak ada
  if (e.code === 'P2021' || e.code === 'P2022') return true;
  // Klien Prisma lama tidak mengenal field baru (mis. conditionLabel)
  return e.name === 'PrismaClientValidationError' && /Unknown (field|argument)|does not exist in/i.test(e.message ?? '');
}
