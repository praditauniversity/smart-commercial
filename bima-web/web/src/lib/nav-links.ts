/** Daftar menu per peran (murni, mudah diuji). Navbar desktop, bar mobile, dan bar bawah memakai daftar yang sama. */
import type { Role } from './access';

export type NavIcon = 'dashboard' | 'analytics' | 'sessions' | 'new' | 'review' | 'classes' | 'risk' | 'expert' | 'models' | 'users';

export interface NavLink {
  href: string;
  label: string;
  /** Label pendek untuk bar bawah mobile; kosong = tidak tampil di bar bawah. */
  short?: string;
  icon: NavIcon;
  /** Awalan path yang menandai menu ini aktif. */
  match: string[];
  /** true = hanya cocok persis (mis. /surveyor/new tidak boleh ikut mengaktifkan /surveyor/sessions). */
  exact?: boolean;
}

const LINKS: Record<Role, NavLink[]> = {
  surveyor: [
    { href: '/surveyor/dashboard', label: 'Dashboard', short: 'Dashboard', icon: 'dashboard', match: ['/surveyor/dashboard'] },
    { href: '/surveyor/sessions', label: 'Sesi Survei', short: 'Sesi', icon: 'sessions', match: ['/surveyor/sessions'] },
    { href: '/surveyor/new', label: 'Buat Sesi Baru', short: 'Sesi Baru', icon: 'new', match: ['/surveyor/new'], exact: true },
  ],
  supervisor: [
    { href: '/supervisor/dashboard', label: 'Dashboard', short: 'Dashboard', icon: 'dashboard', match: ['/supervisor/dashboard', '/supervisor/sessions'] },
    { href: '/supervisor/reviews', label: 'Antrean Review', short: 'Review', icon: 'review', match: ['/supervisor/reviews'] },
    { href: '/supervisor/analitik', label: 'Analitik', short: 'Analitik', icon: 'analytics', match: ['/supervisor/analitik'] },
  ],
  admin: [
    { href: '/admin/dashboard', label: 'Dashboard', short: 'Dashboard', icon: 'dashboard', match: ['/admin/dashboard'] },
    { href: '/admin/analitik', label: 'Analitik', short: 'Analitik', icon: 'analytics', match: ['/admin/analitik'] },
    { href: '/admin/reviews', label: 'Antrean Review', short: 'Review', icon: 'review', match: ['/admin/reviews'] },
    { href: '/admin/classes', label: 'Kelas Deteksi', short: 'Kelas', icon: 'classes', match: ['/admin/classes'] },
    { href: '/admin/risk-master', label: 'Risiko & Zona', icon: 'risk', match: ['/admin/risk-master'] },
    { href: '/admin/validasi-ahli', label: 'Validasi Ahli', icon: 'expert', match: ['/admin/validasi-ahli'] },
    { href: '/admin/models', label: 'Model AI', short: 'Model AI', icon: 'models', match: ['/admin/models'] },
    { href: '/admin/users', label: 'User', short: 'User', icon: 'users', match: ['/admin/users'] },
  ],
};

export function navLinksFor(role: Role): NavLink[] {
  return LINKS[role];
}

export function isLinkActive(link: NavLink, pathname: string): boolean {
  return link.match.some((m) => (link.exact ? pathname === m : pathname === m || pathname.startsWith(`${m}/`)));
}
