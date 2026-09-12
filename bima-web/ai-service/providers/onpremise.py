import httpx
import json
from typing import List, Optional
from schemas import DetectionSchema, DetectionItem, BBox, ClassDef, ModelConfigPayload
from providers.base import BaseVisionProvider

class OnPremiseProvider(BaseVisionProvider):
    def __init__(self, config: ModelConfigPayload):
        super().__init__(config)
        self.endpoint_url = config.endpoint_url or "http://localhost:8000/v1/vision"
        self.api_key = config.api_key

    async def detect(
        self,
        image_base64: str,
        active_classes: List[ClassDef],
        timestamp_seconds: Optional[float] = None,
        frame_index: Optional[int] = None
    ) -> DetectionSchema:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        payload = {
            "image": image_base64,
            "classes": [c.model_dump() for c in active_classes]
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self.endpoint_url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

            items: List[DetectionItem] = []
            for d in data.get("detections", []):
                items.append(DetectionItem(
                    class_id=d["class_id"],
                    class_name=d["class_name"],
                    bbox=BBox(**d["bbox"]),
                    condition=d.get("condition", "Hasil deteksi on-premise"),
                    feasibility=d.get("feasibility", "cukup_layak"),
                    confidence=d.get("confidence", 0.9),
                    timestamp_seconds=timestamp_seconds,
                    frame_index=frame_index
                ))

            return DetectionSchema(detections=items)

    async def test_connection(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(self.endpoint_url.replace("/vision", "/health"))
                return res.status_code == 200
        except Exception:
            return False
