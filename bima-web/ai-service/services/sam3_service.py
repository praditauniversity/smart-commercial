"""Runs a SAM3 job for one media asset: fetch input -> segment -> (video) upload annotated result."""
import base64
import logging
import os
import tempfile
from typing import Callable, Dict, List, Optional
from urllib.parse import urlparse

import httpx

from config import require_env_float

from schemas import BBox, DetectionItem, MediaSegmentResult, ProcessMediaRequest, ProcessMediaResponse
from services.conflict_detector import detect_class_conflicts, detect_video_conflicts
from services.sam3_engine import DEFAULT_COLORS_BGR, ClassPrompts, engine, hex_to_bgr
from services.storage import upload_public

logger = logging.getLogger("ai_service.sam3")

WEB_UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "web", "public"))


def build_class_prompts(req: ProcessMediaRequest) -> ClassPrompts:
    prompts: ClassPrompts = {}
    for idx, cls in enumerate(req.active_classes):
        text = (cls.sam_prompt or "").strip()
        if not text:
            continue
        prompts[cls.name] = {
            "text": text,
            "label": cls.display_name or cls.name,
            "color": hex_to_bgr(cls.sam_color, DEFAULT_COLORS_BGR[idx % len(DEFAULT_COLORS_BGR)]),
        }
    return prompts


MAX_DETECTIONS_PER_CLASS = 100
# Instances below this confidence are kept in the result (the UI slider can reveal them) but are not
# stored as findings. SAM3_CONF (default 0.25) is the model's own floor.


def _feasibility(area_percent: float) -> str:
    """SAM3 only localizes objects; this is a size-based heuristic, reviewable by the admin."""
    if area_percent >= 1.0:
        return "tidak_layak"
    if area_percent >= 0.2:
        return "cukup_layak"
    return "layak"


def _clamp01(v: float) -> float:
    return float(min(1.0, max(0.0, v)))


def finding_conf() -> float:
    return require_env_float("SAM3_FINDING_CONF")


def _is_finding(rec: dict) -> bool:
    conf = rec.get("confidence")
    return conf is None or conf >= finding_conf()


def _record_to_detection(rec: dict, cls, timestamp: Optional[float], frame_index: Optional[int]) -> DetectionItem:
    b = rec["bbox"]
    x, y = _clamp01(b["x"]), _clamp01(b["y"])
    conf = rec.get("confidence")
    conf_txt = f"confidence {conf * 100:.0f}%, " if conf is not None else ""
    return DetectionItem(
        class_id=cls.id,
        class_name=cls.name,
        bbox=BBox(x=x, y=y, width=_clamp01(min(b["width"], 1.0 - x)), height=_clamp01(min(b["height"], 1.0 - y))),
        condition=f"Terdeteksi SAM3 ({conf_txt}luas {rec['area_percent']:.2f}% dari frame).",
        feasibility=_feasibility(rec["area_percent"]),
        confidence=conf,
        timestamp_seconds=timestamp,
        frame_index=frame_index,
    )


def build_detections(req: ProcessMediaRequest, summary: dict, is_video: bool) -> List[DetectionItem]:
    """Image: one detection per instance. Video: instances of each class's peak frame."""
    classes = {c.name: c for c in req.active_classes}
    detections: List[DetectionItem] = []
    frame_records = summary.pop("_frame_records", None) or []  # per-frame instances; too big to keep in the summary
    if is_video:
        fps = summary.get("fps") or 30.0
        for name, peak in (summary.pop("_peaks", {}) or {}).items():
            cls = classes.get(name)
            if not cls:
                continue
            ts = round(peak["frame"] / fps, 2)
            for rec in [r for r in peak["records"] if _is_finding(r)][:MAX_DETECTIONS_PER_CLASS]:
                detections.append(_record_to_detection(rec, cls, ts, peak["frame"]))
    else:
        per_class: Dict[str, int] = {}
        for rec in summary.get("instances", []) or []:
            cls = classes.get(rec["class"])
            if not cls or not _is_finding(rec) or per_class.get(rec["class"], 0) >= MAX_DETECTIONS_PER_CLASS:
                continue
            per_class[rec["class"]] = per_class.get(rec["class"], 0) + 1
            detections.append(_record_to_detection(rec, cls, None, None))

    # Mutually exclusive classes overlapping on the same frame must be resolved by the surveyor before submit.
    if is_video:
        detect_video_conflicts(detections, frame_records, req.active_classes, req.conflict_threshold,
                               min_confidence=finding_conf(), fps=summary.get("fps"))
    else:
        detect_class_conflicts(detections, req.active_classes, default_iou_threshold=req.conflict_threshold)
    return detections


