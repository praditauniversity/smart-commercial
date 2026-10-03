'use client';

import React, { useEffect, useState } from 'react';
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
  LogOut,
  Shield,
  User as UserIcon,
} from 'lucide-react';
import { isLinkActive, navLinksFor, type NavIcon } from '@/lib/nav-links';

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
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14 sm:h-16 items-center">
            {/* Brand Logo & Desktop Links */}
            <div className="flex items-center gap-4 lg:gap-6">
              <Link href="/" className="flex items-center gap-2 group shrink-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform shrink-0">
                  <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <span className="text-base sm:text-lg font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent leading-tight block">
                    BIMA Vision
                  </span>
                  <span className="hidden xl:block text-[10px] text-slate-400 font-medium tracking-wide uppercase">
                    Pemantauan Kawasan AI
                  </span>
                </div>
              </Link>

              {/* Desktop Nav links (Visible on md and above) */}
              {user && (
                <div className={`hidden items-center gap-0.5 ${navLinksFor(user.role).length > 5 ? '2xl:flex' : 'md:flex'}`}>
                  {navLinksFor(user.role).map((l) => {
                    const Icon = ICONS[l.icon];
                    return (
                      <Link
                        key={l.href}
                        href={l.href}
                        className={`flex items-center gap-1.5 whitespace-nowrap px-2.5 py-2 rounded-lg text-[13px] font-semibold transition-colors ${
                          isLinkActive(l, pathname)
                            ? 'bg-blue-50 text-blue-700 font-bold'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {l.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {/* User Profile & Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {loading ? (
                <div className="w-16 sm:w-24 h-8 bg-slate-100 rounded-lg animate-pulse" />
              ) : user ? (
                <div className="flex items-center gap-1.5 sm:gap-2.5">
                  {/* User badge */}
                  <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="hidden sm:block text-left">
                      <span className="block text-xs font-semibold text-slate-800 leading-tight truncate max-w-[120px]">
                        {user.name}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-slate-500 capitalize">
                        {user.role === 'admin' ? (
                          <Shield className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                        ) : (
                          <UserIcon className="w-2.5 h-2.5 text-blue-500 shrink-0" />
                        )}
                        {user.role}
                      </span>
                    </div>
                  </div>

                  {/* Logout Button */}
                  <button
                    onClick={handleLogout}
                    title="Keluar / Logout"
                    className="p-1.5 sm:p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 active:scale-95 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-sm transition-colors shadow-xs"
                >
                  Masuk
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ALWAYS-VISIBLE Mobile Horizontal Scrolling Navigation Bar (Screens < md) */}
        {user && (
          <div className={`${navLinksFor(user.role).length > 5 ? '2xl:hidden' : 'md:hidden'} border-t border-slate-200 bg-slate-50 px-2 py-2 overflow-x-auto no-scrollbar shadow-inner`}>
            <div className="flex items-center gap-1.5 min-w-max px-1">
              {navLinksFor(user.role).map((l) => {
                const Icon = ICONS[l.icon];
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all active:scale-95 ${
                      isLinkActive(l, pathname)
                        ? 'bg-blue-600 text-white shadow-xs font-bold'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
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
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-lg px-2 py-1.5 flex justify-around items-center">
          {navLinksFor(user.role).filter((l) => l.short).map((l) => {
            const Icon = ICONS[l.icon];
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-xl text-[10px] font-semibold transition-all ${
                  isLinkActive(l, pathname) ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900'
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


