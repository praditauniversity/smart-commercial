'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2 } from 'lucide-react';
import type { Overview, SessionSummary } from '@/lib/overview';
import { BAND_LABEL, type PriorityBand } from '@/lib/risk';
import { RiskBadge } from './RiskBadge';

const STATUS_LABEL: Record<string, string> = {
  berlangsung: 'Berlangsung',
  selesai_menunggu_submit: 'Menunggu submit',
  menunggu_review: 'Menunggu review',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  perlu_perbaikan: 'Perlu perbaikan',
};

/** Tabel lokasi/sesi dengan filter status, pita risiko, dan surveyor (risiko tertinggi di atas). */
export default function SessionRiskTable({ detailHref, showSurveyorFilter = true }: { detailHref: (sessionId: string) => string; showSurveyorFilter?: boolean }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [surveyorId, setSurveyorId] = useState('');
  const [bandFilter, setBandFilter] = useState<'' | PriorityBand | 'tanpa_skor'>('');
  const [surveyors, setSurveyors] = useState<[string, string][]>([]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (surveyorId) p.set('surveyorId', surveyorId);
    setLoading(true);
    fetch(`/api/dashboard/overview?${p}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Gagal memuat daftar lokasi.');
        setData(j);
        setError(null);
        // Daftar surveyor diambil dari pemuatan tanpa filter surveyor agar pilihan tidak menyusut sendiri.
        if (!surveyorId) setSurveyors(Array.from(new Map((j.sessions as SessionSummary[]).map((s) => [s.surveyor.id, s.surveyor.name])).entries()));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [status, surveyorId]);

  const rows = useMemo(() => (data?.sessions ?? []).filter((s) => (!bandFilter ? true : bandFilter === 'tanpa_skor' ? s.worstBand === null : s.worstBand === bandFilter)), [data, bandFilter]);

  if (error) return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>;

  const select = 'rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-sm';
  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-sm" aria-label="Daftar lokasi dan sesi">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-4">
        <h3 className="mr-auto text-sm font-semibold text-zinc-900">Lokasi/sesi (risiko tertinggi di atas)</h3>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)} className={select}>
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="Filter pita" value={bandFilter} onChange={(e) => setBandFilter(e.target.value as typeof bandFilter)} className={select}>
          <option value="">Semua pita</option>
          {(['kritikal', 'tinggi', 'sedang', 'rendah'] as PriorityBand[]).map((b) => <option key={b} value={b}>{BAND_LABEL[b]}</option>)}
          <option value="tanpa_skor">Tanpa skor</option>
        </select>
        {showSurveyorFilter && (
          <select aria-label="Filter surveyor" value={surveyorId} onChange={(e) => setSurveyorId(e.target.value)} className={select}>
            <option value="">Semua surveyor</option>
            {surveyors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-white text-sm font-medium text-zinc-500 shadow-[inset_0_-1px_0_var(--color-zinc-100)]">
            <tr>
              <th className="px-4 py-3">Sesi</th><th className="px-4 py-3">Surveyor</th><th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Risiko tertinggi</th><th className="px-4 py-3" title="Deteksi pada frame sampel">Infrastruktur</th><th className="px-4 py-3" title="Monitoring Kepatuhan: tanpa skor risiko">Kepatuhan (tanpa skor)</th>
              <th className="px-4 py-3">Ditinjau</th><th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 text-zinc-900">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-zinc-50/60">
                <td className="px-4 py-3 font-semibold"><Link href={detailHref(s.id)} className="text-zinc-900 hover:text-brand-green hover:underline">{s.name}</Link></td>
                <td className="px-4 py-3 text-zinc-500">{s.surveyor.name}</td>
                <td className="px-4 py-3">{s.zone ? <span className="inline-flex items-center gap-1">{s.zone.name} <span className="font-mono text-zinc-500">(E{s.zone.exposure})</span></span> : <span className="text-zinc-400">tanpa zona</span>}</td>
                <td className="px-4 py-3"><RiskBadge score={s.worstScore} band={s.worstBand} /></td>
                <td className="px-4 py-3 font-mono">{s.infraCount}</td>
                <td className="px-4 py-3"><span className={s.complianceCount > 0 ? 'font-mono' : 'font-mono text-zinc-400'}>{s.complianceCount}</span></td>
                <td className="px-4 py-3 font-mono">{s.reviewed}/{s.valid}{s.missedCount > 0 && <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700" title="Temuan terlewat ditandai petugas"><AlertTriangle className="h-3 w-3" />{s.missedCount}</span>}</td>
                <td className="px-4 py-3 text-zinc-500">{STATUS_LABEL[s.status] ?? s.status}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-zinc-400">Tidak ada sesi yang cocok.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
