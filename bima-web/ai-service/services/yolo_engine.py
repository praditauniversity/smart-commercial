"""Inferensi YOLO (Ultralytics) untuk enam model kategori hasil training (RQ2).

Konfigurasi hanya dari environment (tanpa nilai bawaan di kode):
  YOLO_WEIGHTS_DIR  folder bobot (relatif terhadap ai-service/ atau absolut), mis. models/yolo11n_seed0
  YOLO_CONF         ambang confidence
  YOLO_DEVICE       opsional, mis. "cpu" (kosong = pilihan otomatis Ultralytics)
  YOLO_IMGSZ        opsional, ukuran input (kosong = bawaan model)

Berkas bobot: <kategori>-best.pt untuk kategori pavedroad, vegetation, weeds, sign, banner, house_notice.
Model dimuat saat pertama dibutuhkan; berkas yang tidak ada dilaporkan di `status()`, bukan diabaikan diam-diam.
"""
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np

from config import optional_env, optional_env_int, require_env, require_env_float

logger = logging.getLogger("ai_service.yolo")

CATEGORY_MODELS: Tuple[str, ...] = ("pavedroad", "vegetation", "weeds", "sign", "banner", "house_notice")
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@dataclass
class RawDetection:
    model_class: str  # nama kelas keluaran model, mis. "pavedroad_pothole"
    source_model: str  # kategori model asal, mis. "pavedroad"
    confidence: float
    x: float  # kiri-atas, ternormalisasi 0-1
    y: float
    width: float
    height: float
    # Kotak dalam piksel gambar asli (x1, y1, x2, y2); dipakai Tahap 2 untuk memotong crop.
    xyxy: Tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)


@dataclass
class DetectTimings:
    per_model_ms: Dict[str, float] = field(default_factory=dict)

    @property
    def total_ms(self) -> float:
        return sum(self.per_model_ms.values())


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


class YoloEngine:
    def __init__(self):
        self._models: Dict[str, object] = {}
        self._missing: List[str] = []
        self._loaded = False
        self._lock = threading.Lock()

    # --- konfigurasi (dibaca saat dipakai agar import modul tidak gagal) ---
    @property
    def weights_dir(self) -> str:
        d = require_env("YOLO_WEIGHTS_DIR")
        return d if os.path.isabs(d) else os.path.join(_BASE_DIR, d)

    @property
    def conf(self) -> float:
        return require_env_float("YOLO_CONF")

    @property
    def device(self) -> Optional[str]:
        return optional_env("YOLO_DEVICE")

    @property
    def imgsz(self) -> Optional[int]:
        return optional_env_int("YOLO_IMGSZ")

    # --- pemuatan ---
    def weight_path(self, category: str) -> str:
        return os.path.join(self.weights_dir, f"{category}-best.pt")

    def status(self) -> Dict[str, object]:
        """Memeriksa keberadaan bobot tanpa memuat model."""
        present = [c for c in CATEGORY_MODELS if os.path.isfile(self.weight_path(c))]
        missing = [c for c in CATEGORY_MODELS if c not in present]
        return {"weights_dir": self.weights_dir, "present": present, "missing": missing, "ok": not missing}

    def load(self) -> None:
        with self._lock:
            if self._loaded:
                return
            try:
                from ultralytics import YOLO
            except ImportError as e:
                raise RuntimeError("ultralytics belum terpasang di ai-service (pip install -r requirements-yolo.txt).") from e
            models: Dict[str, object] = {}
            missing: List[str] = []
            for cat in CATEGORY_MODELS:
                path = self.weight_path(cat)
                if not os.path.isfile(path):
                    missing.append(cat)
                    continue
                models[cat] = YOLO(path)
                logger.info("YOLO dimuat: %s (%s)", cat, path)
            if not models:
                raise RuntimeError(f"Tidak ada bobot YOLO di '{self.weights_dir}' (YOLO_WEIGHTS_DIR).")
            if missing:
                logger.warning("Bobot YOLO tidak ditemukan untuk: %s", ", ".join(missing))
            self._models, self._missing, self._loaded = models, missing, True

    @property
    def missing_categories(self) -> List[str]:
        return list(self._missing)

    # --- inferensi ---
    def detect(self, image_bgr: np.ndarray, conf: Optional[float] = None) -> Tuple[List[RawDetection], DetectTimings]:
        """Menjalankan seluruh model kategori pada satu citra BGR. Thread-safe (satu inferensi pada satu waktu)."""
        self.load()
        threshold = self.conf if conf is None else conf
        results: List[RawDetection] = []
        timings = DetectTimings()
        kwargs = {"conf": threshold, "verbose": False}
        if self.device:
            kwargs["device"] = self.device
        if self.imgsz:
            kwargs["imgsz"] = self.imgsz
        with self._lock:
            for cat, model in self._models.items():
                t0 = time.perf_counter()
                r = model.predict(image_bgr, **kwargs)[0]
                timings.per_model_ms[cat] = (time.perf_counter() - t0) * 1000.0
                names = r.names
                for box, pxbox, c, s in zip(r.boxes.xyxyn.tolist(), r.boxes.xyxy.tolist(), r.boxes.cls.tolist(), r.boxes.conf.tolist()):
                    x1, y1, x2, y2 = (_clamp01(v) for v in box)
                    results.append(
                        RawDetection(
                            model_class=names[int(c)],
                            source_model=cat,
                            confidence=float(s),
                            x=x1,
                            y=y1,
                            width=max(0.0, x2 - x1),
                            height=max(0.0, y2 - y1),
                            xyxy=(float(pxbox[0]), float(pxbox[1]), float(pxbox[2]), float(pxbox[3])),
                        )
                    )
        return results, timings


engine = YoloEngine()
