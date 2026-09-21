'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { Layers, Film, Cpu } from 'lucide-react';

export interface Sam3ClassSummary {
  label: string;
  color?: string;
  max_count: number;
  frames_present: number;
  avg_area_percent: number;
}

export interface Sam3Instance {
  class: string;
  label: string;
  confidence: number | null;
  area_percent: number;
  bbox: { x: number; y: number; width: number; height: number };
  polygons: number[][][]; // normalized [x, y] points
  feasibility?: string;
}

export interface Sam3Result {
  url: string;
  instances?: Sam3Instance[]; // images only: overlays are drawn client-side on the clean photo
  findingConf?: number;
  mode: 'image' | 'video';
  classes: Record<string, Sam3ClassSummary>;
  prompts: Record<string, string>;
  frames?: number;
  duration?: number;
  processingSeconds?: number;
  algorithm?: string;
}

/** Returns the SAM3 result stored on a media asset's segment, or null (e.g. OpenRouter media). */
export function getSam3Result(media: { segments?: any[] } | null | undefined): Sam3Result | null {
  for (const seg of media?.segments || []) {
    if (!seg?.mediaUrl || !seg?.extractionMetadata) continue;
    try {
      const meta = JSON.parse(seg.extractionMetadata);
      if (meta.provider === 'sam3' && meta.classes) {
        return {
          url: seg.mediaUrl,
          instances: meta.instances,
          findingConf: meta.finding_conf,
          mode: meta.mode,
          classes: meta.classes,
          prompts: meta.prompts || {},
          frames: meta.frames,
          duration: meta.duration,
          processingSeconds: meta.processing_seconds,
          algorithm: meta.algorithm,
        };
      }
    } catch {
      // ignore malformed metadata
    }
  }
  return null;
}

/** Per-class counts (detected classes only). Images honour the confidence filter; video/legacy use the summary. */
export function classCounts(result: Sam3Result, minConf?: number) {
  const threshold = minConf ?? result.findingConf ?? 0;
  return Object.entries(result.classes)
    .map(([name, c]) => ({
      name,
      label: c.label,
      color: c.color || '#64748b',
      count: result.instances
        ? result.instances.filter((i) => i.class === name && (i.confidence ?? 1) >= threshold).length
        : c.max_count,
    }))
    .filter((c) => c.count > 0);
}

/** "#rrggbb" -> readable text color (dark on light fills, white on dark fills). */
function readableText(hex: string): string {
  const v = hex.replace('#', '');
  if (v.length !== 6) return '#fff';
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 165 ? '#0f172a' : '#ffffff';
}

const shortLabel = (label: string) => label.replace(/\s*\(.*\)/, '');

/** Compact class pills for cards: only classes that were actually detected. */
export function Sam3Chips({ result, size = 'sm' }: { result: Sam3Result; size?: 'sm' | 'md' }) {
  const pad = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2 py-0.5 text-[10px]';
  const counts = classCounts(result);
  if (counts.length === 0) {
    return <span className="text-[11px] text-slate-400">Tidak ada objek di atas threshold</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {counts.map((c) => (
        <span
          key={c.name}
          title={result.mode === 'video' ? 'Jumlah terbanyak dalam satu frame' : 'Jumlah terdeteksi'}
          className={`inline-flex items-center gap-1.5 rounded-full font-semibold bg-slate-50 text-slate-700 ring-1 ring-slate-200 ${pad}`}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
          {shortLabel(c.label)}
          <span className="font-bold text-slate-900">{c.count}</span>
        </span>
      ))}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-2xl bg-slate-50 ring-1 ring-slate-200/70 px-3 py-2 sm:px-3.5 sm:py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-base sm:text-lg font-bold text-slate-900 leading-tight truncate">{value}</div>
    </div>
  );
}

