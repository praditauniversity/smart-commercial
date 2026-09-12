'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MapPin,
  ArrowRight,
  Shield,
  Camera,
  Layers,
  Cpu,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          if (data.user.role === 'admin') {
            router.push('/admin/dashboard');
          } else {
            router.push('/surveyor/sessions');
          }
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <span className="text-sm font-medium">Menghubungkan ke BIMA Vision...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between selection:bg-blue-500 selection:text-white">
      {/* Navbar */}
      <header className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 flex justify-between items-center">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <MapPin className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div>
            <span className="text-lg sm:text-xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
              BIMA Vision
            </span>
            <span className="block text-[9px] sm:text-[10px] text-slate-400 font-medium tracking-wide uppercase">
              Pemantauan Kawasan AI
            </span>
          </div>
        </div>

        <Link
          href="/login"
          className="px-4 sm:px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-semibold text-xs transition-all shadow-md shadow-blue-600/30"
        >
          Masuk Portal
        </Link>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 text-center space-y-6 sm:space-y-8 my-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[11px] sm:text-xs font-semibold max-w-full text-left">
          <Cpu className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400 shrink-0" />
          <span className="truncate">Vision-Language AI & OpenStreetMap Geoportal</span>
        </div>

        <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-100 max-w-3xl mx-auto leading-tight">
          Pemantauan Kondisi Infrastruktur Kawasan Berbasis{' '}
          <span className="bg-gradient-to-r from-blue-400 via-indigo-300 to-cyan-400 bg-clip-text text-transparent">
            Artificial Intelligence
          </span>
        </h1>

        <p className="text-sm sm:text-base md:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Platform survei lapangan cerdas yang memproses deteksi foto dan video secara otomatis, memisahkan lifecycle media, menyaring duplikasi, dan mengamankan alur review berjenjang.
        </p>

        <div className="flex flex-wrap justify-center gap-4 pt-2 sm:pt-4">
          <Link
            href="/login"
            className="w-full sm:w-auto px-8 py-3 sm:py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-xl shadow-blue-500/25 flex items-center justify-center gap-2 transition-all"
          >
            Mulai Survei Lapangan
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 pt-8 sm:pt-12 text-left">
          <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xs space-y-2">
            <div className="p-2.5 sm:p-3 bg-blue-500/10 text-blue-400 rounded-xl w-fit">
              <Camera className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-slate-200">Asynchronous Media Pipeline</h3>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
              Upload multi-gambar atau video tanpa memblokir sesi survei. AI mengevaluasi kondisi dan kelayakan otomatis.
            </p>
          </div>

          <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xs space-y-2">
            <div className="p-2.5 sm:p-3 bg-indigo-500/10 text-indigo-400 rounded-xl w-fit">
              <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-slate-200">Deduplication & Conflict Resolver</h3>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
              Mencegah temuan duplikat pada frame berdekatan dan mendeteksi konflik kelas mutually exclusive secara presisi.
            </p>
          </div>

          <div className="p-5 sm:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 backdrop-blur-xs space-y-2">
            <div className="p-2.5 sm:p-3 bg-teal-500/10 text-teal-400 rounded-xl w-fit">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <h3 className="font-bold text-xs sm:text-sm text-slate-200">State Machine & Review Flow</h3>
            <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">
              Snapshot submission immutable dengan alur approval admin, riwayat audit log, dan mekanisme revisi re-submit.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6 border-t border-slate-900 text-center text-xs text-slate-500">
        &copy; 2026 BIMA Vision - Aplikasi Pemantauan Kawasan Berbasis AI.
      </footer>
    </div>
  );
}