def _materialize_input(file_url: str, workdir: str, suffix: str) -> str:
    """Return a local file path for the media, downloading it when needed."""
    if file_url.startswith("data:"):
        path = os.path.join(workdir, f"input{suffix}")
        with open(path, "wb") as f:
            f.write(base64.b64decode(file_url.split(",", 1)[1]))
        return path
    if file_url.startswith(("http://", "https://")):
        ext = os.path.splitext(urlparse(file_url).path)[1] or suffix
        path = os.path.join(workdir, f"input{ext}")
        with httpx.stream("GET", file_url, timeout=300.0, follow_redirects=True) as r:
            if r.status_code != 200:
                raise ValueError(f"Gagal mengunduh media ({r.status_code}): {file_url}")
            with open(path, "wb") as f:
                for chunk in r.iter_bytes():
                    f.write(chunk)
        return path
    if file_url.startswith("/uploads/"):  # legacy local uploads
        local = os.path.abspath(os.path.join(WEB_UPLOADS_DIR, file_url.lstrip("/")))
        if local.startswith(WEB_UPLOADS_DIR) and os.path.exists(local):
            return local
        raise ValueError(f"File lokal tidak ditemukan: {file_url}")
    if os.path.exists(file_url):
        return file_url
    raise ValueError(f"Format file_url tidak valid atau file tidak ditemukan: {file_url}")


def run_sam3_job(req: ProcessMediaRequest, on_progress: Optional[Callable[[float], None]] = None) -> ProcessMediaResponse:
    """Runs one job, then lets the engine free GPU memory once it has been idle for a while."""
    engine.cancel_idle_unload()
    try:
        return _run_sam3_job(req, on_progress)
    finally:
        engine.job_finished()


def _run_sam3_job(req: ProcessMediaRequest, on_progress: Optional[Callable[[float], None]] = None) -> ProcessMediaResponse:
    class_prompts = build_class_prompts(req)
    if not class_prompts:
        raise ValueError("Tidak ada kelas aktif dengan SAM Prompt. Isi 'SAM Prompt' pada menu Kelas Deteksi.")

    is_video = req.file_type == "video"
    with tempfile.TemporaryDirectory(prefix="sam3-") as workdir:
        in_path = _materialize_input(req.file_url, workdir, ".mp4" if is_video else ".jpg")

        if is_video:
            out_path = os.path.join(workdir, "annotated.mp4")
            summary = engine.process_video(in_path, out_path, class_prompts, on_progress,
                                           mode=req.ai_model_config.sam_mode)
            annotated_url = upload_public("vids", req.session_id, out_path, "mp4", "video/mp4")
            end_time = float(summary.get("duration", 0.0))
        else:
            summary = engine.process_image(in_path, class_prompts)
            annotated_url = req.file_url  # clean photo; overlays are drawn client-side from summary["instances"]
            end_time = 0.0

    detections = build_detections(req, summary, is_video)
    for inst in summary.get("instances", []):
        inst["feasibility"] = _feasibility(inst["area_percent"])
        inst["area_percent"] = round(inst["area_percent"], 3)
        if inst.get("confidence") is not None:
            inst["confidence"] = round(inst["confidence"], 3)
    summary["finding_conf"] = finding_conf()

    summary["provider"] = "sam3"
    if is_video:
        summary["annotated_url"] = annotated_url
    summary["prompts"] = {name: cfg["text"] for name, cfg in class_prompts.items()}

    segment = MediaSegmentResult(
        segment_index=0,
        start_time=0.0,
        end_time=end_time,
        status="completed",
        media_url=annotated_url,
        extraction_metadata=summary,
    )
    return ProcessMediaResponse(
        success=True,
        media_asset_id=req.media_asset_id,
        status="completed",
        detections=detections,
        segments=[segment],
    )
