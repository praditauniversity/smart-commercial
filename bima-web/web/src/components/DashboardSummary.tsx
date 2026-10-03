'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardCheck, ImageOff, Layers, Loader2, MapPin, ShieldAlert, X } from 'lucide-react';
import type { Overview, SessionSummary } from '@/lib/overview';
import type { FindingTile } from '@/lib/dashboard-findings';
import { BAND_LABEL, GROUP_LABEL, type PriorityBand } from '@/lib/risk';
import { classColor } from '@/lib/class-colors';
import { BAND_STYLE, RiskBadge } from './RiskBadge';

const BANDS: PriorityBand[] = ['kritikal', 'tinggi', 'sedang', 'rendah'];

export interface WorkflowItem {
  label: string;
  value: React.ReactNode;
  hint: string;
  href?: string;
  tone?: 'amber' | 'blue' | 'emerald' | 'rose' | 'slate';
}

const TONE: Record<NonNullable<WorkflowItem['tone']>, string> = {
  amber: 'border-amber-300 bg-amber-50 text-amber-900',
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-900',
  slate: 'border-slate-200 bg-white text-slate-900',
};

function Kpi({ label, value, hint, icon, tone }: { label: string; value: React.ReactNode; hint: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
        <span className={`rounded-xl p-2 ${tone}`}>{icon}</span>
      </div>
      <div className="mt-1.5 text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{hint}</div>
    </div>
  );
}

