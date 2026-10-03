'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

const KIND_LABEL: Record<string, string> = {
  dikonfirmasi: 'Dikonfirmasi',
  keliru: 'Keliru (false positive)',
  kelas_diubah: 'Kelas diubah',
  severity_diubah: 'Severity diubah',
  kondisi_diubah: 'Kondisi/subtipe rambu diubah',
  terlewat: 'Terlewat (false negative)',
};

interface Row {
  id: string;
  kind: string;
  reason: string | null;
  severity: number | null;
  createdAt: string;
  actor: { name: string; role: string };
  session: { id: string; name: string };
  detection: { className: string; riskScore: number | null; priorityBand: string | null } | null;
  mediaAsset: { fileName: string } | null;
}

/** Riwayat koreksi petugas (hasil koreksi supervisor), dapat dilihat supervisor dan admin. */
export default function CorrectionsLog({ sessionId, title = 'Riwayat koreksi petugas', refreshKey = 0 }: { sessionId?: string; title?: string; refreshKey?: number }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams();
    if (sessionId) p.set('sessionId', sessionId);
    fetch(`/api/corrections?${p}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Gagal memuat riwayat koreksi.');
        setRows(j.corrections);
        setCounts(j.countsByKind || {});
      })
      .catch((e) => setError(e.message));
  }, [sessionId, refreshKey]);

  if (error) return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{error}</div>;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
        <h3 className="mr-auto text-sm font-bold text-slate-800">{title}</h3>
        {Object.entries(counts).map(([k, n]) => (
          <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{KIND_LABEL[k] ?? k}: {n}</span>
        ))}
      </div>
      {!rows ? (
        <p className="p-4 text-xs text-slate-500">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-xs text-slate-500">Belum ada koreksi.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="font-bold text-slate-900">{KIND_LABEL[r.kind] ?? r.kind}</span>
              {r.detection && <span className="text-slate-600">{r.detection.className}{r.detection.riskScore !== null ? ` · skor ${r.detection.riskScore}` : ''}</span>}
              {r.kind === 'severity_diubah' && r.severity && <span className="text-slate-600">→ severity {r.severity}</span>}
              {!sessionId && <Link href={`/supervisor/sessions/${r.session.id}`} className="text-blue-700 hover:underline">{r.session.name}</Link>}
              {r.mediaAsset && <span className="truncate text-slate-500">{r.mediaAsset.fileName}</span>}
              {r.reason && <span className="italic text-slate-600">“{r.reason}”</span>}
              <span className="ml-auto text-slate-500">{r.actor.name} · {new Date(r.createdAt).toLocaleString('id-ID')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
