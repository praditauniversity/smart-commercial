'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Activity, Loader2, MapPin } from 'lucide-react';
import type { MapMarker } from '@/lib/map-points';
import { BAND_LABEL, type PriorityBand } from '@/lib/risk';
import SessionRiskTable from './SessionRiskTable';
import CorrectionsLog from './CorrectionsLog';
import LatencyPanel from './LatencyPanel';

const LeafletDashboardMap = dynamic(() => import('./LeafletDashboardMap'), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400"><Loader2 className="h-6 w-6 animate-spin" /></div>,
});

const DEFAULT_CENTER: [number, number] = [-6.2088, 106.8456];
const LEGEND: { key: string; label: string; color: string }[] = [
  { key: 'kritikal', label: BAND_LABEL.kritikal, color: '#e11d48' },
  { key: 'tinggi', label: BAND_LABEL.tinggi, color: '#f97316' },
  { key: 'sedang', label: BAND_LABEL.sedang, color: '#f59e0b' },
  { key: 'rendah', label: BAND_LABEL.rendah, color: '#10b981' },
  { key: 'none', label: 'Tanpa skor', color: '#64748b' },
];

/** Halaman Analitik: peta sebaran, daftar lokasi, hasil koreksi supervisor, dan (admin) latensi sistem. */
export default function AnalyticsView({ sessionHref, showLatency }: { sessionHref: (id: string) => string; showLatency: boolean }) {
  const [markers, setMarkers] = useState<MapMarker[] | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/map-points')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Gagal memuat peta.');
        setMarkers(j.markers as MapMarker[]);
      })
      .catch((e) => setMapError(e.message));
  }, []);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Peta sebaran temuan">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900"><MapPin className="h-4 w-4 text-zinc-400" />Peta sebaran temuan</h2>
            <p className="text-xs text-zinc-500">Satu penanda per lokasi; angka = jumlah deteksi valid, warna = risiko tertinggi di lokasi itu.</p>
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500" aria-label="Legenda warna penanda">
            {LEGEND.map((l) => <li key={l.key} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />{l.label}</li>)}
          </ul>
        </div>
        <div className="relative h-96 w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50">
          {mapError ? <p role="alert" className="p-4 text-xs text-rose-700">{mapError}</p>
            : markers === null ? <div className="flex h-full items-center justify-center text-zinc-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
            : markers.length === 0 ? <p className="flex h-full items-center justify-center px-6 text-center text-xs text-zinc-400">Belum ada sesi dengan koordinat lokasi. Koordinat diisi surveyor saat membuat sesi (pilih titik atau area di peta).</p>
            : <LeafletDashboardMap markers={markers} defaultCenter={DEFAULT_CENTER} detailHref={sessionHref} />}
        </div>
      </section>

      <SessionRiskTable detailHref={sessionHref} />
      <CorrectionsLog title="Hasil koreksi supervisor" />
      {showLatency && <LatencyPanel />}
    </div>
  );
}

export function AnalyticsHeader({ subtitle }: { subtitle: string }) {
  return (
    <div>
      <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-zinc-900"><Activity className="h-6 w-6 shrink-0 text-brand-green" />Analitik</h1>
      <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
    </div>
  );
}
