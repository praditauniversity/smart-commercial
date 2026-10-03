'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { formatTimestamp, nearestFrame, visibleBoxes, parseBBox, type DetectionView, type FrameView } from '@/lib/media-view';
import { boxAt, selectPlaybackTracks, type PlaybackData } from '@/lib/playback-tracks';
import { classColor, readableTextColor } from '@/lib/class-colors';

interface PlaybackState { status: string; note: string | null; data: PlaybackData | null }

interface DrawnBox {
  key: string;
  x: number; y: number; width: number; height: number;
  className: string;
  label: string;
  confidence: number | null;
  dashed: boolean;
  faded: boolean;
}

const POLL_MS = 4000;

/**
 * Pemutar video 720p dengan kotak pembatas.
 * - Kotak halus (bila sudah dibuat): lintasan objek dari deteksi rapat, diinterpolasi per frame video dan
 *   disinkronkan dengan frame yang tampil. Status koreksi supervisor ikut berlaku (temuan keliru tidak digambar).
 * - Cadangan (belum dibuat): kotak dari frame sampel terdekat saja, sehingga berganti per beberapa detik.
 */
export default function VideoWithBoxes({
  src, mediaId, frames, detections, selectedIds = [],
}: {
  src: string;
  mediaId: string;
  frames: FrameView[];
  detections: DetectionView[];
  selectedIds?: readonly string[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);
  const [includeUnlinked, setIncludeUnlinked] = useState(false);
  const [playback, setPlayback] = useState<PlaybackState | null | undefined>(undefined); // undefined = memuat
  const [actionError, setActionError] = useState<string | null>(null);

  const loadPlayback = useCallback(async () => {
    try {
      const res = await fetch(`/api/media/${mediaId}/playback`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal memuat kotak pemutar.');
      setPlayback(j.playback);
    } catch (e: any) {
      setActionError(e.message);
      setPlayback((p) => (p === undefined ? null : p));
    }
  }, [mediaId]);

  useEffect(() => { loadPlayback(); }, [loadPlayback]);

  // Selama dibuat di latar belakang, status dicek berkala.
  const processing = playback?.status === 'processing';
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(loadPlayback, POLL_MS);
    return () => clearInterval(id);
  }, [processing, loadPlayback]);

  async function generate() {
    setActionError(null);
    try {
      const res = await fetch(`/api/media/${mediaId}/playback`, { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Gagal memulai pembuatan kotak.');
      setPlayback({ status: 'processing', note: null, data: null });
    } catch (e: any) {
      setActionError(e.message);
    }
  }

  // Sinkron dengan frame yang tampil: requestVideoFrameCallback bila ada, selain itu requestAnimationFrame.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const rvfc = typeof (v as any).requestVideoFrameCallback === 'function';
    let handle = 0;
    let stopped = false;
    const tick = (_now?: number, meta?: { mediaTime: number }) => {
      if (stopped) return;
      setTime(meta?.mediaTime ?? v.currentTime);
      handle = rvfc ? (v as any).requestVideoFrameCallback(tick) : requestAnimationFrame(() => tick());
    };
    handle = rvfc ? (v as any).requestVideoFrameCallback(tick) : requestAnimationFrame(() => tick());
    return () => {
      stopped = true;
      if (rvfc) (v as any).cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
    };
  }, []);
  const syncTime = useCallback(() => setTime(videoRef.current?.currentTime ?? 0), []);

  const smooth = playback?.status === 'ready' && playback.data ? playback.data : null;

  const smoothTracks = useMemo(
    () => (smooth ? selectPlaybackTracks(smooth.tracks, detections, { mode: 'koreksi', selectedIds, includeUnlinked }) : []),
    [smooth, detections, selectedIds, includeUnlinked]
  );

  // Cadangan: jarak sampel (detik); kotak ditahan sampai setengah jarak ke kedua sisi frame sampel, minimal 1 detik.
  const maxGap = useMemo(() => {
    const ts = frames.map((f) => f.timestampSeconds).sort((a, b) => a - b);
    let widest = 0;
    for (let i = 1; i < ts.length; i++) widest = Math.max(widest, ts[i] - ts[i - 1]);
    return Math.max(1, widest / 2);
  }, [frames]);
  const mediaHasReview = useMemo(() => detections.some((d) => d.reviewStatus !== 'belum_ditinjau'), [detections]);
  const sampleFrame = useMemo(() => (smooth ? null : nearestFrame(frames, time, maxGap)), [smooth, frames, time, maxGap]);

  const drawn: DrawnBox[] = useMemo(() => {
    if (smooth) {
      const out: DrawnBox[] = [];
      for (const { track, status } of smoothTracks) {
        const b = boxAt(track, time, smooth.step, smooth.maxGap);
        if (!b) continue;
        const d = status.display;
        out.push({
          key: `t${track.id}`, ...b,
          className: d?.className ?? track.className,
          label: d?.classDefinition?.displayName ?? d?.className ?? track.className,
          confidence: b.confidence,
          dashed: status.reviewStatus === 'keliru' || d?.conditionLabel === 'normal',
          faded: status.reviewStatus === 'keliru',
        });
      }
      return out;
    }
    if (!sampleFrame) return [];
    const onFrame = detections.filter((d) => d.frameIndex === sampleFrame.frameIndex);
    return visibleBoxes(onFrame, { mode: 'koreksi', selectedIds, mediaHasReview }).flatMap((d) => {
      const b = parseBBox(d.bbox);
      return b ? [{ key: d.id, ...b, className: d.className, label: d.classDefinition?.displayName ?? d.className, confidence: d.confidence, dashed: d.reviewStatus === 'keliru' || d.conditionLabel === 'normal', faded: d.reviewStatus === 'keliru' }] : [];
    });
  }, [smooth, smoothTracks, time, sampleFrame, detections, selectedIds, mediaHasReview]);

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
              const color = classColor(d.className);
              return (
                <div
                  key={d.key}
                  className={`absolute border-2 ${d.dashed ? 'border-dashed' : ''} ${d.faded ? 'opacity-60' : ''}`}
                  style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%`, width: `${d.width * 100}%`, height: `${d.height * 100}%`, borderColor: color, backgroundColor: `${color}1f` }}
                >
                  <span className="absolute left-0 top-0 max-w-full truncate rounded-br px-1 text-[10px] font-semibold" style={{ backgroundColor: color, color: readableTextColor(color) }}>
                    {d.label}{d.confidence !== null ? ` ${d.confidence.toFixed(2)}` : ''}
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
        {smooth ? (
          <>
            <span>{drawn.length} kotak pada {formatTimestamp(time)} · mengikuti koreksi supervisor (temuan keliru tidak digambar)</span>
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={includeUnlinked} onChange={(e) => setIncludeUnlinked(e.target.checked)} />
              Sertakan objek di luar frame sampel (belum pernah ditinjau)
            </label>
          </>
        ) : (
          <span>
            {sampleFrame ? `Kotak dari frame sampel ${formatTimestamp(sampleFrame.timestampSeconds)} · ${drawn.length} kotak` : 'Tidak ada frame sampel di dekat posisi ini'}
          </span>
        )}
      </div>

      {!smooth && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-[11px] text-zinc-500" role="status">
          {playback === undefined ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Memeriksa kotak halus…</span>
          ) : processing ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Kotak halus sedang dibuat (deteksi rapat pada video, bisa beberapa menit). Sementara itu kotak berganti per frame sampel.</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {playback === null ? 'Kotak halus belum dibuat untuk video ini.' : playback.note ?? 'Kotak halus belum tersedia.'} Kotak yang tampil berganti per frame sampel, bukan di setiap frame video.
              </span>
              {playback?.status !== 'skipped' && (
                <button type="button" onClick={generate} className="rounded-md border border-zinc-200 bg-white px-2 py-1 font-medium text-zinc-900 shadow-sm hover:bg-zinc-50">
                  {playback?.status === 'failed' ? 'Coba buat lagi' : 'Buat kotak halus'}
                </button>
              )}
            </div>
          )}
          {actionError && <p role="alert" className="mt-1 text-rose-700">{actionError}</p>}
        </div>
      )}
    </div>
  );
}
