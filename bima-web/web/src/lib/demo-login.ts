/**
 * Akses cepat (akun demo) pada halaman login. Murni (tanpa I/O) agar mudah diuji.
 *
 * Nilai diambil dari env SEED_* (sama dengan yang dipakai `npm run seed:demo`), bukan ditanam di kode, sehingga
 * selalu cocok dengan akun hasil seed. Karena membuka kata sandi tanpa login, fitur ini HANYA aktif bila
 * DEMO_LOGIN_ENABLED=true dan bukan mode production; selain itu tidak ada akun yang dikembalikan.
 */
export type DemoRole = 'surveyor' | 'supervisor' | 'admin';

export interface DemoAccount {
  role: DemoRole;
  label: string;
  email: string;
  password: string;
}

const ROLES: { role: DemoRole; label: string; prefix: string }[] = [
  { role: 'surveyor', label: 'Surveyor', prefix: 'SEED_SURVEYOR' },
  { role: 'supervisor', label: 'Supervisor', prefix: 'SEED_SUPERVISOR' },
  { role: 'admin', label: 'Admin', prefix: 'SEED_ADMIN' },
];

type Env = Record<string, string | undefined>;

export function demoLoginEnabled(env: Env): boolean {
  return env.DEMO_LOGIN_ENABLED?.trim().toLowerCase() === 'true' && env.NODE_ENV !== 'production';
}

/** Akun demo dari env; peran yang email atau kata sandinya kosong dilewati (tidak ada nilai bawaan). */
export function buildDemoAccounts(env: Env): DemoAccount[] {
  if (!demoLoginEnabled(env)) return [];
  const out: DemoAccount[] = [];
  for (const r of ROLES) {
    const email = env[`${r.prefix}_EMAIL`]?.trim();
    const password = env[`${r.prefix}_PASSWORD`];
    if (email && password) out.push({ role: r.role, label: r.label, email, password });
  }
  return out;
}
