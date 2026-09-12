from typing import List
from schemas import BBox, DetectionItem

def calculate_iou(box1: BBox, box2: BBox) -> float:
    """
    Computes Intersection over Union (IoU) between two normalized bounding boxes.
    Box coordinates are: x (left), y (top), width, height.
    """
    b1_x1 = box1.x
    b1_y1 = box1.y
    b1_x2 = box1.x + box1.width
    b1_y2 = box1.y + box1.height

    b2_x1 = box2.x
    b2_y1 = box2.y
    b2_x2 = box2.x + box2.width
    b2_y2 = box2.y + box2.height

    inter_x1 = max(b1_x1, b2_x1)
    inter_y1 = max(b1_y1, b2_y1)
    inter_x2 = min(b1_x2, b2_x2)
    inter_y2 = min(b1_y2, b2_y2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    intersection = inter_w * inter_h

    area1 = box1.width * box1.height
    area2 = box2.width * box2.height
    union = area1 + area2 - intersection

    if union <= 0:
        return 0.0

    return intersection / union

def deduplicate_temporal_detections(
    detections: List[DetectionItem],
    time_window: float = 2.0,
    iou_threshold: float = 0.45,
) -> List[DetectionItem]:
    """
    Deduplicates video detections across temporally adjacent frames.
    If the same class appears in the same region (IoU >= threshold) within time_window,
    it is treated as the same tracked object rather than a new finding.
    """
    if not detections:
        return []

    # Sort by timestamp
    sorted_dets = sorted(
        detections,
        key=lambda d: (d.timestamp_seconds if d.timestamp_seconds is not None else 0.0)
    )

    unique_detections: List[DetectionItem] = []

    for det in sorted_dets:
        t_curr = det.timestamp_seconds if det.timestamp_seconds is not None else 0.0
        is_duplicate = False

        for existing in unique_detections:
            t_prev = existing.timestamp_seconds if existing.timestamp_seconds is not None else 0.0
            time_diff = abs(t_curr - t_prev)

            # Check if same class within temporal proximity
            if det.class_id == existing.class_id and time_diff <= time_window:
                iou = calculate_iou(det.bbox, existing.bbox)
                if iou >= iou_threshold:
                    is_duplicate = True
                    break

        if not is_duplicate:
            unique_detections.append(det)

    return unique_detections
