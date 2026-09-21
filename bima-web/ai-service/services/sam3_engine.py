"""Local SAM 3 / 3.1 text-prompt ("concept") segmentation for images and videos.

Ported from the notebooks in ``publicspace_vlm`` (mainly
``sam_segmentation_parallel_fast.ipynb``); the originals are left untouched and
remain the reference. Differences from the notebook:

* prompts (text, label, color) come from the request (database), not a hardcoded dict;
* torch / ultralytics are imported lazily so the service still starts without them;
* the annotated video is piped straight into ffmpeg (H.264, browser-playable)
  instead of being written with ``cv2.VideoWriter('mp4v')``;
* the output keeps the source aspect ratio instead of forcing 640x480.
"""
import logging
import os
import queue
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("ai_service.sam3")

FFMPEG_PATH = os.getenv("FFMPEG_PATH", "/usr/bin/ffmpeg")

# Default overlay palette (BGR) used when a class has no color configured.
DEFAULT_COLORS_BGR = [(0, 0, 255), (0, 255, 0), (255, 0, 0), (0, 255, 255), (255, 0, 255), (255, 255, 0)]

# Video algorithm presets, built only from parameters the notebooks already define:
#   optimized = sam_segmentation_inference_optimized.ipynb: SAM on keyframes + dense optical-flow
#               (Farneback) propagation in between. Smooth masks. Default.
#   fast      = sam_segmentation_inference_optimized_fast.ipynb: cheaper global phase-correlation shift
#               between keyframes, with the notebook's suggested "faster" detect_interval=8 (more drift).
VIDEO_PRESETS = {
    "optimized": {"propagation": "flow", "detect_interval": 5, "flow_scale": 0.5},
    "fast": {"propagation": "phase", "detect_interval": 8, "flow_scale": 0.5},
}
DEFAULT_VIDEO_MODE = "optimized"

# ClassPrompts: {class_name: {"text": str, "label": str, "color": (b, g, r)}}
ClassPrompts = Dict[str, Dict[str, Any]]
# Detections: {class_name: {"masks": ndarray[N,H,W], "confidences": ndarray[N], "label": str, "color": tuple}}
Detections = Dict[str, Dict[str, Any]]


def hex_to_bgr(value: Optional[str], fallback: Tuple[int, int, int]) -> Tuple[int, int, int]:
    if value:
        v = value.strip().lstrip("#")
        if len(v) == 6:
            try:
                r, g, b = int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)
                return (b, g, r)
            except ValueError:
                pass
    return fallback


def ui_scale(h: int, w: int) -> float:
    """Annotation size factor: 1.0 at 960px (the notebook's look), smaller for small images."""
    return float(min(1.5, max(0.6, max(h, w) / 960.0)))


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


