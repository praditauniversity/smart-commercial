'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { formatTimestamp, parseBBox, type DetectionView, type FrameView } from '@/lib/media-view';
import { BAND_LABEL, CONDITION_MODEL_LABEL, GROUP_LABEL } from '@/lib/risk';
import { BAND_STYLE, COMPLIANCE_STYLE, ComplianceBadge, ConditionBadge, RiskBadge } from './RiskBadge';

interface FrameGalleryProps {
  frames: FrameView[];
  detections: DetectionView[];
  /** Ambang confidence awal untuk tampilan (tidak mengubah hasil tersimpan). */
  initialMinConfidence?: number;
  selectedDetectionId?: string | null;
  onSelectDetection?: (d: DetectionView) => void;
}

type GroupFilter = 'semua' | 'keselamatan_infrastruktur' | 'monitoring_kepatuhan';

function boxStyle(d: DetectionView): string {
  if (d.reviewStatus === 'keliru') return 'border-slate-400 border-dashed opacity-60';
  if (d.classDefinition?.categoryGroup === 'monitoring_kepatuhan') return COMPLIANCE_STYLE.box;
  if (d.conditionLabel === 'normal') return 'border-emerald-600 border-dashed';
  return d.priorityBand ? BAND_STYLE[d.priorityBand].box : 'border-sky-500';
}

/**
 * Galeri frame kunci (Opsi A): satu frame besar dengan kotak pembatas + strip miniatur. Kotak digambar di
 * klien dari data tersimpan, sehingga ambang confidence dan filter dapat diubah tanpa memproses ulang.
 */
