from typing import List, Dict
from schemas import DetectionItem, ClassDef
from services.deduplication import calculate_iou

def detect_class_conflicts(
    detections: List[DetectionItem],
    active_classes: List[ClassDef],
    default_iou_threshold: float = 0.5
) -> List[DetectionItem]:
    """
    Identifies conflicts between detections occurring on the same media/frame
    where classes are mutually exclusive and IoU >= threshold.
    """
    if len(detections) < 2:
        return detections

    # Build lookup map for quick access
    class_map: Dict[str, ClassDef] = {c.id: c for c in active_classes}
    # Also index by name
    for c in active_classes:
        class_map[c.name] = c

    n = len(detections)
    for i in range(n):
        for j in range(i + 1, n):
            d1 = detections[i]
            d2 = detections[j]

            # Same class is handled by deduplication, conflict is across different classes
            if d1.class_id == d2.class_id and d1.class_name == d2.class_name:
                continue

            c1 = class_map.get(d1.class_id) or class_map.get(d1.class_name)
            c2 = class_map.get(d2.class_id) or class_map.get(d2.class_name)

            if not c1 or not c2:
                continue

            # Check if classes are mutually exclusive
            mutually_exclusive = False
            if (c2.id in c1.mutually_exclusive_with or c2.name in c1.mutually_exclusive_with or
                c1.id in c2.mutually_exclusive_with or c1.name in c2.mutually_exclusive_with):
                mutually_exclusive = True

            if not mutually_exclusive:
                continue

            # Check IoU threshold
            threshold = c1.conflict_iou_threshold or default_iou_threshold
            iou = calculate_iou(d1.bbox, d2.bbox)

            if iou >= threshold:
                d1.has_conflict = True
                d1.conflict_details = {
                    "conflicting_with_class": d2.class_name,
                    "conflicting_with_id": d2.class_id,
                    "iou": round(iou, 3),
                    "reason": f"Konflik mutually exclusive antara '{d1.class_name}' dan '{d2.class_name}' (IoU {round(iou*100, 1)}% >= {threshold*100}%)"
                }

                d2.has_conflict = True
                d2.conflict_details = {
                    "conflicting_with_class": d1.class_name,
                    "conflicting_with_id": d1.class_id,
                    "iou": round(iou, 3),
                    "reason": f"Konflik mutually exclusive antara '{d2.class_name}' dan '{d1.class_name}' (IoU {round(iou*100, 1)}% >= {threshold*100}%)"
                }

    return detections
