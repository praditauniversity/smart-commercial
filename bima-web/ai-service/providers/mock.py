import random
import hashlib
from typing import List, Optional
from schemas import DetectionSchema, DetectionItem, BBox, ClassDef, ModelConfigPayload
from providers.base import BaseVisionProvider

class MockVisionProvider(BaseVisionProvider):
    """
    Intelligent mock vision provider for testing, local offline usage,
    and fallback when external API keys are unavailable.
    """
    async def detect(
        self,
        image_base64: str,
        active_classes: List[ClassDef],
        timestamp_seconds: Optional[float] = None,
        frame_index: Optional[int] = None
    ) -> DetectionSchema:
        if not active_classes:
            return DetectionSchema(detections=[])

        # Generate deterministic results based on image hash and active classes
        img_hash = hashlib.md5((image_base64[:100] + str(frame_index or 0)).encode()).hexdigest()
        seed = int(img_hash[:8], 16)
        rng = random.Random(seed)

        num_detections = rng.choice([1, 2, 3])
        sample_classes = rng.sample(active_classes, min(num_detections, len(active_classes)))

        detections: List[DetectionItem] = []
        for i, cls in enumerate(sample_classes):
            x = rng.uniform(0.1, 0.6)
            y = rng.uniform(0.1, 0.6)
            w = rng.uniform(0.15, 0.35)
            h = rng.uniform(0.15, 0.35)

            feasibility = rng.choice(["layak", "cukup_layak", "tidak_layak"])
            condition_texts = {
                "jalan_berlubang": "Aspal terkelupas dengan lubang sedalam ~4cm",
                "rambu_rusak": "Daun rambu miring 15 derajat dan pudar",
                "marka_pudar": "Garis marka tengah aus terkikis kendaraan",
                "lampu_padam": "Kap lampu pecah dan tiang korosi",
                "trotoar_rusak": "Paving block terangkat akar pohon dan retak",
            }
            condition = condition_texts.get(cls.name, f"Kondisi {cls.display_name or cls.name} teridentifikasi.")

            detections.append(
                DetectionItem(
                    class_id=cls.id,
                    class_name=cls.name,
                    bbox=BBox(
                        x=round(x, 2),
                        y=round(y, 2),
                        width=round(w, 2),
                        height=round(h, 2)
                    ),
                    condition=condition,
                    feasibility=feasibility,
                    confidence=round(rng.uniform(0.85, 0.98), 2),
                    timestamp_seconds=timestamp_seconds,
                    frame_index=frame_index
                )
            )

        return DetectionSchema(detections=detections)

    async def test_connection(self) -> bool:
        return True
