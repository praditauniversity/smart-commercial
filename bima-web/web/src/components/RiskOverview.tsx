'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ClipboardCheck, Layers, Loader2, MapPin, ShieldAlert, Flag } from 'lucide-react';
import type { Overview, SessionSummary } from '@/lib/overview';
import { BAND_LABEL, GROUP_LABEL, type PriorityBand } from '@/lib/risk';
import { BAND_STYLE, ComplianceBadge, RiskBadge, SimulatedTag } from './RiskBadge';

interface Props {
  /** Tautan ke halaman detail sesi untuk peran ini. */
  detailHref: (sessionId: string) => string;
  title?: string;
  subtitle?: string;
  showSurveyorFilter?: boolean;
}

type Data = Overview & { scope: 'all' | 'own' };

const STATUS_LABEL: Record<string, string> = {
  berlangsung: 'Berlangsung',
  selesai_menunggu_submit: 'Menunggu submit',
  menunggu_review: 'Menunggu review',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  perlu_perbaikan: 'Perlu perbaikan',
};

function Kpi({ label, value, hint, icon, tone }: { label: string; value: number | string; hint?: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={`rounded-xl p-2 ${tone}`}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function BandBar({ bands }: { bands: Data['bands'] }) {
  const order: PriorityBand[] = ['kritikal', 'tinggi', 'sedang', 'rendah'];
  const total = order.reduce((n, b) => n + bands[b], 0) + bands.belumDinilai;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Sebaran temuan per pita prioritas">
        {order.map((b) => (bands[b] > 0 ? <div key={b} className={BAND_STYLE[b].dot} style={{ width: `${(bands[b] / total) * 100}%` }} title={`${BAND_LABEL[b]}: ${bands[b]}`} /> : null))}
        {bands.belumDinilai > 0 && <div className="bg-slate-300" style={{ width: `${(bands.belumDinilai / total) * 100}%` }} title={`Belum dinilai: ${bands.belumDinilai}`} />}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {order.map((b) => (
          <li key={b} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${BAND_STYLE[b].dot}`} />{BAND_LABEL[b]} <b className="font-mono">{bands[b]}</b></li>
        ))}
        <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" />Belum dinilai <b className="font-mono">{bands.belumDinilai}</b></li>
      </ul>
    </div>
  );
}

export default function RiskOverview({ detailHref, title = 'Ringkasan risiko lokasi', subtitle, showSurveyorFilter = false }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [surveyorId, setSurveyorId] = useState('');
  const [bandFilter, setBandFilter] = useState<'' | PriorityBand | 'tanpa_skor'>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (surveyorId) p.set('surveyorId', surveyorId);
      const res = await fetch(`/api/dashboard/overview?${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal memuat ringkasan.');
      setData(json);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status, surveyorId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>;
  if (!data) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat ringkasan…</div>;

  const surveyors = Array.from(new Map(data.sessions.map((s) => [s.surveyor.id, s.surveyor.name])).entries());
  const rows = data.sessions.filter((s) =>
    !bandFilter ? true : bandFilter === 'tanpa_skor' ? s.worstBand === null : s.worstBand === bandFilter
  );
  const urgent = data.bands.kritikal + data.bands.tinggi;
  const byGroup = (g: string) => data.byClass.filter((c) => c.group === g);

  return (
    <section className="space-y-5" aria-label={title}>
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Lokasi/sesi" value={data.totals.sessions} hint={`${data.totals.media} media`} icon={<MapPin className="h-4 w-4" />} tone="bg-blue-50 text-blue-600" />
        <Kpi label="Temuan valid" value={data.totals.validFindings} hint="tanpa yang ditandai keliru" icon={<Layers className="h-4 w-4" />} tone="bg-indigo-50 text-indigo-600" />
        <Kpi label="Tinggi + Kritikal" value={urgent} hint={`${data.bands.kritikal} kritikal`} icon={<ShieldAlert className="h-4 w-4" />} tone="bg-rose-50 text-rose-600" />
        <Kpi label="Sudah ditinjau" value={`${data.totals.reviewedFindings}/${data.totals.validFindings}`} hint="temuan oleh supervisor" icon={<ClipboardCheck className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-600" />
        <Kpi label="Keliru / terlewat" value={`${data.totals.falsePositives} / ${data.totals.missed}`} hint="false positive / false negative" icon={<Flag className="h-4 w-4" />} tone="bg-amber-50 text-amber-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <h3 className="mb-3 text-sm font-bold text-slate-800">{GROUP_LABEL.keselamatan_infrastruktur}</h3>
          <BandBar bands={data.bands} />
          <ul className="mt-3 divide-y divide-slate-100 text-xs">
            {byGroup('keselamatan_infrastruktur').map((c) => (
              <li key={c.className} className="flex justify-between py-1.5"><span>{c.displayName}</span><b className="font-mono">{c.count}</b></li>
            ))}
            {byGroup('keselamatan_infrastruktur').length === 0 && <li className="py-2 text-slate-400">Belum ada temuan.</li>}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <h3 className="mb-1 text-sm font-bold text-slate-800">{GROUP_LABEL.monitoring_kepatuhan}</h3>
          <p className="mb-3 text-[11px] text-slate-500">Hanya dideteksi dan dilaporkan; tidak ada skor risiko.</p>
          <ul className="divide-y divide-slate-100 text-xs">
            {byGroup('monitoring_kepatuhan').map((c) => (
              <li key={c.className} className="flex justify-between py-1.5"><span>{c.displayName}</span><b className="font-mono">{c.count}</b></li>
            ))}
            {byGroup('monitoring_kepatuhan').length === 0 && <li className="py-2 text-slate-400">Belum ada temuan.</li>}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 lg:col-span-1">
          <h3 className="mb-1 text-sm font-bold text-slate-800">Skema penilaian</h3>
          <p className="text-xs text-slate-600">Skor = Severity (1–3) × Exposure (1–3). Nilai mungkin: 1, 2, 3, 4, 6, 9.</p>
          <p className="mt-2 text-xs text-slate-600">Rendah 1–2 · Sedang 3–4 · Tinggi 6 · Kritikal 9 (hanya Berat × Tinggi).</p>
          <p className="mt-2 text-xs text-violet-700"><SimulatedTag /> Tingkat Paparan (Exposure) berasal dari zona contoh, bukan data lokasi riil.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3">
          <h3 className="mr-auto text-sm font-bold text-slate-800">Lokasi/sesi (risiko tertinggi di atas)</h3>
          <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium">
            <option value="">Semua status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select aria-label="Filter pita" value={bandFilter} onChange={(e) => setBandFilter(e.target.value as typeof bandFilter)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium">
            <option value="">Semua pita</option>
            {(['kritikal', 'tinggi', 'sedang', 'rendah'] as PriorityBand[]).map((b) => <option key={b} value={b}>{BAND_LABEL[b]}</option>)}
            <option value="tanpa_skor">Tanpa skor</option>
          </select>
          {showSurveyorFilter && (
            <select aria-label="Filter surveyor" value={surveyorId} onChange={(e) => setSurveyorId(e.target.value)} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium">
              <option value="">Semua surveyor</option>
              {surveyors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Sesi</th><th className="px-3 py-2">Surveyor</th><th className="px-3 py-2">Zona</th>
                <th className="px-3 py-2">Risiko tertinggi</th><th className="px-3 py-2">Infrastruktur</th><th className="px-3 py-2">Kepatuhan</th>
                <th className="px-3 py-2">Ditinjau</th><th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s: SessionSummary) => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold"><Link href={detailHref(s.id)} className="text-blue-700 hover:underline">{s.name}</Link></td>
                  <td className="px-3 py-2">{s.surveyor.name}</td>
                  <td className="px-3 py-2">{s.zone ? <span className="inline-flex items-center gap-1">{s.zone.name} <span className="font-mono text-slate-500">(E{s.zone.exposure})</span></span> : <span className="text-slate-400">tanpa zona</span>}</td>
                  <td className="px-3 py-2"><RiskBadge score={s.worstScore} band={s.worstBand} /></td>
                  <td className="px-3 py-2 font-mono">{s.infraCount}</td>
                  <td className="px-3 py-2">{s.complianceCount > 0 ? <span className="inline-flex items-center gap-1"><ComplianceBadge /><b className="font-mono">{s.complianceCount}</b></span> : <span className="text-slate-400">0</span>}</td>
                  <td className="px-3 py-2 font-mono">{s.reviewed}/{s.valid}{s.missedCount > 0 && <span className="ml-1 inline-flex items-center gap-0.5 text-amber-700" title="Temuan terlewat ditandai petugas"><AlertTriangle className="h-3 w-3" />{s.missedCount}</span>}</td>
                  <td className="px-3 py-2">{STATUS_LABEL[s.status] ?? s.status}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-400">Tidak ada sesi yang cocok.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
