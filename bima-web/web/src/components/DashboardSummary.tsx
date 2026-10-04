'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardCheck, ImageOff, Layers, Loader2, MapPin, ShieldAlert, X } from 'lucide-react';
import type { Overview, SessionSummary } from '@/lib/overview';
import type { FindingTile } from '@/lib/dashboard-findings';
import { BAND_LABEL, GROUP_LABEL, type CategoryGroup, type PriorityBand } from '@/lib/risk';
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
  amber: 'border-zinc-200 border-l-4 border-l-brand-orange bg-white text-zinc-900',
  blue: 'border-zinc-200 border-l-4 border-l-zinc-400 bg-white text-zinc-900',
  emerald: 'border-zinc-200 border-l-4 border-l-brand-green bg-white text-zinc-900',
  rose: 'border-zinc-200 border-l-4 border-l-rose-600 bg-white text-zinc-900',
  slate: 'border-zinc-200 bg-white text-zinc-900',
};

function Kpi({ label, value, hint, icon, tone }: { label: string; value: React.ReactNode; hint: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-500">{label}</span>
        <span className={`rounded-lg p-2 ${tone}`}>{icon}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{hint}</div>
    </div>
  );
}

function Panel({ title, hint, children, aside, fill }: { title: string; hint?: string; children: React.ReactNode; aside?: React.ReactNode; fill?: boolean }) {
  return (
    <section className={`rounded-xl border border-zinc-200 bg-white p-5 shadow-sm ${fill ? 'flex h-full flex-col' : ''}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-900">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>}
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
    <Link href={href} className="group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:border-zinc-300 hover:shadow-md">
      <div className="relative flex h-40 items-center justify-center bg-zinc-950">
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
      <div className="space-y-1 p-3">
        <div className="truncate text-sm font-medium text-zinc-900 group-hover:underline">{tile.sessionName}</div>
        <div className="flex flex-wrap gap-x-2 text-xs text-zinc-500">
          {names.slice(0, 3).map((n) => <span key={n}>{n}</span>)}
          {names.length > 3 && <span className="text-zinc-400">+{names.length - 3}</span>}
        </div>
        <div className="text-[11px] text-zinc-400">{tile.boxes.length} kotak pada gambar ini</div>
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
  const [group, setGroup] = useState<CategoryGroup>('keselamatan_infrastruktur');
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

  if (error) return <div role="alert" className="rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-700 shadow-sm">{error}</div>;
  if (!data) return <div className="flex items-center gap-2 p-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat ringkasan…</div>;

  const urgent = data.bands.kritikal + data.bands.tinggi;
  const reviewedPct = data.totals.validFindings ? Math.round((data.totals.reviewedFindings / data.totals.validFindings) * 100) : 0;
  const bandMax = Math.max(1, ...BANDS.map((b) => data.bands[b]));
  const topSessions = data.sessions.filter((s) => s.worstBand).slice(0, 5);
  const items = workflow?.(data.sessions, data.totals) ?? [];
  const activeClass = data.byClass.find((c) => c.className === className);
  const complianceClasses = data.byClass.filter((c) => c.group === 'monitoring_kepatuhan');
  const complianceMax = Math.max(1, ...complianceClasses.map((c) => c.count));
  const complianceTotal = complianceClasses.reduce((n, c) => n + c.count, 0);
  const infraTotal = BANDS.reduce((n, b) => n + data.bands[b], 0) + data.bands.belumDinilai;

  // Filter band hanya berlaku untuk Keselamatan Infrastruktur; filter kelas dibersihkan bila kelasnya milik kelompok lain.
  const selectGroup = (g: CategoryGroup) => {
    if (g === group) return;
    setGroup(g);
    if (g === 'monitoring_kepatuhan') setBand('');
    else if (activeClass?.group === 'monitoring_kepatuhan') setClassName('');
  };

  return (
    <div className="space-y-5">
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Status alur kerja">
          {items.map((it, i) => {
            const body = (
              <>
                <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500 sm:gap-2" title={it.hint}>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600">{i + 1}</span>{it.label}
                </div>
                <div className="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-900">{it.value}</div>
                <div className="flex items-center justify-between gap-2 text-xs text-zinc-500"><span className="hidden sm:inline">{it.hint}</span>{it.href && <ArrowRight className="h-3.5 w-3.5 shrink-0" />}</div>
              </>
            );
            const cls = `block rounded-xl border p-3 shadow-sm sm:p-5 ${TONE[it.tone ?? 'slate']}`;
            return it.href ? <Link key={it.label} href={it.href} className={`${cls} transition-shadow hover:border-zinc-300 hover:shadow-md`}>{body}</Link> : <div key={it.label} className={cls}>{body}</div>;
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label="Lokasi/sesi" value={data.totals.sessions} hint={`${data.totals.media} media`} icon={<MapPin className="h-4 w-4" />} tone="bg-zinc-100 text-zinc-600" />
        <Kpi label="Deteksi valid" value={data.totals.validFindings} hint="kotak pada frame sampel" icon={<Layers className="h-4 w-4" />} tone="bg-zinc-100 text-zinc-600" />
        <Kpi label="Tinggi + Kritikal" value={urgent} hint={`${data.bands.kritikal} kritikal`} icon={<ShieldAlert className="h-4 w-4" />} tone="bg-rose-50 text-rose-600" />
        <Kpi label="Sudah ditinjau" value={`${reviewedPct}%`} hint={`${data.totals.reviewedFindings} dari ${data.totals.validFindings} deteksi`} icon={<ClipboardCheck className="h-4 w-4" />} tone="bg-brand-green/10 text-brand-green" />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Panel title="Sebaran prioritas" hint="Pilih kelompok, lalu klik baris untuk memfilter gambar temuan." fill>
            <div role="tablist" aria-label="Kelompok prioritas" className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1">
              {([['keselamatan_infrastruktur', infraTotal], ['monitoring_kepatuhan', complianceTotal]] as const).map(([g, n]) => (
                <button key={g} type="button" role="tab" aria-selected={group === g} onClick={() => selectGroup(g)}
                  className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors ${group === g ? 'bg-white font-semibold text-zinc-900 shadow-sm' : 'font-medium text-zinc-500 hover:text-zinc-900'}`}>
                  <span className="truncate">{GROUP_LABEL[g]}</span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">{n}</span>
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <div className="flex h-full transition-transform duration-300 ease-out motion-reduce:transition-none" style={{ transform: `translateX(${group === 'monitoring_kepatuhan' ? '-100%' : '0'})` }}>
                <div role="tabpanel" aria-hidden={group !== 'keselamatan_infrastruktur'} inert={group !== 'keselamatan_infrastruktur'} className="w-full shrink-0 px-0.5">
                  <ul className="space-y-1">
                    {BANDS.map((b) => (
                      <li key={b}>
                        <button type="button" onClick={() => setBand(band === b ? '' : b)} disabled={data.bands[b] === 0} aria-pressed={band === b}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors enabled:hover:bg-zinc-50 disabled:opacity-50 ${band === b ? 'bg-brand-green/5 ring-1 ring-brand-green/40' : ''}`}>
                          <span className="w-16 shrink-0 font-medium text-zinc-900">{BAND_LABEL[b]}</span>
                          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100"><span className={`block h-full rounded-full ${BAND_STYLE[b].dot}`} style={{ width: `${(data.bands[b] / bandMax) * 100}%` }} /></span>
                          <b className="w-8 shrink-0 text-right font-mono font-semibold text-zinc-900">{data.bands[b]}</b>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                    Skor = Severity × Exposure (1, 2, 3, 4, 6, 9). {data.bands.belumDinilai > 0 && <>Belum dinilai: <b className="font-mono">{data.bands.belumDinilai}</b>. </>}
                    {data.totals.normalSigns > 0 && <>Rambu normal: <b className="font-mono">{data.totals.normalSigns}</b> (tanpa skor).</>}
                  </p>
                </div>
                <div role="tabpanel" aria-hidden={group !== 'monitoring_kepatuhan'} inert={group !== 'monitoring_kepatuhan'} className="w-full shrink-0 px-0.5">
                  {complianceClasses.length === 0 ? <p className="py-4 text-sm text-zinc-500">Belum ada temuan Monitoring Kepatuhan.</p> : (
                    <ul className="max-h-48 space-y-1 overflow-y-auto">
                      {complianceClasses.map((c) => (
                        <li key={c.className}>
                          <button type="button" onClick={() => setClassName(className === c.className ? '' : c.className)} aria-pressed={className === c.className}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-zinc-50 ${className === c.className ? 'bg-brand-green/5 ring-1 ring-brand-green/40' : ''}`}>
                            <span className="w-24 shrink-0 truncate font-medium text-zinc-900" title={c.displayName}>{c.displayName}</span>
                            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100"><span className="block h-full rounded-full" style={{ width: `${(c.count / complianceMax) * 100}%`, backgroundColor: classColor(c.className) }} /></span>
                            <b className="w-8 shrink-0 text-right font-mono font-semibold text-zinc-900">{c.count}</b>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
                    Kelompok ini tidak ikut skor Severity × Exposure, jadi tidak punya pita prioritas.
                  </p>
                </div>
              </div>
            </div>
          </Panel>
        </div>
        <div className="lg:col-span-3">
          <Panel title="Temuan per kelas" hint="Warna kelas sama dengan kotak pada gambar. Klik batang untuk memfilter." fill>
            {data.byClass.length === 0 ? <p className="py-4 text-sm text-zinc-500">Belum ada temuan.</p> : (
              <ul className="max-h-64 divide-y divide-zinc-100 overflow-y-auto pr-1">
                {data.byClass.map((c) => (
                  <li key={c.className}>
                    <button type="button" onClick={() => setClassName(className === c.className ? '' : c.className)} aria-pressed={className === c.className}
                      className={`flex w-full items-center gap-2 px-2 py-2.5 text-left text-xs transition-colors hover:bg-zinc-50 ${className === c.className ? 'bg-brand-green/5 ring-1 ring-inset ring-brand-green/40' : ''}`}>
                      <span className="w-40 shrink-0 truncate font-medium text-zinc-900" title={c.displayName}>{c.displayName}</span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100"><span className="block h-full rounded-full" style={{ width: `${(c.count / maxClass) * 100}%`, backgroundColor: classColor(c.className) }} /></span>
                      <b className="w-8 shrink-0 text-right font-mono font-semibold text-zinc-900">{c.count}</b>
                      {c.group === 'monitoring_kepatuhan' && <span className="shrink-0 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500" title={GROUP_LABEL.monitoring_kepatuhan}>tanpa skor</span>}
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
            {className && <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-medium text-zinc-900"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: classColor(className) }} />{activeClass?.displayName ?? className}</span>}
            <button type="button" onClick={() => { setBand(''); setClassName(''); }} className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200 px-2 py-0.5 font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900"><X className="h-3 w-3" />Hapus filter</button>
          </div>
        ) : undefined}
      >
        {tiles === null ? (
          <div className="flex items-center gap-2 py-6 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" />Memuat gambar…</div>
        ) : tiles.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-10 text-sm text-zinc-500"><ImageOff className="h-6 w-6 text-zinc-400" />Tidak ada gambar temuan untuk filter ini.</div>
        ) : (
          <div className={`grid max-h-[34rem] grid-cols-2 gap-3 overflow-y-auto p-0.5 transition-opacity md:grid-cols-3 xl:grid-cols-4 ${tilesLoading ? 'opacity-60' : ''}`}>
            {tiles.map((t) => <Tile key={t.key} tile={t} href={sessionHref(t.sessionId)} />)}
          </div>
        )}
      </Panel>

      <Panel title="Lokasi berisiko tertinggi" aside={<Link href={allSessionsHref} className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-50">{allSessionsLabel}<ArrowRight className="h-3 w-3" /></Link>}>
        {topSessions.length === 0 ? <p className="py-3 text-sm text-zinc-500">Belum ada lokasi dengan skor risiko.</p> : (
          <ul className="max-h-72 divide-y divide-zinc-100 overflow-y-auto text-sm">
            {topSessions.map((s) => (
              <li key={s.id}>
                <Link href={sessionHref(s.id)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 transition-colors hover:bg-zinc-50">
                  <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">{s.name}</span>
                  <span className="text-xs text-zinc-500">{s.zone ? `${s.zone.name} (E${s.zone.exposure})` : 'tanpa zona'}</span>
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