/** Clean photo stage: overlays for the selected classes are drawn on top of the untouched image. */
function ImageStage({
  result,
  fileName,
  visible,
}: {
  result: Sam3Result;
  fileName: string;
  visible: { inst: Sam3Instance; idx: number }[];
}) {
  const colorOf = (name: string) => result.classes[name]?.color || '#64748b';
  return (
    <div className="relative inline-block max-w-full">
      <img src={result.url} alt={fileName} className="block max-h-[30dvh] lg:max-h-[52vh] max-w-full w-auto h-auto" />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
        {visible.map(({ inst, idx }) => {
          const color = colorOf(inst.class);
          return (
            <g key={idx} className="animate-[fadeIn_.25s_ease-out]">
              {inst.polygons.map((poly, pi) => (
                <polygon
                  key={pi}
                  points={poly.map((p) => p.join(',')).join(' ')}
                  fill={color}
                  fillOpacity={0.28}
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <rect
                x={inst.bbox.x}
                y={inst.bbox.y}
                width={inst.bbox.width}
                height={inst.bbox.height}
                rx={0.004}
                fill="none"
                stroke={color}
                strokeWidth={1.25}
                strokeDasharray="5 4"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      {visible.map(({ inst, idx }) => {
        const color = colorOf(inst.class);
        return (
          <span
            key={idx}
            className="absolute pointer-events-none px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap shadow-md"
            style={{
              left: `${inst.bbox.x * 100}%`,
              top: `${inst.bbox.y * 100}%`,
              transform: 'translateY(-105%)',
              backgroundColor: color,
              color: readableText(color),
            }}
          >
            {shortLabel(inst.label)}
            {inst.confidence != null ? ` ${(inst.confidence * 100).toFixed(0)}%` : ''}
          </span>
        );
      })}
    </div>
  );
}

/** Shared view state so the stage (image) and the controls (pills, slider) can live in different places. */
export function useSam3View(result: Sam3Result | null) {
  const [minConf, setMinConf] = useState(result?.findingConf ?? 0.4);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Start clean whenever a different media is opened.
  useEffect(() => {
    setMinConf(result?.findingConf ?? 0.4);
    setSelected(new Set());
  }, [result?.url, result?.findingConf]);

  const interactive = result?.mode === 'image' && !!result.instances;
  const counts = useMemo(() => (result ? classCounts(result, minConf) : []), [result, minConf]);
  const visible = useMemo(
    () =>
      (result?.instances || [])
        .map((inst, idx) => ({ inst, idx }))
        .filter(({ inst }) => selected.has(inst.class) && (inst.confidence ?? 1) >= minConf),
    [result?.instances, selected, minConf]
  );
  const total = counts.reduce((a, c) => a + c.count, 0);
  const allSelected = counts.length > 0 && counts.every((c) => selected.has(c.name));
  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  return { interactive, minConf, setMinConf, selected, setSelected, counts, visible, total, allSelected, toggle };
}
export type Sam3View = ReturnType<typeof useSam3View>;

/** Top block (kept on screen on phones): the clean photo / annotated video plus the summary stat cards. */
export function Sam3Stage({ result, fileName, view }: { result: Sam3Result; fileName: string; view: Sam3View }) {
  return (
    <div className="space-y-3">
      <div className="bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center ring-1 ring-slate-800">
        {result.mode === 'video' ? (
          <video src={result.url} controls autoPlay loop muted playsInline className="max-w-full max-h-[30dvh] lg:max-h-[52vh]" />
        ) : view.interactive ? (
          <ImageStage result={result} fileName={fileName} visible={view.visible} />
        ) : (
          <img src={result.url} alt={fileName} className="max-w-full max-h-[30dvh] lg:max-h-[52vh] object-contain" />
        )}
      </div>

      {view.interactive ? (
        <div className="flex gap-2">
          <Stat icon={<Layers className="w-3 h-3" />} label="Objek" value={String(view.total)} />
          <Stat icon={<Cpu className="w-3 h-3" />} label="Kelas" value={String(view.counts.length)} />
        </div>
      ) : (
        result.mode === 'video' && (
          <div className="flex gap-2">
            <Stat
              icon={<Film className="w-3 h-3" />}
              label="Durasi"
              value={result.duration ? `${result.duration.toFixed(1)} dtk` : '-'}
            />
            <Stat icon={<Layers className="w-3 h-3" />} label="Frame" value={result.frames ? String(result.frames) : '-'} />
          </div>
        )
      )}
    </div>
  );
}

/** Scrolling block: detected-class pills + confidence slider (photos) or a class summary (video). */
export function Sam3Controls({ result, view }: { result: Sam3Result; view: Sam3View }) {
  const sliderId = useId();
  const { minConf, setMinConf, selected, setSelected, counts, allSelected, toggle } = view;

  if (!view.interactive) {
    return (
      <div className="space-y-3">
        <section>
          <h4 className="text-xs font-semibold text-slate-500 mb-2">
            Kelas terdeteksi{' '}
            {result.mode === 'video' && <span className="font-normal text-slate-400">· terbanyak dalam satu frame</span>}
          </h4>
          <Sam3Chips result={result} size="md" />
        </section>
        {result.mode === 'video' && (
          <p className="text-[11px] leading-relaxed text-slate-400">
            Angka adalah nilai tertinggi dalam satu frame, bukan jumlah objek unik selama video.
            {result.algorithm ? ` Algoritma ${result.algorithm}` : ''}
            {result.processingSeconds ? ` · diproses ${result.processingSeconds}s` : ''}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-500">Kelas terdeteksi</h4>
          {counts.length > 1 && (
            <button
              type="button"
              onClick={() => setSelected(allSelected ? new Set() : new Set(counts.map((c) => c.name)))}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              {allSelected ? 'Sembunyikan semua' : 'Tampilkan semua'}
            </button>
          )}
        </div>
        {counts.length === 0 ? (
          <p className="text-xs text-slate-400 rounded-2xl bg-white ring-1 ring-slate-200 px-3 py-3">
            Tidak ada objek di atas confidence {(minConf * 100).toFixed(0)}%. Turunkan slider untuk melihat lebih banyak.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {counts.map((c) => {
              const on = selected.has(c.name);
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => toggle(c.name)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    on ? 'shadow-md' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-300 hover:bg-slate-50'
                  }`}
                  style={on ? { backgroundColor: c.color, color: readableText(c.color) } : undefined}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: on ? readableText(c.color) : c.color }}
                  />
                  {shortLabel(c.label)}
                  <span
                    className={`min-w-5 h-5 px-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-bold ${
                      on ? 'bg-black/15' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {c.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-1.5">
          <label htmlFor={sliderId} className="text-xs font-semibold text-slate-500">
            Confidence minimum
          </label>
          <span className="text-xs font-bold text-slate-900 tabular-nums">{(minConf * 100).toFixed(0)}%</span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={0.25}
          max={0.95}
          step={0.05}
          value={minConf}
          onChange={(e) => setMinConf(parseFloat(e.target.value))}
          className="w-full accent-blue-600 cursor-pointer"
        />
        {result.findingConf != null && (
          <p className="mt-1 text-[10px] text-slate-400">
            Slider hanya memfilter tampilan. Temuan yang tersimpan memakai ambang {(result.findingConf * 100).toFixed(0)}%.
          </p>
        )}
      </section>
    </div>
  );
}
