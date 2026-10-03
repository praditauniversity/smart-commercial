'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { formatTimestamp, nearestFrame, parseBBox, visibleBoxes, type DetectionView, type FrameView } from '@/lib/media-view';
import { classColor, readableTextColor } from '@/lib/class-colors';

/**
 * Pemutar video 720p dengan kotak pembatas deteksi. Deteksi hanya dibuat pada frame sampel (bukan setiap frame video),
 * jadi kotak yang tampil adalah milik frame sampel terdekat dari posisi putar dan berganti setiap kali posisi
 * mendekati frame sampel berikutnya. Koordinat kotak ternormalisasi (0-1) sehingga cocok pada ukuran video apa pun.
 */
export default function VideoWithBoxes({
  src, frames, detections, selectedIds = [],
}: {
  src: string;
  frames: FrameView[];
  detections: DetectionView[];
  selectedIds?: readonly string[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);

  const syncTime = useCallback(() => setTime(videoRef.current?.currentTime ?? 0), []);

  // Jarak sampel (detik); kotak ditahan sampai setengah jarak ke kedua sisi frame sampel, minimal 1 detik.
  const maxGap = useMemo(() => {
    const ts = frames.map((f) => f.timestampSeconds).sort((a, b) => a - b);
    let widest = 0;
    for (let i = 1; i < ts.length; i++) widest = Math.max(widest, ts[i] - ts[i - 1]);
    return Math.max(1, widest / 2);
  }, [frames]);

  const frame = useMemo(() => nearestFrame(frames, time, maxGap), [frames, time, maxGap]);
  const mediaHasReview = useMemo(() => detections.some((d) => d.reviewStatus !== 'belum_ditinjau'), [detections]);
  const drawn = useMemo(() => {
    if (!frame) return [];
    const onFrame = detections.filter((d) => d.frameIndex === frame.frameIndex);
    return visibleBoxes(onFrame, { mode: 'koreksi', selectedIds, mediaHasReview });
  }, [frame, detections, selectedIds, mediaHasReview]);

  return (
    <div className="mt-2 space-y-2">
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef} src={src} controls preload="metadata" className="block h-auto w-full"
          onTimeUpdate={syncTime} onSeeked={syncTime} onLoadedMetadata={syncTime}
        />
        {showBoxes && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {drawn.map((d) => {
              const b = parseBBox(d.bbox);
              if (!b) return null;
              const color = classColor(d.className);
              const dashed = d.reviewStatus === 'keliru' || d.conditionLabel === 'normal';
              return (
                <div
                  key={d.id}
                  className={`absolute border-2 ${dashed ? 'border-dashed' : ''} ${d.reviewStatus === 'keliru' ? 'opacity-60' : ''}`}
                  style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.width * 100}%`, height: `${b.height * 100}%`, borderColor: color, backgroundColor: `${color}1f` }}
                >
                  <span className="absolute left-0 top-0 max-w-full truncate rounded-br px-1 text-[10px] font-semibold" style={{ backgroundColor: color, color: readableTextColor(color) }}>
                    {d.classDefinition?.displayName ?? d.className}{d.confidence !== null ? ` ${d.confidence.toFixed(2)}` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        <button
          type="button" onClick={() => setShowBoxes((v) => !v)} aria-pressed={showBoxes}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
        >
          {showBoxes ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showBoxes ? 'Sembunyikan kotak' : 'Tampilkan kotak'}
        </button>
        <span aria-live="off">
          {frame
            ? `Kotak dari frame sampel ${formatTimestamp(frame.timestampSeconds)} · ${drawn.length} kotak`
            : 'Tidak ada frame sampel di dekat posisi ini'}
        </span>
        <span className="sm:ml-auto">Deteksi dibuat pada frame sampel, sehingga kotak berganti per frame sampel, bukan di setiap frame video.</span>
      </div>
    </div>
  );
}
