/**
 * Hak akses tiga peran (murni, tanpa I/O agar mudah diuji).
 *
 * - admin      : semua data master, semua temuan semua surveyor, hasil koreksi supervisor.
 * - surveyor   : hanya mengakses dan mengentri data temuan miliknya sendiri.
 * - supervisor : melihat seluruh temuan semua surveyor untuk dikoreksi (lewat jalur koreksi
 *                tersendiri, bukan dengan menimpa data surveyor).
 */
export type Role = 'surveyor' | 'supervisor' | 'admin';

export const ROLES: readonly Role[] = ['surveyor', 'supervisor', 'admin'];

export function isRole(v: unknown): v is Role {
  return v === 'surveyor' || v === 'supervisor' || v === 'admin';
}

/** Memetakan nilai bebas dari klien ke peran yang valid; nilai tak dikenal jatuh ke peran paling terbatas. */
export function normalizeRole(v: unknown): Role {
  return isRole(v) ? v : 'surveyor';
}

export const ROLE_LABEL: Record<Role, string> = {
  surveyor: 'Surveyor',
  supervisor: 'Supervisor',
  admin: 'Admin',
};

/** Halaman awal setelah login untuk tiap peran. */
export function homePathForRole(role: Role): string {
  switch (role) {
    case 'admin':
      return '/admin/dashboard';
    case 'supervisor':
      return '/supervisor/dashboard';
    default:
      return '/surveyor/dashboard';
  }
}

/**
 * Bagian aplikasi yang boleh dimasuki tiap peran.
 * /admin hanya admin; /supervisor untuk supervisor dan admin; /surveyor untuk surveyor dan admin
 * (perilaku admin lama dipertahankan). Supervisor tidak masuk /surveyor karena tidak mengentri data.
 */
export function canEnterSection(role: Role, pathname: string): boolean {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return role === 'admin';
  if (pathname === '/supervisor' || pathname.startsWith('/supervisor/')) return role === 'supervisor' || role === 'admin';
  if (pathname === '/surveyor' || pathname.startsWith('/surveyor/')) return role === 'surveyor' || role === 'admin';
  return true;
}

/** Boleh MELIHAT sesi milik `ownerId`: admin dan supervisor semua; surveyor hanya miliknya. */
export function canViewSessionOf(role: Role, userId: string, ownerId: string): boolean {
  return role === 'admin' || role === 'supervisor' || ownerId === userId;
}

/** Boleh MENGUBAH data sesi milik `ownerId`: admin semua; surveyor hanya miliknya; supervisor tidak pernah. */
export function canMutateSessionOf(role: Role, userId: string, ownerId: string): boolean {
  if (role === 'admin') return true;
  if (role === 'surveyor') return ownerId === userId;
  return false;
}

/** Peran yang boleh membuat koreksi (keliru / terlewat / ubah kelas / ubah severity). */
export function canCorrect(role: Role): boolean {
  return role === 'supervisor' || role === 'admin';
}

/** Peran yang melihat keseluruhan data (semua surveyor) di dashboard. */
export function seesAllSurveyors(role: Role): boolean {
  return role === 'supervisor' || role === 'admin';
}
