'use client';

import React from 'react';
import { Eye } from 'lucide-react';
import { BAND_LABEL, type PriorityBand } from '@/lib/risk';
import type { DetectionView, EvaluatedClipView, FrameView } from '@/lib/media-view';
import { ClipEvaluationBadge } from './ClipEvaluation';
import { BAND_STYLE } from './RiskBadge';

const ORDER: PriorityBand[] = ['kritikal', 'tinggi', 'sedang', 'rendah'];

/** Satu kartu per media hasil YOLO: miniatur frame yang benar, ringkasan pita risiko, dan status evaluasi klip. */
export default function YoloMediaCard({ media, detections, onOpen }: {
  media: { id: string; fileName: string; fileType: string; frames?: FrameView[]; evaluatedClip?: EvaluatedClipView | null; clipMatchNote?: string | null };
  detections: DetectionView[];
  onOpen: () => void;
}) {
  const valid = detections.filter((d) => d.reviewStatus !== 'keliru');
  const infra = valid.filter((d) => d.classDefinition?.categoryGroup === 'keselamatan_infrastruktur');
  const compliance = valid.filter((d) => d.classDefinition?.categoryGroup === 'monitoring_kepatuhan');
  const counts: Record<PriorityBand, number> = { rendah: 0, sedang: 0, tinggi: 0, kritikal: 0 };
  let unscored = 0;
  let normalSigns = 0;
  for (const d of infra) {
    if (d.conditionLabel === 'normal') normalSigns++; // rambu normal: tanpa skor, bukan "belum dinilai"
    else if (d.priorityBand) counts[d.priorityBand]++;
    else unscored++;
  }
  // Miniatur: frame yang memuat deteksi infrastruktur dengan skor tertinggi; bila tidak ada, frame pertama.
  const worst = [...infra].filter((d) => d.frameIndex !== null && d.conditionLabel !== 'normal').sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))[0];
  const frames = media.frames ?? [];
  const thumb = frames.find((f) => f.frameIndex === worst?.frameIndex) ?? frames[0];
  const framesWithDet = new Set(valid.map((d) => d.frameIndex).filter((i) => i !== null)).size;

  return (
    <button type="button" onClick={onOpen} aria-label={`Buka hasil deteksi ${media.fileName}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-xs transition-all hover:border-blue-300 hover:shadow-lg">
      <div className="relative h-48 overflow-hidden bg-slate-950">
        {thumb && <img src={thumb.imageUrl} alt={`Frame ${thumb.frameIndex + 1} dari ${media.fileName}`} className="h-48 w-full object-cover" />}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="flex items-center gap-1.5 rounded-xl bg-blue-600/90 px-3 py-1.5 text-xs font-bold text-white shadow-lg"><Eye className="h-3.5 w-3.5" />Lihat galeri frame</span>
        </span>
      </div>
      <div className="space-y-2 p-4">
        <h4 className="truncate text-sm font-bold text-slate-900 group-hover:text-blue-600">{media.fileName}</h4>
        {media.fileType === 'video' && <ClipEvaluationBadge clip={media.evaluatedClip} note={media.clipMatchNote} />}
        <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
          {ORDER.filter((b) => counts[b] > 0).map((b) => (
            <span key={b} className={`rounded-full border px-2 py-0.5 ${BAND_STYLE[b].chip}`}>{BAND_LABEL[b]} {counts[b]}</span>
          ))}
          {unscored > 0 && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">Belum dinilai {unscored}</span>}
          {normalSigns > 0 && <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-emerald-800">Rambu normal {normalSigns} (tanpa skor)</span>}
          {compliance.length > 0 && <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-slate-700">Kepatuhan {compliance.length} (tanpa skor)</span>}
          {valid.length === 0 && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-500">Tidak ada deteksi</span>}
        </div>
        <p className="text-[11px] text-slate-400">{valid.length} kotak deteksi pada {framesWithDet} dari {frames.length} frame · klik untuk detail</p>
      </div>
    </button>
  );
}
