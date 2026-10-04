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
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-4">
        <h3 className="mr-auto text-sm font-semibold text-zinc-900">{title}</h3>
        {Object.entries(counts).map(([k, n]) => (
          <span key={k} className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700">{KIND_LABEL[k] ?? k}: {n}</span>
        ))}
      </div>
      {!rows ? (
        <p className="p-4 text-xs text-zinc-500">Memuat…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-xs text-zinc-500">Belum ada koreksi.</p>
      ) : (
        <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto text-xs">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
              <span className="font-semibold text-zinc-900">{KIND_LABEL[r.kind] ?? r.kind}</span>
              {r.detection && <span className="text-zinc-500">{r.detection.className}{r.detection.riskScore !== null ? ` · skor ${r.detection.riskScore}` : ''}</span>}
              {r.kind === 'severity_diubah' && r.severity && <span className="text-zinc-500">→ severity {r.severity}</span>}
              {!sessionId && <Link href={`/supervisor/sessions/${r.session.id}`} className="font-medium text-zinc-900 hover:text-brand-green hover:underline">{r.session.name}</Link>}
              {r.mediaAsset && <span className="truncate text-zinc-500">{r.mediaAsset.fileName}</span>}
              {r.reason && <span className="italic text-zinc-500">“{r.reason}”</span>}
              <span className="ml-auto text-zinc-500">{r.actor.name} · {new Date(r.createdAt).toLocaleString('id-ID')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