class Sam3Engine:
    """Owns the single SAM predictor. All GPU work is serialized through ``lock``."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self._predictor = None
        self._torch = None
        self._idle_timer: Optional[threading.Timer] = None
        # Seconds of inactivity after which the model is unloaded to free GPU memory (<0 = never unload).
        # The reload cost is paid by the next job (~10 s), so a short grace period avoids thrashing
        # when several media are uploaded back to back.
        self.idle_unload_seconds = _env_float("SAM3_IDLE_UNLOAD_SECONDS", 30.0)
        self.checkpoint = os.getenv("SAM3_CHECKPOINT", "sam3_1.pt")
        self.imgsz = _env_int("SAM3_IMGSZ", 1036)
        self.conf = _env_float("SAM3_CONF", 0.25)

    # ------------------------------------------------------------------ model
    def _ensure_loaded(self) -> None:
        if self._predictor is not None:
            return
        if not os.path.exists(self.checkpoint):
            raise RuntimeError(
                f"Bobot SAM3 tidak ditemukan: '{self.checkpoint}'. Set SAM3_CHECKPOINT di ai-service/.env."
            )
        try:
            import torch
            from ultralytics.models.sam import SAM3SemanticPredictor
        except ImportError as e:
            raise RuntimeError(
                "SAM3 membutuhkan torch dan ultralytics>=8.3.237 (pip install -U ultralytics torch)."
            ) from e

        self._torch = torch
        cuda = torch.cuda.is_available()
        if not cuda:
            logger.warning("CUDA tidak terdeteksi, SAM3 berjalan di CPU (sangat lambat).")
        overrides = dict(
            conf=self.conf,
            task="segment",
            mode="predict",
            model=self.checkpoint,
            device=0 if cuda else "cpu",
            imgsz=self.imgsz,
            half=cuda,
            verbose=False,
            save=False,
        )
        logger.info(f"Memuat SAM3: {self.checkpoint} (imgsz={self.imgsz}, cuda={cuda})")
        self._predictor = SAM3SemanticPredictor(overrides=overrides)

    # ----------------------------------------------------------- GPU memory
    def cancel_idle_unload(self) -> None:
        """Call when a job starts: keep the model loaded while there is work."""
        timer, self._idle_timer = self._idle_timer, None
        if timer:
            timer.cancel()

    def job_finished(self) -> None:
        """Call when a job ends: drop cached GPU blocks now, unload the model after the idle grace period."""
        self._release_cache()
        if self.idle_unload_seconds < 0:
            return
        self.cancel_idle_unload()
        timer = threading.Timer(self.idle_unload_seconds, self._unload_if_idle)
        timer.daemon = True
        self._idle_timer = timer
        timer.start()

    def _release_cache(self) -> None:
        if self._torch is not None and self._torch.cuda.is_available():
            self._torch.cuda.empty_cache()

    def _unload_if_idle(self) -> None:
        if not self.lock.acquire(blocking=False):
            return  # a job is running; it will schedule the next check when it finishes
        try:
            self.unload()
        finally:
            self.lock.release()

    def unload(self) -> None:
        """Free the model and its GPU memory (the CUDA context, a few hundred MB, stays until the process exits)."""
        if self._predictor is None:
            return
        self._predictor = None
        import gc
        gc.collect()
        if self._torch is not None and self._torch.cuda.is_available():
            self._torch.cuda.synchronize()
            self._torch.cuda.empty_cache()
            self._torch.cuda.ipc_collect()
        logger.info("SAM3 di-unload dari GPU (idle).")

    # -------------------------------------------------------------- detection
    @staticmethod
    def _extract_instances(result):
        if result is None:
            return None, None, None
        masks_obj = getattr(result, "masks", None)
        if masks_obj is None or getattr(masks_obj, "data", None) is None or len(masks_obj.data) == 0:
            return None, None, None

        masks = masks_obj.data.cpu().numpy()
        boxes_obj = getattr(result, "boxes", None)
        if boxes_obj is not None and getattr(boxes_obj, "conf", None) is not None:
            confs = boxes_obj.conf.cpu().numpy()
        else:
            confs = np.ones(len(masks), dtype=np.float32)
        if boxes_obj is not None and getattr(boxes_obj, "cls", None) is not None:
            class_ids = boxes_obj.cls.cpu().numpy().astype(np.int64)
        else:
            class_ids = None
        return masks, confs, class_ids

    def _set_image(self, image_bgr) -> None:
        self._predictor.set_image(image_bgr)

    def detect(self, image_bgr, class_prompts: ClassPrompts, conf_threshold: Optional[float] = None) -> Detections:
        """One image encode + ONE GPU call for ALL text prompts (fallbacks as in the notebook)."""
        if not class_prompts:
            return {}
        self._ensure_loaded()
        conf_th = self.conf if conf_threshold is None else conf_threshold

        self._set_image(image_bgr)
        names = list(class_prompts.keys())
        texts = [class_prompts[n]["text"] for n in names]

        def pack(masks, confs, name):
            cfg = class_prompts[name]
            return {"masks": masks, "confidences": confs, "label": cfg["label"], "color": cfg["color"]}

        def from_batched(result) -> Optional[Detections]:
            masks, confs, class_ids = self._extract_instances(result)
            if masks is None:
                return {}  # nothing detected for any prompt: skip the expensive fallbacks
            if class_ids is None:
                return None
            if class_ids.size and (int(class_ids.max()) >= len(names) or int(class_ids.min()) < 0):
                logger.warning("SAM3 mengembalikan boxes.cls di luar rentang; fallback ke prompt terpisah.")
                return None
            out: Detections = {}
            for idx, name in enumerate(names):
                keep = (class_ids == idx) & (confs >= conf_th)
                if keep.any():
                    out[name] = pack(masks[keep], confs[keep], name)
            return out

        raw = None
        try:
            raw = self._predictor(text=texts)
        except Exception as e:
            logger.warning(f"Inferensi multi-prompt gagal, fallback ke prompt terpisah: {e}")

        if raw is not None:
            results = raw if isinstance(raw, (list, tuple)) else [raw]
            batched = from_batched(results[0]) if results else None
            if batched is not None:
                return batched
            if len(results) == len(names):  # one Results object per prompt
                out: Detections = {}
                for idx, name in enumerate(names):
                    m, c, _ = self._extract_instances(results[idx])
                    if m is None:
                        continue
                    keep = c >= conf_th
                    if keep.any():
                        out[name] = pack(m[keep], c[keep], name)
                return out

        # Last resort: independent prompts.
        out = {}
        for name in names:
            try:
                raw_one = self._predictor(text=[class_prompts[name]["text"]])
            except Exception as e:
                logger.warning(f"Prompt kelas '{name}' gagal: {e}")
                continue
            result_one = raw_one[0] if isinstance(raw_one, (list, tuple)) else raw_one
            m, c, _ = self._extract_instances(result_one)
            if m is None:
                continue
            keep = c >= conf_th
            if keep.any():
                out[name] = pack(m[keep], c[keep], name)
        return out

    # ---------------------------------------------------------------- render
    @staticmethod
    def render(image_bgr, detections: Detections):
        """Draw masks / contours / labels (ROI-confined, same look as the notebook)."""
        h, w = image_bgr.shape[:2]
        overlay = image_bgr.copy()
        records = []
        ui = ui_scale(h, w)
        line_px = max(1, round(2 * ui))

        for cls_name, det in detections.items():
            color = det["color"]
            label = det["label"]
            for i, mask in enumerate(det["masks"]):
                mask_bin = (mask > 0.5).astype(np.uint8)
                if mask_bin.shape != (h, w):
                    mask_bin = cv2.resize(mask_bin, (w, h), interpolation=cv2.INTER_NEAREST)

                conf_val = float(det["confidences"][i]) if i < len(det["confidences"]) else None
                x, y, bw, bh = cv2.boundingRect(mask_bin)
                pixel_area = int(cv2.countNonZero(mask_bin))

                if bw > 0 and bh > 0 and pixel_area > 0:
                    pad = 2
                    x0, y0 = max(0, x - pad), max(0, y - pad)
                    x1, y1 = min(w, x + bw + pad), min(h, y + bh + pad)

                    sub_mask = mask_bin[y0:y1, x0:x1]
                    sub_img = overlay[y0:y1, x0:x1]

                    layer = np.empty_like(sub_img)
                    layer[:] = color
                    blended = cv2.addWeighted(sub_img, 1.0, layer, 0.45, 0)
                    cv2.copyTo(blended, sub_mask, sub_img)

                    contours, _ = cv2.findContours(sub_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    cv2.drawContours(sub_img, contours, -1, color, line_px)

                    conf_txt = f" {conf_val * 100:.0f}%" if conf_val is not None else ""
                    cv2.putText(overlay, f"{label}{conf_txt}", (x, max(int(20 * ui), y - int(8 * ui))),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55 * ui, (255, 255, 255), line_px)

                records.append({
                    "class": cls_name,
                    "label": label,
                    "instance": i + 1,
                    "pixel_area": pixel_area,
                    "area_percent": (pixel_area / (h * w)) * 100.0,
                    "confidence": conf_val,
                    "bbox": {"x": x / w, "y": y / h, "width": bw / w, "height": bh / h},
                })
        return overlay, records

    @staticmethod
    def _draw_counts(image_bgr, class_prompts: ClassPrompts, records) -> None:
        """Small per-class count HUD in the top-left corner."""
        counts = {name: 0 for name in class_prompts}
        for r in records:
            counts[r["class"]] = counts.get(r["class"], 0) + 1
        ui = ui_scale(*image_bgr.shape[:2])
        margin, step = int(12 * ui), int(24 * ui)
        y = int(26 * ui)
        for name, cfg in class_prompts.items():
            text = f"{cfg['label']}: {counts.get(name, 0)}"
            cv2.putText(image_bgr, text, (margin, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6 * ui, (0, 0, 0), max(2, round(4 * ui)))
            cv2.putText(image_bgr, text, (margin, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6 * ui, cfg["color"], max(1, round(2 * ui)))
            y += step

    # ----------------------------------------------------------------- image
    @staticmethod
    def instances_from_detections(h: int, w: int, detections: Detections) -> List[dict]:
        """Per-instance data for client-side overlays: normalized bbox + simplified polygons (no drawing)."""
        instances: List[dict] = []
        for cls_name, det in detections.items():
            for i, mask in enumerate(det["masks"]):
                mask_bin = (mask > 0.5).astype(np.uint8)
                if mask_bin.shape != (h, w):
                    mask_bin = cv2.resize(mask_bin, (w, h), interpolation=cv2.INTER_NEAREST)
                area = int(cv2.countNonZero(mask_bin))
                if area == 0:
                    continue
                x, y, bw, bh = cv2.boundingRect(mask_bin)
                contours, _ = cv2.findContours(mask_bin, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                polygons = []
                for c in sorted(contours, key=cv2.contourArea, reverse=True)[:4]:
                    eps = 0.003 * cv2.arcLength(c, True)
                    approx = cv2.approxPolyDP(c, eps, True).reshape(-1, 2)
                    if len(approx) < 3:
                        continue
                    polygons.append([[round(px / w, 4), round(py / h, 4)] for px, py in approx[:300]])
                instances.append({
                    "class": cls_name,
                    "label": det["label"],
                    "confidence": float(det["confidences"][i]) if i < len(det["confidences"]) else None,
                    "area_percent": area / (h * w) * 100.0,
                    "bbox": {"x": x / w, "y": y / h, "width": bw / w, "height": bh / h},
                    "polygons": polygons,
                })
        return instances

    def process_image(self, in_path: str, class_prompts: ClassPrompts) -> Dict[str, Any]:
        image = cv2.imread(in_path)
        if image is None:
            raise ValueError("File gambar tidak bisa dibaca.")
        h, w = image.shape[:2]
        max_side = _env_int("SAM3_IMAGE_MAX_SIDE", 1280)
        min_side = _env_int("SAM3_IMAGE_MIN_SIDE", 640)
        if max(h, w) > max_side:
            scale = max_side / max(h, w)
            image = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            h, w = image.shape[:2]
        elif max(h, w) < min_side:
            # Tiny images: enlarge so the overlay text/contours are legible (SAM resizes internally anyway).
            scale = min_side / max(h, w)
            image = cv2.resize(image, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_CUBIC)
            h, w = image.shape[:2]

        t0 = time.perf_counter()
        with self.lock:
            detections = self.detect(image, class_prompts)
        # No annotated image: the web draws overlays on the clean photo, so classes can be toggled.
        instances = self.instances_from_detections(h, w, detections)
        records = [{"class": i["class"], "area_percent": i["area_percent"]} for i in instances]
        return self._summarize(class_prompts, [records], mode="image", width=w, height=h,
                               seconds=time.perf_counter() - t0, extra={"instances": instances})

    # ----------------------------------------------------------------- video
    def process_video(
        self,
        in_path: str,
        out_path: str,
        class_prompts: ClassPrompts,
        on_progress: Optional[Callable[[float], None]] = None,
        mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        mode = (mode or DEFAULT_VIDEO_MODE).lower()
        if mode not in VIDEO_PRESETS:
            logger.warning(f"Mode video '{mode}' tidak dikenal, memakai '{DEFAULT_VIDEO_MODE}'.")
            mode = DEFAULT_VIDEO_MODE
        preset = VIDEO_PRESETS[mode]
        # Optional env overrides (SAM3_DETECT_INTERVAL / SAM3_PROPAGATION / SAM3_FLOW_SCALE) win over the preset.
        detect_interval = max(1, _env_int("SAM3_DETECT_INTERVAL", preset["detect_interval"]))
        propagation = os.getenv("SAM3_PROPAGATION", preset["propagation"]).lower()  # hold | phase | flow
        flow_scale = _env_float("SAM3_FLOW_SCALE", preset["flow_scale"])
        max_side = _env_int("SAM3_VIDEO_MAX_SIDE", 960)
        max_frames = _env_int("SAM3_VIDEO_MAX_FRAMES", 0) or None  # 0 = whole video
        post_workers = max(1, _env_int("SAM3_POST_WORKERS", 6))
        prefetch = 12

        cap = cv2.VideoCapture(in_path)
        if not cap.isOpened():
            raise IOError("Video tidak bisa dibuka.")
        orig_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        orig_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
        if max_frames:
            total = min(total, max_frames) if total else max_frames

        scale = min(1.0, max_side / max(orig_w, orig_h))
        out_w = max(2, int(orig_w * scale) // 2 * 2)  # even dimensions for yuv420p
        out_h = max(2, int(orig_h * scale) // 2 * 2)

        ffmpeg = subprocess.Popen(
            [FFMPEG_PATH, "-hide_banner", "-loglevel", "error", "-y",
             "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{out_w}x{out_h}", "-r", f"{fps:.3f}", "-i", "-",
             "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-pix_fmt", "yuv420p",
             "-an", "-movflags", "+faststart", out_path],
            stdin=subprocess.PIPE, stderr=subprocess.PIPE,
        )

        frame_q: "queue.Queue" = queue.Queue(maxsize=prefetch)
        result_q: "queue.Queue" = queue.Queue(maxsize=post_workers * 2)
        writer_error: List[BaseException] = []
        stop = threading.Event()

        def producer():
            n = 0
            try:
                while not stop.is_set():
                    ok, frame = cap.read()
                    if not ok or (max_frames and n >= max_frames):
                        break
                    if (out_w, out_h) != (orig_w, orig_h):
                        frame = cv2.resize(frame, (out_w, out_h), interpolation=cv2.INTER_AREA)
                    while not stop.is_set():
                        try:
                            frame_q.put((n, frame), timeout=0.5)
                            break
                        except queue.Full:
                            continue
                    n += 1
            finally:
                while True:
                    try:
                        frame_q.put(None, timeout=0.5)
                        break
                    except queue.Full:
                        if stop.is_set():
                            break

        def writer_loop():
            try:
                while True:
                    item = result_q.get()
                    if item is None:
                        break
                    ffmpeg.stdin.write(item[0].tobytes())
            except Exception as e:  # noqa: BLE001
                writer_error.append(e)
                # keep draining so the pipeline cannot deadlock on a full queue
                while result_q.get() is not None:
                    pass

        def postprocess(frame_idx, frame, detections):
            annotated, records = self.render(frame, detections)
            self._draw_counts(annotated, class_prompts, records)
            return annotated, records

        producer_thread = threading.Thread(target=producer, daemon=True, name="sam3-producer")
        producer_thread.start()
        writer_thread = threading.Thread(target=writer_loop, daemon=True, name="sam3-writer")
        writer_thread.start()

        executor = ThreadPoolExecutor(max_workers=post_workers, thread_name_prefix="sam3-post")
        futures: List[Any] = []
        frame_records: List[List[dict]] = []
        prev_frame, prev_dets = None, {}
        processed = sam_calls = 0
        last_detection = -1
        t0 = time.perf_counter()

        def drain_one():
            annotated, records = futures.pop(0).result()
            frame_records.append(records)
            result_q.put((annotated,))

        try:
            with self.lock:
                while True:
                    item = frame_q.get()
                    if item is None:
                        break
                    frame_idx, frame = item

                    # Same rule as the notebook: keyframe every N frames, or immediately when
                    # propagation lost every mask (redetect_on_empty).
                    if processed == 0 or (processed - last_detection) >= detect_interval or not prev_dets:
                        dets = self.detect(frame, class_prompts)
                        sam_calls += 1
                        last_detection = processed
                    elif propagation == "phase" and prev_frame is not None:
                        dets = _translate_phase(prev_frame, frame, prev_dets)
                    elif propagation == "flow" and prev_frame is not None:
                        dets = _propagate_flow(prev_frame, frame, prev_dets, flow_scale)
                    else:
                        dets = prev_dets  # hold: read-only reuse

                    futures.append(executor.submit(postprocess, frame_idx, frame, dets))
                    if len(futures) >= post_workers * 2:
                        drain_one()

                    prev_frame, prev_dets = frame, dets
                    processed += 1
                    if on_progress and total and processed % 15 == 0:
                        on_progress(min(0.99, processed / total))

                while futures:
                    drain_one()
        finally:
            stop.set()
            executor.shutdown(wait=True)
            result_q.put(None)
            writer_thread.join()
            producer_thread.join(timeout=5)
            cap.release()
            try:
                ffmpeg.stdin.close()
            except Exception:  # noqa: BLE001
                pass
            ffmpeg_err = ffmpeg.stderr.read().decode(errors="ignore")
            ffmpeg.wait()

        if writer_error or ffmpeg.returncode != 0:
            raise IOError(f"Gagal meng-encode video hasil: {ffmpeg_err.strip()[-300:] or writer_error}")

        seconds = time.perf_counter() - t0
        peaks: Dict[str, dict] = {}
        for name in class_prompts:
            best_idx, best_n = -1, 0
            for idx, recs in enumerate(frame_records):
                n = sum(1 for r in recs if r["class"] == name)
                if n > best_n:
                    best_idx, best_n = idx, n
            if best_idx >= 0:
                peaks[name] = {"frame": best_idx, "records": [r for r in frame_records[best_idx] if r["class"] == name]}
        logger.info(f"Video selesai: {processed} frame, {sam_calls} panggilan SAM, {seconds:.1f}s")
        return self._summarize(class_prompts, frame_records, mode="video", width=out_w, height=out_h,
                               seconds=seconds,
                               extra={"frames": processed, "fps": fps, "duration": processed / fps if fps else 0,
                                      "sam_calls": sam_calls, "algorithm": mode, "_peaks": peaks})

    # --------------------------------------------------------------- summary
    @staticmethod
    def _summarize(class_prompts: ClassPrompts, frame_records: List[List[dict]], mode: str,
                   width: int, height: int, seconds: float, extra: Dict[str, Any]) -> Dict[str, Any]:
        classes = {}
        for name, cfg in class_prompts.items():
            per_frame_counts = [sum(1 for r in recs if r["class"] == name) for recs in frame_records]
            per_frame_area = [sum(r["area_percent"] for r in recs if r["class"] == name) for recs in frame_records]
            frames_present = sum(1 for c in per_frame_counts if c > 0)
            b, g, r = cfg["color"]
            classes[name] = {
                "label": cfg["label"],
                "color": f"#{r:02x}{g:02x}{b:02x}",
                # image: exact count; video: highest number seen in a single frame (not a unique count)
                "max_count": max(per_frame_counts) if per_frame_counts else 0,
                "frames_present": frames_present,
                "avg_area_percent": (sum(a for a in per_frame_area if a > 0) / frames_present) if frames_present else 0.0,
            }
        return {"mode": mode, "width": width, "height": height,
                "processing_seconds": round(seconds, 2), "classes": classes, **extra}


# --- cheap mask propagation between SAM keyframes (ported verbatim in behaviour) ---
def _translate_phase(prev_frame, curr_frame, detections: Detections) -> Detections:
    if not detections:
        return {}
    h, w = curr_frame.shape[:2]
    prev_gray = cv2.cvtColor(prev_frame, cv2.COLOR_BGR2GRAY)
    curr_gray = cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)
    (dx, dy), response = cv2.phaseCorrelate(np.float32(prev_gray), np.float32(curr_gray))
    if not (np.isfinite(dx) and np.isfinite(dy) and np.isfinite(response)) or abs(dx) >= w or abs(dy) >= h:
        return detections

    matrix = np.array([[1.0, 0.0, float(round(dx))], [0.0, 1.0, float(round(dy))]], dtype=np.float32)
    out: Detections = {}
    for name, det in detections.items():
        masks = []
        for mask in det.get("masks", []):
            m = (mask > 0.5).astype(np.float32)
            if m.shape != (h, w):
                m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            masks.append(cv2.warpAffine(m, matrix, (w, h), flags=cv2.INTER_NEAREST,
                                        borderMode=cv2.BORDER_CONSTANT, borderValue=0))
        if masks:
            out[name] = {"masks": np.stack(masks, axis=0),
                         "confidences": np.asarray(det.get("confidences", []), dtype=np.float32).copy(),
                         "label": det["label"], "color": det["color"]}
    return out


def _propagate_flow(prev_frame, curr_frame, detections: Detections, flow_scale: float = 0.5) -> Detections:
    if not detections:
        return {}
    h, w = curr_frame.shape[:2]
    scale = float(np.clip(flow_scale, 0.25, 1.0))
    fw, fh = max(32, int(w * scale)), max(32, int(h * scale))
    prev_gray = cv2.cvtColor(cv2.resize(prev_frame, (fw, fh), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    curr_gray = cv2.cvtColor(cv2.resize(curr_frame, (fw, fh), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    flow = cv2.calcOpticalFlowFarneback(prev_gray, curr_gray, None, pyr_scale=0.5, levels=2, winsize=15,
                                        iterations=2, poly_n=5, poly_sigma=1.2, flags=0)
    flow_x = cv2.resize(flow[..., 0], (w, h), interpolation=cv2.INTER_LINEAR) * (w / fw)
    flow_y = cv2.resize(flow[..., 1], (w, h), interpolation=cv2.INTER_LINEAR) * (h / fh)
    grid_x, grid_y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    map_x, map_y = grid_x - flow_x, grid_y - flow_y

    out: Detections = {}
    for name, det in detections.items():
        masks, confs = [], []
        for i, mask in enumerate(det["masks"]):
            m = (mask > 0.5).astype(np.uint8) * 255
            if m.shape != (h, w):
                m = cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            warped = cv2.remap(m, map_x, map_y, interpolation=cv2.INTER_NEAREST,
                               borderMode=cv2.BORDER_CONSTANT, borderValue=0)
            warped = (warped > 127).astype(np.float32)
            if warped.sum() < 16:
                continue
            masks.append(warped)
            if i < len(det["confidences"]):
                confs.append(float(det["confidences"][i]))
        if masks:
            out[name] = {"masks": np.stack(masks, axis=0), "confidences": np.asarray(confs, dtype=np.float32),
                         "label": det["label"], "color": det["color"]}
    return out


engine = Sam3Engine()
