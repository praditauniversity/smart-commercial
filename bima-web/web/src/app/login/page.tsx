'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Lock, Mail, ArrowRight, Shield, User, Loader2, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    const loginEmail = customEmail || email;
    const loginPass = customPass || password;

    if (!loginEmail || !loginPass) {
      setError('Email dan password wajib diisi.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal login.');
      }

      if (data.user.role === 'admin') {
        router.push('/admin/dashboard');
      } else {
        router.push('/surveyor/sessions');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const quickLoginAdmin = () => {
    setEmail('admin@bima.id');
    setPassword('admin123');
    handleLogin(undefined, 'admin@bima.id', 'admin123');
  };

  const quickLoginSurveyor = () => {
    setEmail('surveyor@bima.id');
    setPassword('surveyor123');
    handleLogin(undefined, 'surveyor@bima.id', 'surveyor123');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-3 sm:p-4 relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10 space-y-5 sm:space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/20 mb-1">
            <MapPin className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">BIMA Vision</h1>
          <p className="text-[10px] sm:text-xs text-slate-400 font-medium uppercase tracking-wider">
            Aplikasi Web AI Pemantauan Kawasan & Infrastruktur
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl p-5 sm:p-8 shadow-2xl space-y-5 sm:space-y-6">
          <div className="border-b border-slate-100 pb-3 sm:pb-4 text-center">
            <h2 className="font-bold text-slate-900 text-base sm:text-lg">Masuk ke Portal</h2>
            <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
              Gunakan kredensial akun Anda untuk mengakses sistem
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={(e) => handleLogin(e)} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="admin@bima.id atau surveyor@bima.id"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Memproses Masuk...
                </>
              ) : (
                <>
                  Masuk ke Aplikasi
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Logins */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <span className="block text-center text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Akses Cepat (Demo Akun)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={quickLoginSurveyor}
                className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-500 active:scale-95 bg-slate-50 hover:bg-blue-50/50 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-1.5 font-bold text-slate-800 group-hover:text-blue-600 text-xs truncate">
                  <User className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  Surveyor
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">surveyor@bima.id</div>
              </button>

              <button
                type="button"
                onClick={quickLoginAdmin}
                className="p-2.5 rounded-xl border border-slate-200 hover:border-indigo-500 active:scale-95 bg-slate-50 hover:bg-indigo-50/50 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-1.5 font-bold text-slate-800 group-hover:text-indigo-600 text-xs truncate">
                  <Shield className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  Admin
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate">admin@bima.id</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
