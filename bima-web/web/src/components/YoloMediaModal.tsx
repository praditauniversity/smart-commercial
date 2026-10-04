'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Cpu, FileImage, Info, Layers, MapPin, X } from 'lucide-react';
import FrameGallery from './FrameGallery';
import FindingLocationMap from './FindingLocationMap';
import { ClipEvaluationBadge, NarrativePanel } from './ClipEvaluation';
import { ComplianceBadge, ConditionBadge, RiskBadge } from './RiskBadge';
import { formatTimestamp, parseBBox, reviewLabel, type DetectionView, type EvaluatedClipView, type FrameView } from '@/lib/media-view';
import { EXPOSURE_LABEL, SEVERITY_LABEL, type Exposure, type Severity } from '@/lib/risk';

export interface YoloMedia {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  status: string;
  createdAt?: string;
  frames?: FrameView[];
  evaluatedClip?: EvaluatedClipView | null;
  clipMatchNote?: string | null;
  processingMetrics?: string | null;
}

/** Info sesi untuk kartu "Informasi Sesi Survei" dan peta (opsional; kartu disembunyikan bila tidak ada). */
export interface YoloSessionInfo {
  name: string;
  status: string;
  surveyDate: string;
  startedAt: string;
  finishedAt?: string | null;
  locationType?: 'point' | 'polygon';
  locationGeojson?: any;
  locationAddress?: string | null;
}

/** Media yang diproses jalur YOLO: punya frame tersimpan dan metrik deteksi YOLO. */
export function isYoloProcessed(m: YoloMedia | null | undefined): boolean {
  if (!m || !m.frames || m.frames.length === 0 || !m.processingMetrics) return false;
  try {
    return Boolean(JSON.parse(m.processingMetrics)?.yolo);
  } catch {
    return false;
  }
}

const STATUS_STYLE: Record<string, string> = {
  completed: 'bg-brand-green/10 text-brand-green border border-brand-green/20',
  processing: 'bg-zinc-100 text-zinc-700 border border-zinc-200 animate-pulse',
  failed: 'bg-rose-50 text-rose-700 border border-rose-200',
};

/**
 * Modal pratinjau hasil YOLO (hanya baca). Tata letak sama dengan modal pratinjau di halaman review supervisor:
 * visual kotak pembatas di kiri; informasi sesi, peta, dan kartu "Objek #n" di kanan.
 * Kotak default = temuan yang sudah dikonfirmasi benar; klik kartu menampilkan kotak itu saja, klik lagi kembali ke tampilan awal.
 */
