"""Tahap 2 kategori rambu (sign): klasifikasi kondisi per crop.

Alur (mengikuti evaluasi joint pipeline pada notebook training Training_Ulang_Sign_COLAB.ipynb, Bagian 8.1 dan 10.2-10.3):
  1. Stage 1 (YOLO sign) mendeteksi SEMUA kotak rambu pada satu gambar.
  2. Tiap kotak di-crop dengan `adaptive_crop_box` (margin dasar 0,28, dikurangi otomatis bila ada kotak rambu LAIN berdekatan).
  3. Classifier Stage 2 dijalankan pada crop (imgsz=224) dan menghasilkan satu label.

Model Stage 2: yolo11n-cls "fold0" (`fold0_best.pt`), salah satu dari 5 model hasil 5-fold cross-validation (GroupKFold), BUKAN
model yang dilatih dari seluruh data; dipilih karena menjadi default di notebook training. Statusnya harus selalu disebut
saat hasilnya ditampilkan: "classifier fold0, hasil 5-fold cross-validation".

Classifier hanya 2 kelas: {damaged, normal}. Ia TIDAK menghasilkan subtipe kerusakan (panel_hilang, dst.); subtipe ditetapkan
supervisor di dasbor dan severity-nya diambil dari master tag.

Adaptasi dari notebook (hanya satu): `other_boxes` berisi kotak rambu lain hasil Stage 1 pada gambar yang sama, bukan ground truth
(notebook memakai ground truth karena itu konteks evaluasi). `yolo_box_to_xyxy` pada notebook tidak dipakai di sini karena
prediksi Stage 1 sudah berupa kotak xyxy dalam piksel.
"""
import logging
import os
import threading
import time
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np

from config import optional_env
from services.yolo_engine import RawDetection, engine as yolo_engine

logger = logging.getLogger("ai_service.sign_condition")

STAGE2_MODEL_ID = "sign_classifier_fold0"
STAGE2_MODEL_LABEL = "classifier fold0, hasil 5-fold cross-validation"
STAGE2_IMGSZ = 224
EXPECTED_LABELS = frozenset({"damaged", "normal"})
SIGN_MODEL_CLASS = "sign"


def adaptive_crop_box(box, other_boxes, img_w, img_h, base_margin_ratio=0.28, min_margin_ratio=0.05):
    """Margin dikurangi otomatis bila ada box lain berdekatan, agar crop tidak memuat
    sebagian objek tetangga berlabel berbeda (prinsip data-integrity, margin dasar 0.28
    sesuai konfigurasi terbaik yang sudah divalidasi di proyek ini)."""
    x1, y1, x2, y2 = box
    w, h = x2 - x1, y2 - y1
    margin_ratio = base_margin_ratio
    for ob in other_boxes:
        ox1, oy1, ox2, oy2 = ob
        dx = max(ox1 - x2, x1 - ox2, 0)
        dy = max(oy1 - y2, y1 - oy2, 0)
        dist = max(dx, dy)
        nearby_thresh = 0.5 * max(w, h)
        if dist < nearby_thresh:
            scaled = min_margin_ratio + (base_margin_ratio - min_margin_ratio) * (dist / nearby_thresh)
            margin_ratio = min(margin_ratio, scaled)
    mx, my = w * margin_ratio, h * margin_ratio
    nx1 = max(0, int(round(x1 - mx))); ny1 = max(0, int(round(y1 - my)))
    nx2 = min(img_w, int(round(x2 + mx))); ny2 = min(img_h, int(round(y2 + my)))
    return nx1, ny1, nx2, ny2