function Panel({ title, hint, children, aside }: { title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Tile({ tile, href }: { tile: FindingTile; href: string }) {
  const names = [...new Set(tile.boxes.map((b) => b.displayName))];
  return (
    <Link href={href} className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition-shadow hover:border-blue-300 hover:shadow-md">
      <div className="relative flex h-40 items-center justify-center bg-slate-950">
        <div className="relative inline-block max-h-full max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={tile.imageUrl} alt={`Temuan pada ${tile.sessionName}`} className="block max-h-40 w-auto max-w-full" loading="lazy" />
          <div className="pointer-events-none absolute inset-0">
            {tile.boxes.map((b) => {
              const c = classColor(b.className);
              return <span key={b.id} className="absolute border-2" style={{ left: `${b.bbox.x * 100}%`, top: `${b.bbox.y * 100}%`, width: `${b.bbox.width * 100}%`, height: `${b.bbox.height * 100}%`, borderColor: c, backgroundColor: `${c}1f` }} />;
            })}
          </div>
        </div>
        {tile.worstBand && (
          <span className={`absolute left-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-bold ${BAND_STYLE[tile.worstBand].chip}`}>{BAND_LABEL[tile.worstBand]}</span>
        )}
      </div>
      <div className="space-y-0.5 p-2.5">
        <div className="truncate text-xs font-bold text-slate-900 group-hover:text-blue-700">{tile.sessionName}</div>
        <div className="flex flex-wrap gap-x-2 text-[11px] text-slate-600">
          {names.slice(0, 3).map((n) => <span key={n}>{n}</span>)}
          {names.length > 3 && <span className="text-slate-400">+{names.length - 3}</span>}
        </div>
        <div className="text-[10px] text-slate-400">{tile.boxes.length} kotak pada gambar ini</div>
      </div>
    </Link>
  );
}

/**
 * Ringkasan dashboard untuk semua peran: KPI, status alur kerja, dua grafik yang dapat diklik (prioritas dan kelas),
 * panel gambar temuan yang mengikuti filter, dan lokasi berisiko tertinggi. Data surveyor dibatasi di server.
 */
export default function DashboardSummary({ sessionHref, workflow, allSessionsHref, allSessionsLabel }: {
  sessionHref: (sessionId: string) => string;
  /** Dihitung dari daftar sesi; null = tanpa strip alur kerja. */
  workflow?: (sessions: SessionSummary[], totals: Overview['totals']) => WorkflowItem[];
  allSessionsHref: string;
  allSessionsLabel: string;
}) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [band, setBand] = useState<PriorityBand | ''>('');
  const [className, setClassName] = useState('');
  const [tiles, setTiles] = useState<FindingTile[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tilesLoading, setTilesLoading] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/overview')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Gagal memuat ringkasan.');
        setData(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    const p = new URLSearchParams({ limit: '12' });
    if (band) p.set('band', band);
    if (className) p.set('className', className);
    setTilesLoading(true);
    fetch(`/api/dashboard/findings?${p}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setTiles(j.tiles);
        setTotal(j.total);
      })
      .catch((e) => { if (e.name !== 'AbortError') setTiles([]); })
      .finally(() => { if (!ctrl.signal.aborted) setTilesLoading(false); });
    return () => ctrl.abort();
  }, [band, className]);

  const maxClass = useMemo(() => Math.max(1, ...(data?.byClass.map((c) => c.count) ?? [1])), [data]);

  if (error) return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>;
  if (!data) return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat ringkasan…</div>;

  const urgent = data.bands.kritikal + data.bands.tinggi;
  const reviewedPct = data.totals.validFindings ? Math.round((data.totals.reviewedFindings / data.totals.validFindings) * 100) : 0;
  const bandMax = Math.max(1, ...BANDS.map((b) => data.bands[b]));
  const topSessions = data.sessions.filter((s) => s.worstBand).slice(0, 5);
  const items = workflow?.(data.sessions, data.totals) ?? [];
  const activeClass = data.byClass.find((c) => c.className === className);

  return (
    <div className="space-y-5">
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Status alur kerja">
          {items.map((it, i) => {
            const body = (
              <>
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-70 sm:gap-2 sm:text-[11px]" title={it.hint}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/70 text-[11px]">{i + 1}</span>{it.label}
                </div>
                <div className="mt-1 text-2xl font-bold">{it.value}</div>
                <div className="flex items-center justify-between gap-2 text-xs opacity-80"><span className="hidden sm:inline">{it.hint}</span>{it.href && <ArrowRight className="h-3.5 w-3.5 shrink-0" />}</div>
              </>
            );
            const cls = `block rounded-2xl border p-3 sm:p-4 ${TONE[it.tone ?? 'slate']}`;
            return it.href ? <Link key={it.label} href={it.href} className={`${cls} transition-shadow hover:shadow-md`}>{body}</Link> : <div key={it.label} className={cls}>{body}</div>;
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Lokasi/sesi" value={data.totals.sessions} hint={`${data.totals.media} media`} icon={<MapPin className="h-4 w-4" />} tone="bg-blue-50 text-blue-600" />
        <Kpi label="Deteksi valid" value={data.totals.validFindings} hint="kotak pada frame sampel" icon={<Layers className="h-4 w-4" />} tone="bg-indigo-50 text-indigo-600" />
        <Kpi label="Tinggi + Kritikal" value={urgent} hint={`${data.bands.kritikal} kritikal`} icon={<ShieldAlert className="h-4 w-4" />} tone="bg-rose-50 text-rose-600" />
        <Kpi label="Sudah ditinjau" value={`${reviewedPct}%`} hint={`${data.totals.reviewedFindings} dari ${data.totals.validFindings} deteksi`} icon={<ClipboardCheck className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Panel title="Sebaran prioritas" hint={`${GROUP_LABEL.keselamatan_infrastruktur}. Klik baris untuk memfilter gambar temuan.`}>
            <ul className="space-y-1.5">
              {BANDS.map((b) => (
                <li key={b}>
                  <button type="button" onClick={() => setBand(band === b ? '' : b)} disabled={data.bands[b] === 0} aria-pressed={band === b}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors enabled:hover:bg-slate-50 disabled:opacity-50 ${band === b ? 'bg-blue-50 ring-1 ring-blue-400' : ''}`}>
                    <span className="w-16 shrink-0 font-semibold text-slate-700">{BAND_LABEL[b]}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${BAND_STYLE[b].dot}`} style={{ width: `${(data.bands[b] / bandMax) * 100}%` }} /></span>
                    <b className="w-8 shrink-0 text-right font-mono">{data.bands[b]}</b>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-500">
              Skor = Severity × Exposure (1, 2, 3, 4, 6, 9). {data.bands.belumDinilai > 0 && <>Belum dinilai: <b className="font-mono">{data.bands.belumDinilai}</b>. </>}
              {data.totals.normalSigns > 0 && <>Rambu normal: <b className="font-mono">{data.totals.normalSigns}</b> (tanpa skor).</>}
            </p>
          </Panel>
        </div>
        <div className="lg:col-span-3">
          <Panel title="Temuan per kelas" hint="Warna kelas sama dengan kotak pada gambar. Klik batang untuk memfilter.">
            {data.byClass.length === 0 ? <p className="py-4 text-xs text-slate-400">Belum ada temuan.</p> : (
              <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {data.byClass.map((c) => (
                  <li key={c.className}>
                    <button type="button" onClick={() => setClassName(className === c.className ? '' : c.className)} aria-pressed={className === c.className}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs transition-colors hover:bg-slate-50 ${className === c.className ? 'bg-blue-50 ring-1 ring-blue-400' : ''}`}>
                      <span className="w-40 shrink-0 truncate font-semibold text-slate-700" title={c.displayName}>{c.displayName}</span>
                      <span className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full" style={{ width: `${(c.count / maxClass) * 100}%`, backgroundColor: classColor(c.className) }} /></span>
                      <b className="w-8 shrink-0 text-right font-mono">{c.count}</b>
                      {c.group === 'monitoring_kepatuhan' && <span className="shrink-0 rounded bg-slate-100 px-1 text-[9px] font-semibold text-slate-500" title={GROUP_LABEL.monitoring_kepatuhan}>tanpa skor</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        title="Gambar temuan"
        hint={`Risiko tertinggi lebih dulu. ${total} temuan sesuai filter.`}
        aside={(band || className) ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {band && <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-bold ${BAND_STYLE[band].chip}`}>{BAND_LABEL[band]}</span>}
            {className && <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 font-bold text-slate-700"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: classColor(className) }} />{activeClass?.displayName ?? className}</span>}
            <button type="button" onClick={() => { setBand(''); setClassName(''); }} className="inline-flex items-center gap-0.5 rounded-full border border-slate-200 px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-100"><X className="h-3 w-3" />Hapus filter</button>
          </div>
        ) : undefined}
      >
        {tiles === null ? (
          <div className="flex items-center gap-2 py-6 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat gambar…</div>
        ) : tiles.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-8 text-xs text-slate-400"><ImageOff className="h-6 w-6" />Tidak ada gambar temuan untuk filter ini.</div>
        ) : (
          <div className={`grid max-h-[34rem] grid-cols-2 gap-3 overflow-y-auto p-0.5 transition-opacity md:grid-cols-3 xl:grid-cols-4 ${tilesLoading ? 'opacity-60' : ''}`}>
            {tiles.map((t) => <Tile key={t.key} tile={t} href={sessionHref(t.sessionId)} />)}
          </div>
        )}
      </Panel>

      <Panel title="Lokasi berisiko tertinggi" aside={<Link href={allSessionsHref} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">{allSessionsLabel}<ArrowRight className="h-3 w-3" /></Link>}>
        {topSessions.length === 0 ? <p className="py-3 text-xs text-slate-400">Belum ada lokasi dengan skor risiko.</p> : (
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-xs">
            {topSessions.map((s) => (
              <li key={s.id}>
                <Link href={sessionHref(s.id)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2 hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate font-semibold text-blue-700">{s.name}</span>
                  <span className="text-slate-500">{s.zone ? `${s.zone.name} (E${s.zone.exposure})` : 'tanpa zona'}</span>
                  <RiskBadge score={s.worstScore} band={s.worstBand} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