export default function YoloMediaModal({ media, detections, session, onClose }: { media: YoloMedia; detections: DetectionView[]; session?: YoloSessionInfo | null; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const frames = media.frames ?? [];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ordered = useMemo(
    () => [...detections].sort((a, b) => (a.frameIndex ?? 0) - (b.frameIndex ?? 0) || (b.confidence ?? 0) - (a.confidence ?? 0)),
    [detections]
  );

  /** Klik kartu/kotak: pilih temuan itu (dan lompat ke framenya); klik lagi untuk kembali ke tampilan awal. */
  function pick(d: DetectionView) {
    if (selectedId === d.id) {
      setSelectedId(null);
      return;
    }
    setSelectedId(d.id);
    const i = frames.findIndex((f) => f.frameIndex === d.frameIndex);
    if (i >= 0) setFrameIdx(i);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-2 backdrop-blur-xs sm:p-4 md:p-6" role="dialog" aria-modal="true" aria-label={`Hasil deteksi ${media.fileName}`}>
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl sm:max-h-[92vh]">
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-3 py-3 sm:px-6 sm:py-4">
          <div className="shrink-0 rounded-lg bg-zinc-100 p-2 text-zinc-700"><FileImage className="h-4 w-4 sm:h-5 sm:w-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-zinc-900 sm:max-w-md sm:text-base">{media.fileName}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider sm:text-[10px] ${STATUS_STYLE[media.status] ?? 'bg-zinc-100 text-zinc-700 border border-zinc-200'}`}>{media.status}</span>
              <p className="text-[11px] text-zinc-500 sm:text-xs">Mode Pratinjau ({ordered.length} objek)</p>
              {media.fileType === 'video' && <ClipEvaluationBadge clip={media.evaluatedClip} note={media.clipMatchNote} />}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-900 shadow-sm transition-all hover:bg-zinc-50 active:scale-95">
            <X className="h-4 w-4" /><span className="hidden sm:inline">Tutup</span>
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-0 overflow-y-auto lg:grid-cols-12">
          <div className="space-y-3 border-b border-zinc-200 bg-zinc-50 p-4 sm:p-5 lg:col-span-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-2 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5 font-medium text-zinc-900"><Layers className="h-4 w-4 text-zinc-400" />Visual Bounding Box AI</span>
              <span>{ordered.length} Objek</span>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
              <FrameGallery
                frames={frames} detections={detections} mode="pratinjau" hidePanel
                selectedIds={selectedId ? [selectedId] : []}
                onSelectionChange={(ids) => {
                  const d = ordered.find((x) => x.id === ids[0]);
                  if (d) pick(d); else setSelectedId(null);
                }}
                activeIndex={frameIdx} onActiveIndexChange={setFrameIdx}
              />
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-zinc-200 pt-3 text-[10px] text-zinc-500 sm:text-[11px]">
              <span>Tipe: <strong className="uppercase text-zinc-900">{media.fileType}</strong></span>
              {media.createdAt && <span>Upload: <strong className="text-zinc-900">{new Date(media.createdAt).toLocaleDateString('id-ID')}</strong></span>}
            </div>
          </div>

          <div className="space-y-5 overflow-y-auto bg-white p-4 sm:space-y-6 sm:p-6 lg:col-span-7">
            {session && (
              <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm text-xs sm:p-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-2 font-semibold text-zinc-900">
                  <span className="flex items-center gap-1.5"><Info className="h-4 w-4 shrink-0 text-zinc-500" />Informasi Sesi Survei</span>
                  <span className="text-[11px] font-normal text-zinc-500">Status: <strong className="uppercase text-zinc-700">{session.status.replace(/_/g, ' ')}</strong></span>
                </div>
                <div className="grid grid-cols-1 gap-2 pt-1 text-zinc-500 sm:grid-cols-2">
                  <div><span className="block text-[10px] text-zinc-500">Nama Sesi:</span><strong className="break-words text-zinc-900">{session.name}</strong></div>
                  <div><span className="block text-[10px] text-zinc-500">Lokasi Survei:</span><span className="flex items-center gap-1 break-words text-zinc-900"><MapPin className="h-3 w-3 shrink-0 text-zinc-400" />{session.locationAddress || '-'}</span></div>
                  <div><span className="block text-[10px] text-zinc-500">Tanggal Survei:</span><span className="flex items-center gap-1 text-zinc-900"><Calendar className="h-3 w-3 shrink-0 text-zinc-400" />{new Date(session.surveyDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                  <div><span className="block text-[10px] text-zinc-500">Waktu Mulai:</span><span className="flex items-center gap-1 text-zinc-900"><Clock className="h-3 w-3 shrink-0 text-zinc-400" />{new Date(session.startedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}{session.finishedAt && ` • Selesai: ${new Date(session.finishedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`}</span></div>
                </div>
              </div>
            )}

            {session && (
              <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-sm sm:p-4">
                <FindingLocationMap
                  sessionLocationType={session.locationType || 'point'}
                  sessionGeojson={session.locationGeojson}
                  sessionAddress={session.locationAddress}
                  initialPointGeojson={session.locationGeojson}
                  canEdit={false}
                  onLocationChange={() => {}}
                />
              </div>
            )}

            <div className="space-y-4">
              <h3 className="flex items-center gap-2 text-xs font-semibold text-zinc-900 sm:text-sm"><Cpu className="h-4 w-4 shrink-0 text-zinc-500" />Hasil Temuan AI ({ordered.length})</h3>
              {ordered.length === 0 ? (
                <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-6 text-center text-zinc-500 shadow-sm">
                  <Layers className="mx-auto h-8 w-8 text-zinc-300" />
                  <p className="text-sm font-semibold text-zinc-700">0 Objek terdeteksi oleh AI pada media ini.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {ordered.map((d, idx) => {
                    const chosen = selectedId === d.id;
                    const rv = reviewLabel(d.reviewStatus);
                    const b = parseBBox(d.bbox);
                    const infra = d.classDefinition?.categoryGroup === 'keselamatan_infrastruktur';
                    return (
                      <button
                        key={d.id} type="button" onClick={() => pick(d)} aria-pressed={chosen}
                        className={`block w-full rounded-xl border p-3.5 text-left transition-all sm:p-4 ${chosen ? 'border-brand-green bg-white shadow-sm ring-2 ring-brand-green/20' : 'border-zinc-200 bg-white shadow-sm hover:border-zinc-300'}`}
                      >
                        <div className="mb-2.5 flex items-start justify-between gap-2 border-b border-zinc-100 pb-2.5">
                          <div>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Objek #{idx + 1}</span>
                            <h4 className="break-words text-sm font-semibold text-zinc-900">{d.classDefinition?.displayName ?? d.className}</h4>
                          </div>
                          <span className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider sm:text-[10px] ${rv.tone === 'benar' ? 'bg-brand-green/10 text-brand-green' : rv.tone === 'keliru' ? 'bg-zinc-100 text-zinc-700' : 'bg-amber-50 text-amber-700'}`}>{rv.text}</span>
                        </div>
                        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                          {infra ? (d.conditionLabel === 'normal' ? null : <RiskBadge score={d.riskScore} band={d.priorityBand} severity={d.severity} exposure={d.exposure} source={d.severitySource} />) : <ComplianceBadge />}
                          {d.classDefinition?.hasConditionStage && <ConditionBadge label={d.conditionLabel} tag={d.conditionTag} />}
                        </div>
                        {infra && d.severity && d.conditionLabel !== 'normal' && (
                          <p className="mb-2.5 text-[11px] text-zinc-500">
                            Severity {SEVERITY_LABEL[d.severity as Severity]} ({d.severity})
                            {d.exposure ? <> × Exposure {EXPOSURE_LABEL[d.exposure as Exposure]} ({d.exposure})</> : ' · belum ada zona, skor belum dihitung'}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-100 bg-zinc-50 p-2.5 text-[10px] text-zinc-500 sm:grid-cols-4 sm:text-[11px]">
                          <div><span className="block text-[9px] text-zinc-400">Frame:</span><span className="font-mono font-semibold text-zinc-900">{d.frameIndex !== null ? d.frameIndex + 1 : '-'}</span></div>
                          <div><span className="block text-[9px] text-zinc-400">Waktu:</span><span className="font-mono text-zinc-900">{formatTimestamp(d.timestampSeconds)}</span></div>
                          <div><span className="block text-[9px] text-zinc-400">Confidence:</span><span className="font-mono text-zinc-900">{d.confidence?.toFixed(2) ?? '-'}</span></div>
                          <div><span className="block text-[9px] text-zinc-400">Bounding Box:</span><span className="font-mono text-zinc-900">{b ? `[${b.x.toFixed(2)}, ${b.y.toFixed(2)}]` : '-'}</span></div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {media.fileType === 'video' && <NarrativePanel clip={media.evaluatedClip} note={media.clipMatchNote} />}
          </div>
        </div>
      </div>
    </div>
  );
}
