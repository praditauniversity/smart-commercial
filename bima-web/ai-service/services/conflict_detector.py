from collections import defaultdict
from typing import Dict, List, Optional

from schemas import BBox, ClassDef, DetectionItem
from services.deduplication import calculate_iou


def _index_classes(active_classes: List[ClassDef]) -> Dict[str, ClassDef]:
    class_map: Dict[str, ClassDef] = {c.id: c for c in active_classes}
    for c in active_classes:  # also index by name
        class_map[c.name] = c
    return class_map


def _mutually_exclusive(c1: ClassDef, c2: ClassDef) -> bool:
    return (c2.id in c1.mutually_exclusive_with or c2.name in c1.mutually_exclusive_with or
            c1.id in c2.mutually_exclusive_with or c1.name in c2.mutually_exclusive_with)


def _mark_conflict(d: DetectionItem, other: DetectionItem, iou: float, threshold: float,
                   extra: Optional[dict] = None) -> None:
    """Flags `d` as conflicting with `other`, keeping the strongest (highest IoU) conflict if it has several."""
    if d.has_conflict and (d.conflict_details or {}).get("iou", 0.0) >= round(iou, 3):
        return
    d.has_conflict = True
    d.conflict_details = {
        "conflicting_with_class": other.class_name,
        "conflicting_with_id": other.class_id,
        "iou": round(iou, 3),
        "reason": f"Konflik mutually exclusive antara '{d.class_name}' dan '{other.class_name}' "
                  f"(IoU {round(iou * 100, 1)}% >= {threshold * 100}%)",
        **(extra or {}),
    }


def detect_class_conflicts(
    detections: List[DetectionItem],
    active_classes: List[ClassDef],
    default_iou_threshold: float = 0.5
) -> List[DetectionItem]:
    """
    Identifies conflicts between detections occurring on the same media/frame
    where classes are mutually exclusive and IoU >= threshold.

    Two detections are on the "same frame" when their frame_index is equal (both None for still images).
    """
    if len(detections) < 2:
        return detections

    class_map = _index_classes(active_classes)

    n = len(detections)
    for i in range(n):
        for j in range(i + 1, n):
            d1 = detections[i]
            d2 = detections[j]

            # Same class is handled by deduplication, conflict is across different classes
            if d1.class_id == d2.class_id and d1.class_name == d2.class_name:
                continue

            # A conflict needs both detections on the same frame
            if d1.frame_index != d2.frame_index:
                continue

            c1 = class_map.get(d1.class_id) or class_map.get(d1.class_name)
            c2 = class_map.get(d2.class_id) or class_map.get(d2.class_name)

            if not c1 or not c2 or not _mutually_exclusive(c1, c2):
                continue

            threshold = c1.conflict_iou_threshold or default_iou_threshold
            iou = calculate_iou(d1.bbox, d2.bbox)

            if iou >= threshold:
                _mark_conflict(d1, d2, iou, threshold)
                _mark_conflict(d2, d1, iou, threshold)

    return detections


def _bbox_of(record: dict) -> BBox:
    b = record["bbox"]
    return BBox(x=b["x"], y=b["y"], width=b["width"], height=b["height"])


def _best_finding(candidates: List[DetectionItem], box: BBox, frame: int) -> DetectionItem:
    """The finding that most likely represents the conflicting instance: best IoU, then nearest frame."""
    return max(
        candidates,
        key=lambda d: (calculate_iou(d.bbox, box), -abs((d.frame_index if d.frame_index is not None else frame) - frame)),
    )


def detect_video_conflicts(
    detections: List[DetectionItem],
    frame_records: List[List[dict]],
    active_classes: List[ClassDef],
    default_iou_threshold: float = 0.5,
    min_confidence: float = 0.0,
    fps: Optional[float] = None,
) -> List[DetectionItem]:
    """
    Conflict detection for SAM3 video results.

    Video findings are the instances of each class's *peak* frame, and peaks of different classes usually fall
    on different frames, so comparing findings directly would (almost) never find a conflict. Instead the
    per-frame instance records are compared: whenever two mutually exclusive classes overlap with
    IoU >= threshold on the same frame, the closest finding of each class is flagged.
    """
    findings: Dict[str, List[DetectionItem]] = defaultdict(list)
    for d in detections:
        findings[d.class_name].append(d)
    if len(findings) < 2 or not frame_records:
        return detections

    class_by_name = {c.name: c for c in active_classes}

    for frame_idx, records in enumerate(frame_records):
        usable = [
            r for r in records
            if r["class"] in findings and (r.get("confidence") is None or r["confidence"] >= min_confidence)
        ]
        for i in range(len(usable)):
            for j in range(i + 1, len(usable)):
                r1, r2 = usable[i], usable[j]
                if r1["class"] == r2["class"]:
                    continue
                c1, c2 = class_by_name.get(r1["class"]), class_by_name.get(r2["class"])
                if not c1 or not c2 or not _mutually_exclusive(c1, c2):
                    continue

                box1, box2 = _bbox_of(r1), _bbox_of(r2)
                threshold = c1.conflict_iou_threshold or default_iou_threshold
                iou = calculate_iou(box1, box2)
                if iou < threshold:
                    continue

                d1 = _best_finding(findings[r1["class"]], box1, frame_idx)
                d2 = _best_finding(findings[r2["class"]], box2, frame_idx)
                extra = {"conflict_frame_index": frame_idx}
                if fps:
                    extra["conflict_timestamp_seconds"] = round(frame_idx / fps, 2)
                _mark_conflict(d1, d2, iou, threshold, extra)
                _mark_conflict(d2, d1, iou, threshold, extra)

    return detections
