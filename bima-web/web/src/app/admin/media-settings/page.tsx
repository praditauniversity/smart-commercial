'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clapperboard, Loader2, Save } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { useToast } from '@/components/ToastProvider';
import { DEFAULT_MAX_VIDEO_DURATION_SECONDS, MAX_VIDEO_DURATION_SECONDS, formatDuration } from '@/lib/media-limits';

export default function AdminMediaSettingsPage() {
  const toast = useToast();
  const [maxVideoSeconds, setMaxVideoSeconds] = useState(String(DEFAULT_MAX_VIDEO_DURATION_SECONDS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/media/limits')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gagal memuat pengaturan.');
        setMaxVideoSeconds(String(data.maxVideoDurationSeconds));
        setLoaded(true);
      })
      .catch((error) => toast.error(error.message || 'Gagal memuat pengaturan durasi video.'))
      .finally(() => setLoading(false));
  }, [toast]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const seconds = Number(maxVideoSeconds);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_VIDEO_DURATION_SECONDS) {
      toast.error(`Masukkan bilangan bulat antara 1 dan ${MAX_VIDEO_DURATION_SECONDS} detik.`);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/media/limits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxVideoDurationSeconds: seconds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gagal menyimpan pengaturan.');

      setMaxVideoSeconds(String(data.maxVideoDurationSeconds));
      setLoaded(true);
      toast.success(`Batas durasi video diubah menjadi ${formatDuration(data.maxVideoDurationSeconds)}.`);
    } catch (error: any) {
      toast.error(error.message || 'Gagal menyimpan batas durasi video.');
    } finally {
      setSaving(false);
    }
  };

  const parsedSeconds = Number(maxVideoSeconds);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24 sm:pb-16">
      <Navbar />
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Clapperboard className="w-6 h-6 text-blue-600" />
            Batas Media
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Atur durasi maksimum video yang boleh diunggah surveyor.
          </p>
        </div>

        <form onSubmit={save} className="bg-white border border-slate-200 rounded-2xl shadow-xs p-5 sm:p-7 space-y-5">
          <div className="max-w-md space-y-2">
            <label htmlFor="maxVideoSeconds" className="block text-sm font-semibold text-slate-800">
              Durasi maksimal video (detik)
            </label>
            <input
              id="maxVideoSeconds"
              type="number"
              min={1}
              max={MAX_VIDEO_DURATION_SECONDS}
              step={1}
              required
              value={maxVideoSeconds}
              onChange={(event) => setMaxVideoSeconds(event.target.value)}
              disabled={loading || saving}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            />
            <p className="text-xs text-slate-500">
              {Number.isInteger(parsedSeconds) && parsedSeconds > 0
                ? `Saat ini: ${formatDuration(parsedSeconds)}.`
                : 'Masukkan jumlah detik, misalnya 120 untuk 2 menit.'}{' '}
              Batas konfigurasi maksimum adalah {formatDuration(MAX_VIDEO_DURATION_SECONDS)}.
            </p>
          </div>

          {loaded && !loading && (
            <div className="flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              Server akan mengukur durasi file dan menolak video yang melewati batas ini.
            </div>
          )}

          <button
            type="submit"
            disabled={loading || saving || !loaded}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Simpan Batas
          </button>
        </form>
      </main>
    </div>
  );
}
