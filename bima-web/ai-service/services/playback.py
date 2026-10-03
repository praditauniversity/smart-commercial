"""Deteksi rapat pada video 720p untuk kotak pemutar (bukan untuk temuan resmi).

Temuan resmi tetap berasal dari frame sampel berkas asli. Di sini video 720p yang sudah tersimpan dibaca berurutan,
frame pada grid waktu seragam (ditambah tepat pada waktu frame sampel, agar kotak rapat dapat ditautkan ke temuan
resmi) dijalankan lewat model YOLO, lalu hasilnya digabung menjadi lintasan objek oleh `playback_tracker`.
"""
import logging
import os
import tempfile
import time
from dataclasses import dataclass
from typing import Callable, Dict, List, Optional, Tuple

import cv2
import httpx

from services.playback_tracker import FrameDetection, Track, track_detections
from services.yolo_engine import engine

logger = logging.getLogger("ai_service.playback")


def plan_playback_times(duration_seconds: float, fps: float, sample_timestamps: List[float]) -> List[float]:
    """Grid seragam 1/fps detik, digabung dengan waktu frame sampel (tanpa duplikat yang berjarak < 1 ms)."""
    if fps <= 0:
        raise ValueError("fps harus positif.")
    n = int(duration_seconds * fps)
    grid = [round(i / fps, 3) for i in range(n + 1)]
    merged = sorted({round(t, 3) for t in grid + [t for t in sample_timestamps if 0 <= t <= duration_seconds]})
    return merged


def frame_indices_for_times(times: List[float], video_fps: float, frame_count: int) -> List[Tuple[int, float]]:
    """Pasangan (indeks frame video, waktu nyata frame itu) tanpa duplikat; waktu nyata = indeks / fps video."""
    if video_fps <= 0:
        raise ValueError("fps video tidak valid.")
    last = max(0, frame_count - 1)
    seen = set()
    out: List[Tuple[int, float]] = []
    for t in times:
        idx = min(last, max(0, round(t * video_fps)))
        if idx in seen:
            continue
        seen.add(idx)
        out.append((idx, round(idx / video_fps, 3)))
    return out


@dataclass
class PlaybackResult:
    tracks: List[Track]
    metrics: Dict[str, object]


def _open_local(source: str) -> Tuple[str, Optional[str]]:
    """Path lokal untuk dibaca OpenCV: path yang ada dipakai langsung; URL http(s) diunduh ke berkas sementara."""
    if os.path.isfile(source):
        return source, None
    if source.startswith("http://") or source.startswith("https://"):
        fd, tmp = tempfile.mkstemp(suffix=".mp4")
        os.close(fd)
        with httpx.stream("GET", source, timeout=120.0, follow_redirects=True) as resp:
            if resp.status_code != 200:
                os.remove(tmp)
                raise ValueError(f"Gagal mengunduh video ({resp.status_code}).")
            with open(tmp, "wb") as f:
                for chunk in resp.iter_bytes():
                    f.write(chunk)
        return tmp, tmp
    raise ValueError(f"Video tidak ditemukan: {source}")


def run_playback(
    video_source: str,
    fps: float,
    sample_timestamps: List[float],
    iou_min: float,
    max_missed: int,
    should_stop: Optional[Callable[[], bool]] = None,
) -> PlaybackResult:
    t_start = time.perf_counter()
    path, tmp = _open_local(video_source)
    try:
        cap = cv2.VideoCapture(path)
        if not cap.isOpened():
            raise ValueError("Video tidak dapat dibuka.")
        try:
            video_fps = cap.get(cv2.CAP_PROP_FPS)
            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            if video_fps <= 0 or frame_count <= 0:
                raise ValueError("Metadata video tidak terbaca (fps/jumlah frame).")
            duration = frame_count / video_fps
            targets = frame_indices_for_times(plan_playback_times(duration, fps, sample_timestamps), video_fps, frame_count)
            wanted = {idx: ts for idx, ts in targets}
            last_wanted = max(wanted)

            per_frame: List[Tuple[float, List[FrameDetection]]] = []
            inference_ms = 0.0
            idx = 0
            while idx <= last_wanted:
                if should_stop and should_stop():
                    raise RuntimeError("Dibatalkan.")
                if not cap.grab():
                    break
                if idx in wanted:
                    ok, frame = cap.retrieve()
                    if ok:
                        t0 = time.perf_counter()
                        raw, _ = engine.detect(frame)
                        inference_ms += (time.perf_counter() - t0) * 1000.0
                        per_frame.append((wanted[idx], [FrameDetection(d.model_class, (d.x, d.y, d.width, d.height), d.confidence) for d in raw]))
                idx += 1
        finally:
            cap.release()

        tracks = track_detections(per_frame, iou_min=iou_min, max_missed=max_missed)
        total_ms = (time.perf_counter() - t_start) * 1000.0
        logger.info("Playback: %d frame, %d lintasan, %.0f ms", len(per_frame), len(tracks), total_ms)
        return PlaybackResult(
            tracks=tracks,
            metrics={
                "frames": len(per_frame),
                "tracks": len(tracks),
                "video_fps": round(video_fps, 3),
                "duration_seconds": round(duration, 3),
                "inference_ms": round(inference_ms, 1),
                "total_ms": round(total_ms, 1),
            },
        )
    finally:
        if tmp and os.path.exists(tmp):
            os.remove(tmp)
