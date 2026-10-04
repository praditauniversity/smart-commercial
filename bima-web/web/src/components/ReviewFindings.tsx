'use client';

import React, { useState } from 'react';
import { CheckCircle2, CircleHelp, SearchX, XCircle } from 'lucide-react';
import { formatTimestamp } from '@/lib/media-view';
import { BAND_LABEL, type PriorityBand } from '@/lib/risk';
import type { ReviewCounts } from '@/lib/review-summary';

export interface LiveFindingItem {
  id: string; displayName: string; mediaFileName: string | null; frameIndex?: number | null; timestampSeconds: number | null;
  confidence?: number | null; band?: PriorityBand | null; score?: number | null; conditionLabel?: string | null; reason: string | null;
}
export interface LiveFindings {
  counts: ReviewCounts;
  benar: LiveFindingItem[];
  keliru: LiveFindingItem[];
  belumDitinjau: LiveFindingItem[];
  terlewat: (LiveFindingItem & { actorName: string | null })[];
}

/** Empat chip ringkas untuk kartu antrean: benar / keliru / terlewat (+ belum ditinjau bila ada). */
export function ReviewCountChips({ counts }: { counts: ReviewCounts }) {
  const chip = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold';
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Hasil koreksi supervisor">
      <span className={`${chip} bg-emerald-100 text-emerald-800`} title="Temuan model yang dikonfirmasi benar oleh supervisor"><CheckCircle2 className="h-3 w-3" />{counts.benar} benar</span>
      <span className={`${chip} bg-slate-200 text-slate-700`} title="Temuan model yang ditandai keliru (false positive)"><XCircle className="h-3 w-3" />{counts.keliru} keliru</span>
      <span className={`${chip} bg-orange-100 text-orange-800`} title="Objek yang tidak terdeteksi model, dicatat supervisor (false negative)"><SearchX className="h-3 w-3" />{counts.terlewat} terlewat</span>
      {counts.belumDitinjau > 0 && (
        <span className={`${chip} bg-amber-100 text-amber-800`} title="Temuan model yang belum dikoreksi supervisor"><CircleHelp className="h-3 w-3" />{counts.belumDitinjau} belum ditinjau</span>
      )}
    </div>
  );
}

function Row({ f }: { f: LiveFindingItem }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-xs">
      <span className="font-semibold text-slate-900">{f.displayName}</span>
      {f.mediaFileName && <span className="break-all text-slate-500">{f.mediaFileName}</span>}
      {f.timestampSeconds !== null && f.timestampSeconds !== undefined && <span className="font-mono text-slate-500">{formatTimestamp(f.timestampSeconds)}</span>}
      {f.confidence !== null && f.confidence !== undefined && <span className="font-mono text-slate-500">conf {f.confidence.toFixed(2)}</span>}
      {f.band && f.score ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{BAND_LABEL[f.band]} · {f.score}</span> : null}
      {f.conditionLabel === 'normal' && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">normal</span>}
      {f.reason && <span className="basis-full text-slate-600">Alasan: {f.reason}</span>}
    </li>
  );
}

const SECTIONS = [
  { key: 'benar', title: 'Dikonfirmasi benar', tone: 'border-emerald-300 bg-emerald-50 text-emerald-900', hint: 'Temuan model yang dinyatakan benar oleh supervisor.' },
  { key: 'keliru', title: 'Keliru (false positive)', tone: 'border-slate-300 bg-slate-100 text-slate-800', hint: 'Temuan model yang dinyatakan salah; tidak dihitung dalam skor.' },
  { key: 'terlewat', title: 'Terlewat (false negative)', tone: 'border-orange-300 bg-orange-50 text-orange-900', hint: 'Objek di lapangan yang tidak terdeteksi model, dicatat supervisor.' },
  { key: 'belumDitinjau', title: 'Belum ditinjau', tone: 'border-amber-300 bg-amber-50 text-amber-900', hint: 'Temuan model yang belum dikoreksi supervisor.' },
] as const;

/** Rincian hasil koreksi supervisor pada halaman review, dibedakan per kelompok. */
export default function ReviewFindings({ findings }: { findings: LiveFindings }) {
  const [open, setOpen] = useState<(typeof SECTIONS)[number]['key']>(findings.counts.benar > 0 ? 'benar' : findings.counts.keliru > 0 ? 'keliru' : 'terlewat');
  const list = findings[open] as LiveFindingItem[];
  const section = SECTIONS.find((s) => s.key === open)!;
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" aria-label="Hasil koreksi supervisor">
      <div>
        <h2 className="text-sm font-bold text-slate-900">Hasil koreksi supervisor</h2>
        <p className="text-xs text-slate-500">Dihitung dari kondisi sesi saat ini. Terlewat adalah catatan supervisor, bukan keluaran model.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {SECTIONS.map((s) => {
          const n = findings.counts[s.key as keyof ReviewCounts] as number;
          return (
            <button
              key={s.key} type="button" onClick={() => setOpen(s.key)} aria-pressed={open === s.key}
              className={`rounded-xl border p-3 text-left transition-all ${s.tone} ${open === s.key ? 'ring-2 ring-blue-500' : 'opacity-80 hover:opacity-100'}`}
            >
              <div className="text-2xl font-extrabold">{n}</div>
              <div className="text-xs font-semibold">{s.title}</div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">{section.hint}</p>
      {list.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">Tidak ada data pada kelompok ini.</p>
      ) : (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {list.map((f) => <Row key={f.id} f={f} />)}
        </ul>
      )}
    </section>
  );
}
