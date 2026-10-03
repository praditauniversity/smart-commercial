'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import FrameGallery from './FrameGallery';
import { ClipEvaluationBadge, NarrativePanel } from './ClipEvaluation';
import type { DetectionView, EvaluatedClipView, FrameView } from '@/lib/media-view';

export interface YoloMedia {
  id: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  status: string;
  frames?: FrameView[];
  evaluatedClip?: EvaluatedClipView | null;
  clipMatchNote?: string | null;
  processingMetrics?: string | null;
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

/** Tampilan hasil deteksi YOLO untuk satu media (hanya baca; koreksi dilakukan supervisor). */
export default function YoloMediaModal({ media, detections, onClose }: { media: YoloMedia; detections: DetectionView[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={`Hasil deteksi ${media.fileName}`}>
      <div className="w-full max-w-6xl space-y-4 rounded-2xl bg-slate-50 p-4 shadow-xl sm:p-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="break-all text-base font-bold text-slate-900">{media.fileName}</h2>
            {media.fileType === 'video' && <div className="mt-1"><ClipEvaluationBadge clip={media.evaluatedClip} note={media.clipMatchNote} /></div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"><X className="h-5 w-5" /></button>
        </div>
        <FrameGallery frames={media.frames ?? []} detections={detections} mode="pratinjau" />
        {media.fileType === 'video' && <NarrativePanel clip={media.evaluatedClip} note={media.clipMatchNote} />}
      </div>
    </div>
  );
}
