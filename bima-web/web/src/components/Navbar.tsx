'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  MapPin,
  ClipboardList,
  PlusCircle,
  BarChart3,
  LayoutDashboard,
  Activity,
  CheckSquare,
  Layers,
  Cpu,
  Users,
  MoreHorizontal,
  ChevronDown,
  LogOut,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { isLinkActive, navLinksFor, splitNavLinks, type NavIcon } from '@/lib/nav-links';

const ICONS: Record<NavIcon, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  analytics: Activity,
  sessions: ClipboardList,
  new: PlusCircle,
  review: CheckSquare,
  classes: Layers,
  risk: BarChart3,
  expert: ClipboardList,
  models: Cpu,
  users: Users,
};

interface User {
  id: string;
  email: string;
  name: string;
  role: 'surveyor' | 'supervisor' | 'admin';
}

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Tutup dropdown saat pindah halaman, klik di luar, atau tekan Escape.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreOpen]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
      router.push('/login');
    } catch (err) {
      console.error(err);
    }
  };

  if (pathname === '/login') return null;

  return (
    <>
      <nav className="bg-white border-b border-zinc-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16 items-center">
            {/* Brand Logo & Desktop Links */}
            <div className="flex items-center gap-4 lg:gap-8">
              <Link href="/" className="flex items-center gap-2.5 group shrink-0">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-brand-green flex items-center justify-center text-white shadow-xs shrink-0">
                  <MapPin className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                </div>
                <div>
                  <span className="text-base sm:text-lg font-semibold tracking-tight text-zinc-900 leading-tight block">
                    BIMA Vision
                  </span>
                  <span className="hidden 2xl:block text-[10px] text-zinc-500 font-medium tracking-wide uppercase">
                    Pemantauan Kawasan AI
                  </span>
                </div>
              </Link>

              {/* Desktop Nav links (Visible on md and above) */}
              {user && (
                <div className={`hidden items-center gap-1 ${splitNavLinks(user.role).more.length > 0 ? 'xl:flex' : 'md:flex'}`}>
                  {splitNavLinks(user.role).primary.map((l) => {
                    const Icon = ICONS[l.icon];
                    const active = isLinkActive(l, pathname);
                    return (
                      <Link
                        key={l.href}
                        href={l.href}
                        className={`flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-md text-[13px] transition-colors ${
                          active
                            ? 'bg-zinc-100 text-zinc-900 font-semibold'
                            : 'text-zinc-500 font-medium hover:bg-zinc-50 hover:text-zinc-900'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${active ? 'text-brand-green' : ''}`} />
                        {l.label}
                      </Link>
                    );
                  })}

                  {/* More Menu (dropdown) */}
                  {splitNavLinks(user.role).more.length > 0 && (
                    <div ref={moreRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setMoreOpen((o) => !o)}
                        aria-haspopup="menu"
                        aria-expanded={moreOpen}
                        className={`flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-md text-[13px] transition-colors cursor-pointer ${
                          moreOpen || splitNavLinks(user.role).more.some((l) => isLinkActive(l, pathname))
                            ? 'bg-zinc-100 text-zinc-900 font-semibold'
                            : 'text-zinc-500 font-medium hover:bg-zinc-50 hover:text-zinc-900'
                        }`}
                      >
                        <MoreHorizontal
                          className={`w-4 h-4 ${splitNavLinks(user.role).more.some((l) => isLinkActive(l, pathname)) ? 'text-brand-green' : ''}`}
                        />
                        More Menu
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {moreOpen && (
                        <div
                          role="menu"
                          className="absolute left-0 top-full mt-2 w-52 bg-white border border-zinc-200 rounded-xl shadow-lg p-1.5 z-50"
                        >
                          {splitNavLinks(user.role).more.map((l) => {
                            const Icon = ICONS[l.icon];
                            const active = isLinkActive(l, pathname);
                            return (
                              <Link
                                key={l.href}
                                href={l.href}
                                role="menuitem"
                                onClick={() => setMoreOpen(false)}
                                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors ${
                                  active
                                    ? 'bg-zinc-100 text-zinc-900 font-semibold'
                                    : 'text-zinc-500 font-medium hover:bg-zinc-50 hover:text-zinc-900'
                                }`}
                              >
                                <Icon className={`w-4 h-4 ${active ? 'text-brand-green' : ''}`} />
                                {l.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User Profile & Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {loading ? (
                <div className="w-16 sm:w-24 h-8 bg-zinc-100 rounded-md animate-pulse" />
              ) : user ? (
                <div className="flex items-center gap-2 sm:gap-3">
                  {/* User badge */}
                  <div className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md bg-white border border-zinc-200">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-brand-green/10 text-brand-green flex items-center justify-center font-semibold text-xs shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="hidden sm:block text-left">
                      <span className="block text-xs font-semibold text-zinc-900 leading-tight truncate max-w-[120px]">
                        {user.name}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-zinc-500 capitalize">
                        {user.role === 'admin' ? (
                          <Shield className="w-2.5 h-2.5 text-brand-green shrink-0" />
                        ) : (
                          <UserIcon className="w-2.5 h-2.5 text-brand-green shrink-0" />
                        )}
                        {user.role}
                      </span>
                    </div>
                  </div>

                  {/* Logout Button */}
                  <button
                    onClick={handleLogout}
                    title="Keluar / Logout"
                    className="p-1.5 sm:p-2 rounded-md text-zinc-500 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-md bg-brand-green hover:bg-brand-green/90 text-white font-medium text-xs sm:text-sm transition-colors shadow-xs"
                >
                  Masuk
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ALWAYS-VISIBLE Mobile Horizontal Scrolling Navigation Bar (Screens < md) */}
        {user && (
          <div className={`${splitNavLinks(user.role).more.length > 0 ? 'xl:hidden' : 'md:hidden'} border-t border-zinc-200 bg-white px-3 py-2.5 overflow-x-auto no-scrollbar`}>
            <div className="flex items-center gap-2 min-w-max">
              {navLinksFor(user.role).map((l) => {
                const Icon = ICONS[l.icon];
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-all active:scale-95 ${
                      isLinkActive(l, pathname)
                        ? 'bg-brand-green text-white font-semibold'
                        : 'bg-white text-zinc-500 font-medium border border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {l.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      {/* FIXED MOBILE BOTTOM APP BAR (Screens < md) for 1-Tap Navigation */}
      {user && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-zinc-200 px-2 py-2 flex justify-around items-center">
          {navLinksFor(user.role).filter((l) => l.short).map((l) => {
            const Icon = ICONS[l.icon];
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-md text-[10px] transition-all ${
                  isLinkActive(l, pathname) ? 'text-brand-green font-semibold' : 'text-zinc-500 font-medium hover:text-zinc-900'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{l.short}</span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}