class SignConditionClassifier:
    """Memuat dan menjalankan classifier Stage 2. Aktif hanya bila env SIGN_CONDITION_WEIGHTS diisi."""

    def __init__(self):
        self._model = None
        self._lock = threading.Lock()

    @property
    def weights_path(self) -> Optional[str]:
        v = optional_env("SIGN_CONDITION_WEIGHTS")
        if not v:
            return None
        return v if os.path.isabs(v) else os.path.join(yolo_engine.weights_dir, v)

    @property
    def enabled(self) -> bool:
        # Hanya memeriksa env; tidak membutuhkan YOLO_WEIGHTS_DIR (path baru dibentuk saat bobot dimuat).
        return bool(optional_env("SIGN_CONDITION_WEIGHTS"))

    def status(self) -> Dict[str, object]:
        if not self.enabled:
            return {"enabled": False, "path": None, "present": False, "model": STAGE2_MODEL_ID}
        path = self.weights_path
        return {"enabled": True, "path": path, "present": os.path.isfile(path), "model": STAGE2_MODEL_ID}

    def load(self) -> None:
        with self._lock:
            if self._model is not None:
                return
            path = self.weights_path
            if path is None:
                raise RuntimeError("Tahap 2 rambu tidak aktif (SIGN_CONDITION_WEIGHTS kosong).")
            if not os.path.isfile(path):
                raise RuntimeError(f"Bobot classifier Tahap 2 tidak ditemukan: '{path}' (SIGN_CONDITION_WEIGHTS).")
            try:
                from ultralytics import YOLO
            except ImportError as e:
                raise RuntimeError("ultralytics belum terpasang di ai-service (pip install -r requirements-yolo.txt).") from e
            model = YOLO(path)
            labels = set(model.names.values())
            if getattr(model, "task", None) != "classify" or labels != EXPECTED_LABELS:
                raise RuntimeError(
                    f"Classifier Tahap 2 tidak sesuai: task={getattr(model, 'task', None)}, kelas={sorted(labels)}; "
                    f"diharapkan classify dengan kelas {sorted(EXPECTED_LABELS)}."
                )
            self._model = model
            logger.info("Classifier Tahap 2 dimuat: %s (%s)", path, STAGE2_MODEL_LABEL)

    def classify_crop(self, crop_bgr: np.ndarray) -> str:
        """Mengembalikan 'damaged' atau 'normal'. Label dipetakan lewat NAMA kelas, bukan indeks."""
        self.load()
        # Notebook memanggil classifier pada crop yang ditulis ke file JPEG; encode/decode JPEG di memori (kualitas bawaan
        # cv2 = yang dipakai cv2.imwrite) menghasilkan piksel yang sama tanpa I/O disk, sehingga konsisten dengan evaluasi.
        ok, buf = cv2.imencode(".jpg", crop_bgr)
        if not ok:
            raise ValueError("Crop tidak dapat di-encode JPEG.")
        img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        kwargs = {"imgsz": STAGE2_IMGSZ, "verbose": False}
        if yolo_engine.device:
            kwargs["device"] = yolo_engine.device
        with self._lock:
            r = self._model.predict(img, **kwargs)[0]
        return r.names[int(r.probs.top1)]


classifier = SignConditionClassifier()


def classify_signs(
    image_bgr: np.ndarray,
    detections: Sequence[RawDetection],
    clf: SignConditionClassifier = classifier,
) -> Dict[int, str]:
    """Mengklasifikasi tiap deteksi rambu pada satu gambar. Kunci hasil = indeks pada `detections`.

    Crop memakai kotak rambu LAIN pada gambar yang sama sebagai `other_boxes`. Kotak dengan crop kosong dilewati."""
    h, w = image_bgr.shape[:2]
    idx = [i for i, d in enumerate(detections) if d.model_class == SIGN_MODEL_CLASS]
    boxes: List[Tuple[float, float, float, float]] = [tuple(detections[i].xyxy) for i in idx]
    out: Dict[int, str] = {}
    for k, i in enumerate(idx):
        others = [b for j, b in enumerate(boxes) if j != k]
        nx1, ny1, nx2, ny2 = adaptive_crop_box(boxes[k], others, w, h)
        crop = image_bgr[ny1:ny2, nx1:nx2]
        if crop.size == 0:
            logger.warning("Crop rambu kosong dilewati (kotak %s pada gambar %sx%s).", boxes[k], w, h)
            continue
        out[i] = clf.classify_crop(crop)
    return out
