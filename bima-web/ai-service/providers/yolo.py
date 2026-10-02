import asyncio
import base64
from typing import List, Optional

import cv2
import numpy as np

from providers.base import BaseVisionProvider
from schemas import BBox, ClassDef, DetectionItem, DetectionSchema, ModelConfigPayload
from services.yolo_engine import RawDetection, engine


def decode_image(image_base64: str) -> np.ndarray:
    data = np.frombuffer(base64.b64decode(image_base64), dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Citra tidak dapat didecode (format tidak dikenali atau berkas rusak).")
    return img


def to_detection_items(
    raw: List[RawDetection],
    active_classes: List[ClassDef],
    timestamp_seconds: Optional[float],
    frame_index: Optional[int],
) -> List[DetectionItem]:
    """Memetakan keluaran model ke kelas aktif. Kelas yang tidak aktif/tidak terdaftar dibuang, bukan ditebak."""
    by_model_class = {(c.model_class or c.name): c for c in active_classes}
    items: List[DetectionItem] = []
    for d in raw:
        cls = by_model_class.get(d.model_class)
        if cls is None:
            continue
        items.append(
            DetectionItem(
                class_id=cls.id,
                class_name=cls.name,
                bbox=BBox(x=d.x, y=d.y, width=d.width, height=d.height),
                condition=f"Terdeteksi oleh model YOLO (confidence {d.confidence:.2f})",
                # Kelayakan tidak berlaku untuk YOLO; tingkat risiko dihitung di sisi web (Severity x Exposure).
                feasibility="tidak_dinilai",
                confidence=round(d.confidence, 4),
                timestamp_seconds=timestamp_seconds,
                frame_index=frame_index,
            )
        )
    return items


class YoloProvider(BaseVisionProvider):
    """Deteksi objek lokal (CPU) dari weight yolo11n_seed0. Memenuhi kontrak provider yang sama dengan VLM."""

    def __init__(self, config: ModelConfigPayload):
        super().__init__(config)

    async def detect(
        self,
        image_base64: str,
        active_classes: List[ClassDef],
        timestamp_seconds: Optional[float] = None,
        frame_index: Optional[int] = None,
    ) -> DetectionSchema:
        img = decode_image(image_base64)
        raw, _ = await asyncio.to_thread(engine.detect, img)
        return DetectionSchema(detections=to_detection_items(raw, active_classes, timestamp_seconds, frame_index))

    async def test_connection(self) -> bool:
        return bool(engine.status()["present"])
