/**
 * Configuration comes from the environment only. There are deliberately no built-in fallback values:
 * a missing variable must fail loudly, naming the variable, instead of silently using a default.
 *
 * Server-side values are read lazily (when first used), so `next build` does not need them.
 * NEXT_PUBLIC_* values are inlined into the browser bundle at build time and only when they are
 * accessed as `process.env.NEXT_PUBLIC_NAME` literally, so those are passed to `requirePublicEnv`
 * as a value instead of being looked up by name.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Environment variable ${name} belum diisi. Isi di web/.env (lihat web/.env.example).`);
  }
  return value;
}

export function requireEnvNumber(name: string): number {
  const raw = requireEnv(name);
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} harus berupa angka, bukan "${raw}".`);
  }
  return value;
}

export function requirePublicEnv(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(`Environment variable ${name} belum diisi. Isi di web/.env lalu jalankan build ulang (nilai NEXT_PUBLIC_* ditanam saat build).`);
  }
  return value;
}

/** Optional list, e.g. "a,b,c". Unset means an empty list (no value is invented). */
export function optionalEnvList(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}
