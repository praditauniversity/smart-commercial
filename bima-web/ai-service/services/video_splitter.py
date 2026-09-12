import math
from typing import List, Dict, Any, Tuple
from schemas import MediaSegmentResult

def plan_video_segments(duration_seconds: float, max_segment_duration: float = 10.0) -> List[Tuple[int, float, float]]:
    """
    Splits video duration into segments of at most max_segment_duration seconds.
    Returns list of (segment_index, start_time, end_time).
    """
    if duration_seconds <= 0:
        return [(0, 0.0, 0.0)]

    num_segments = math.ceil(duration_seconds / max_segment_duration)
    segments = []

    for i in range(num_segments):
        start = i * max_segment_duration
        end = min(duration_seconds, (i + 1) * max_segment_duration)
        segments.append((i, round(start, 2), round(end, 2)))

    return segments
