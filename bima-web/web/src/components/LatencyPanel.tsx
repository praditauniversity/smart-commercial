'use client';

import React, { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { STAGES, STAGE_LABEL, TARGET_MS, type LatencySummary, type MediaLatency, type Stage } from '@/lib/latency';

interface Resp {
  summary: LatencySummary;
  media: { id: string; fileName: string; fileType: string; durationSeconds: number | null; session: { id: string; name: string }; latency: MediaLatency | null }[];
}

const sec = (ms: number | undefined | null) => (ms === undefined || ms === null || Number.isNaN(ms) ? '-' : `${(ms / 1000).toFixed(1)} dtk`);

/** Latensi per modul terhadap target ≤5 menit per lokasi (komputasi sistem; jeda menunggu manusia tidak dihitung). */
export default function LatencyPanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/latency')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Gagal memuat latensi.');
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div>;
  if (!data) return <p className="text-xs text-zinc-500">Memuat latensi…</p>;
  const s = data.summary;
  const max = Math.max(1, ...STAGES.map((st) => s.stageMeanMs[st] ?? 0));

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Latensi per modul">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Timer className="h-4 w-4 text-zinc-400" />
        <h3 className="mr-auto text-sm font-semibold text-zinc-900">Latensi per modul (target ≤ {TARGET_MS / 60000} menit per media)</h3>
        <span className="text-[11px] text-zinc-500">{s.count} media terukur</span>
      </div>
      {s.count === 0 || !s.totalMs ? (
        <p className="text-xs text-zinc-500">Belum ada media yang selesai diproses. Unggah dan proses sebuah media untuk melihat pengukuran.</p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ['Rata-rata', sec(s.totalMs.mean)],
              ['Median (P50)', sec(s.totalMs.p50)],
              ['P95', sec(s.totalMs.p95)],
              ['Terlama', sec(s.totalMs.max)],
              ['Memenuhi target', `${s.withinTarget}/${s.count}`],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-center">
                <div className="text-xs font-medium text-zinc-500">{k}</div>
                <div className="font-mono text-base font-semibold text-zinc-900">{v}</div>
              </div>
            ))}
          </div>
          <ul className="space-y-2 text-xs">
            {STAGES.map((st: Stage) => (
              <li key={st} className="grid grid-cols-[minmax(0,12rem)_1fr_5rem] items-center gap-2">
                <span className={st === s.slowestStage ? 'font-semibold text-zinc-900' : 'text-zinc-500'}>{STAGE_LABEL[st]}</span>
                <span className="h-2 rounded-full bg-zinc-100"><span className={`block h-2 rounded-full ${st === s.slowestStage ? 'bg-brand-orange' : 'bg-brand-green'}`} style={{ width: `${((s.stageMeanMs[st] ?? 0) / max) * 100}%` }} /></span>
                <span className="text-right font-mono">{sec(s.stageMeanMs[st])}</span>
              </li>
            ))}
          </ul>
          {s.slowestStage && <p className="mt-2 text-[11px] text-zinc-500">Tahap terlama rata-rata: <b>{STAGE_LABEL[s.slowestStage]}</b>.</p>}
        </>
      )}
      <p className="mt-2 text-[11px] text-zinc-500">Hanya waktu komputasi sistem; jeda menunggu manusia (mis. menekan “proses” belakangan) tidak dihitung. Diukur di mesin tempat sistem berjalan, belum pada perangkat produksi.</p>
    </section>
  );
}
