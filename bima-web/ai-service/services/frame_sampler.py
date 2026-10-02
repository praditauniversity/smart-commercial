"""Perencanaan frame sampel video (Opsi A: galeri frame kunci).

Aturan (handoff bagian 11): ~0,5 fps dengan batas maksimum 24 frame per klip. Untuk klip yang
lebih panjang dari 48 detik, frame disebar MERATA di seluruh durasi (bukan 24 frame pertama),
sehingga ujung klip tidak terlewat.
"""
import math
from typing import List

SAMPLE_FPS = 0.5
MAX_FRAMES = 24


def plan_frame_timestamps(duration_seconds: float, fps: float = SAMPLE_FPS, max_frames: int = MAX_FRAMES) -> List[float]:
    """Timestamp (detik) pusat tiap interval; jumlah = min(max_frames, ceil(durasi * fps)), minimal 1."""
    if duration_seconds <= 0:
        return [0.0]
    n = max(1, min(max_frames, math.ceil(duration_seconds * fps)))
    step = duration_seconds / n
    return [round((i + 0.5) * step, 3) for i in range(n)]