export default function FrameGallery({ frames, detections, initialMinConfidence = 0, selectedDetectionId, onSelectDetection }: FrameGalleryProps) {
  const [index, setIndex] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);
  const [minConf, setMinConf] = useState(initialMinConfidence);
  const [group, setGroup] = useState<GroupFilter>('semua');

  const visible = useMemo(
    () =>
      detections.filter(
        (d) => (d.confidence ?? 1) >= minConf && (group === 'semua' || d.classDefinition?.categoryGroup === group)
      ),
    [detections, minConf, group]
  );

  const byFrame = useMemo(() => {
    const m = new Map<number, DetectionView[]>();
    for (const d of visible) {
      if (d.frameIndex === null) continue;
      m.set(d.frameIndex, [...(m.get(d.frameIndex) ?? []), d]);
    }
    return m;
  }, [visible]);

  const frame = frames[Math.min(index, Math.max(0, frames.length - 1))];
  const current = frame ? byFrame.get(frame.frameIndex) ?? [] : [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(frames.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frames.length]);

  if (frames.length === 0) {
    return <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Belum ada frame untuk media ini.</div>;
  }

  const worstBand = (fi: number) => {
    const rank = { rendah: 1, sedang: 2, tinggi: 3, kritikal: 4 } as const;
    let best: DetectionView | null = null;
    for (const d of byFrame.get(fi) ?? []) {
      if (d.priorityBand && (!best || rank[d.priorityBand] > rank[best.priorityBand!])) best = d;
    }
    return best?.priorityBand ?? null;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-2.5 text-xs">
        <label className="flex items-center gap-2 font-semibold text-slate-700">
          Confidence ≥ <span className="w-10 font-mono">{minConf.toFixed(2)}</span>
          <input
            type="range" min={0} max={0.95} step={0.05} value={minConf}
            onChange={(e) => setMinConf(parseFloat(e.target.value))}
            aria-label="Ambang confidence tampilan" className="w-32 accent-blue-600"
          />
        </label>
        <select
          value={group} onChange={(e) => setGroup(e.target.value as GroupFilter)}
          aria-label="Filter kelompok" className="rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700"
        >
          <option value="semua">Semua kelompok</option>
          <option value="keselamatan_infrastruktur">{GROUP_LABEL.keselamatan_infrastruktur}</option>
          <option value="monitoring_kepatuhan">{GROUP_LABEL.monitoring_kepatuhan}</option>
        </select>
        <button
          type="button" onClick={() => setShowBoxes((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100"
        >
          {showBoxes ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showBoxes ? 'Sembunyikan kotak' : 'Tampilkan kotak'}
        </button>
        <span className="ml-auto text-slate-500">
          {visible.length} dari {detections.length} kotak ditampilkan · {frames.length} frame
        </span>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-slate-900">
        <img src={frame.imageUrl} alt={`Frame ${frame.frameIndex + 1} pada ${formatTimestamp(frame.timestampSeconds)}`} className="block h-auto w-full" />
        {showBoxes &&
          current.map((d) => {
            const b = parseBBox(d.bbox);
            if (!b) return null;
            const selected = d.id === selectedDetectionId;
            return (
              <button
                key={d.id} type="button" onClick={() => onSelectDetection?.(d)}
                aria-label={`${d.classDefinition?.displayName ?? d.className}, confidence ${d.confidence?.toFixed(2) ?? '-'}`}
                className={`absolute border-2 ${boxStyle(d)} ${selected ? 'ring-2 ring-white' : ''}`}
                style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%` }}
              >
                <span className="absolute -top-5 left-0 whitespace-nowrap rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
                  {d.classDefinition?.displayName ?? d.className} {d.confidence !== null ? d.confidence.toFixed(2) : ''}
                </span>
              </button>
            );
          })}
        <button type="button" aria-label="Frame sebelumnya" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}
          className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
        <button type="button" aria-label="Frame berikutnya" disabled={index >= frames.length - 1} onClick={() => setIndex((i) => Math.min(frames.length - 1, i + 1))}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
        <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 font-mono text-[11px] text-white">
          Frame {frame.frameIndex + 1}/{frames.length} · {formatTimestamp(frame.timestampSeconds)}
        </div>
      </div>

      <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Miniatur frame">
        {frames.map((f, i) => {
          const n = (byFrame.get(f.frameIndex) ?? []).length;
          const band = worstBand(f.frameIndex);
          return (
            <li key={f.id} className="shrink-0">
              <button type="button" onClick={() => setIndex(i)} aria-label={`Frame ${f.frameIndex + 1}, ${n} kotak`}
                className={`relative block overflow-hidden rounded-md border-2 ${i === index ? 'border-blue-600' : 'border-transparent'}`}>
                <img src={f.imageUrl} alt="" loading="lazy" className="h-14 w-24 object-cover" />
                {n > 0 && (
                  <span className={`absolute right-0.5 top-0.5 rounded px-1 text-[9px] font-bold text-white ${band ? BAND_STYLE[band].dot : 'bg-slate-600'}`}>{n}</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold text-slate-700">Temuan pada frame ini ({current.length})</div>
        {current.length === 0 ? (
          <p className="px-3 py-3 text-xs text-slate-500">Tidak ada kotak pada frame ini dengan pengaturan saat ini.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {current.map((d) => (
              <li key={d.id}>
                <button type="button" onClick={() => onSelectDetection?.(d)}
                  className={`flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-xs hover:bg-slate-50 ${d.id === selectedDetectionId ? 'bg-blue-50' : ''}`}>
                  <span className="font-semibold text-slate-900">{d.classDefinition?.displayName ?? d.className}</span>
                  <span className="text-slate-500">{d.classDefinition?.category}</span>
                  <span className="font-mono text-slate-500">conf {d.confidence?.toFixed(2) ?? '-'}</span>
                  {d.classDefinition?.categoryGroup === 'monitoring_kepatuhan' ? (
                    <ComplianceBadge />
                  ) : d.conditionLabel === 'normal' ? null : (
                    <RiskBadge score={d.riskScore} band={d.priorityBand} severity={d.severity} exposure={d.exposure} source={d.severitySource} />
                  )}
                  {d.classDefinition?.hasConditionStage && <ConditionBadge label={d.conditionLabel} tag={d.conditionTag} />}
                  {d.severitySource === 'petugas' && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">severity dari petugas</span>}
                  {d.reviewStatus !== 'belum_ditinjau' && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${d.reviewStatus === 'keliru' ? 'bg-slate-200 text-slate-700' : 'bg-indigo-100 text-indigo-800'}`}>{d.reviewStatus.replace('_', ' ')}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        Pita: {Object.values(BAND_LABEL).join(' · ')}. Garis putus-putus abu-abu = Monitoring Kepatuhan (tanpa skor) atau temuan ditandai keliru; hijau putus-putus = rambu normal (tanpa skor).
      </p>
      {detections.some((d) => d.classDefinition?.hasConditionStage && d.conditionLabel) && (
        <p className="text-[11px] text-slate-500">Kondisi rambu (normal/rusak): {CONDITION_MODEL_LABEL}. Subtipe kerusakan ditetapkan supervisor.</p>
      )}
    </div>
  );
}
