"""Pelacak objek sederhana untuk kotak pemutar video.

Deteksi rapat (beberapa frame per detik) dari video 720p digabung menjadi lintasan per objek dengan pencocokan
IoU antar-frame, sehingga pemutar dapat menginterpolasi kotak dengan mulus. Murni (tanpa model dan tanpa I/O).

Aturan:
- Hanya objek dengan kelas model yang sama yang dicocokkan.
- Pencocokan serakah menurut IoU tertinggi; pasangan di bawah `iou_min` tidak dicocokkan.
- Lintasan yang tidak cocok dibiarkan hidup sampai `max_missed` frame berturut-turut sebelum ditutup.
"""
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

Box = Tuple[float, float, float, float]  # x, y, width, height (ternormalisasi 0-1)


@dataclass
class FrameDetection:
    model_class: str
    box: Box
    confidence: float


@dataclass
class Track:
    track_id: int
    model_class: str
    # (waktu_detik, x, y, width, height, confidence)
    points: List[Tuple[float, float, float, float, float, float]] = field(default_factory=list)
    missed: int = 0


def iou(a: Box, b: Box) -> float:
    ax2, ay2 = a[0] + a[2], a[1] + a[3]
    bx2, by2 = b[0] + b[2], b[1] + b[3]
    iw = max(0.0, min(ax2, bx2) - max(a[0], b[0]))
    ih = max(0.0, min(ay2, by2) - max(a[1], b[1]))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def track_detections(
    frames: List[Tuple[float, List[FrameDetection]]],
    iou_min: float,
    max_missed: int,
) -> List[Track]:
    """`frames`: daftar (waktu_detik, deteksi) berurutan menurut waktu. Mengembalikan semua lintasan (aktif maupun ditutup)."""
    if not 0.0 < iou_min <= 1.0:
        raise ValueError("iou_min harus di antara 0 (tidak termasuk) dan 1.")
    if max_missed < 0:
        raise ValueError("max_missed tidak boleh negatif.")

    finished: List[Track] = []
    active: List[Track] = []
    next_id = 0

    for t, detections in frames:
        # Pasangan (lintasan, deteksi) dengan IoU tertinggi lebih dulu; satu lintasan/deteksi hanya dipakai sekali.
        pairs: List[Tuple[float, int, int]] = []
        for ti, tr in enumerate(active):
            last = tr.points[-1]
            last_box: Box = (last[1], last[2], last[3], last[4])
            for di, d in enumerate(detections):
                if d.model_class != tr.model_class:
                    continue
                score = iou(last_box, d.box)
                if score >= iou_min:
                    pairs.append((score, ti, di))
        pairs.sort(key=lambda p: p[0], reverse=True)

        used_tracks: Dict[int, int] = {}
        used_dets = set()
        for _, ti, di in pairs:
            if ti in used_tracks or di in used_dets:
                continue
            used_tracks[ti] = di
            used_dets.add(di)

        still_active: List[Track] = []
        for ti, tr in enumerate(active):
            if ti in used_tracks:
                d = detections[used_tracks[ti]]
                tr.points.append((t, *d.box, d.confidence))
                tr.missed = 0
                still_active.append(tr)
            else:
                tr.missed += 1
                (still_active if tr.missed <= max_missed else finished).append(tr)

        for di, d in enumerate(detections):
            if di in used_dets:
                continue
            still_active.append(Track(track_id=next_id, model_class=d.model_class, points=[(t, *d.box, d.confidence)]))
            next_id += 1
        active = still_active

    finished.extend(active)
    finished.sort(key=lambda tr: tr.track_id)
    return finished
