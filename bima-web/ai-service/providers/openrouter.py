import json
import base64
import io
import httpx
import logging
from typing import List, Optional, Tuple
from PIL import Image
from schemas import DetectionSchema, DetectionItem, BBox, ClassDef, ModelConfigPayload
from providers.base import BaseVisionProvider
from services.visual_grid import apply_visual_grid_overlay, grid_to_normalized_bbox

logger = logging.getLogger(__name__)

class OpenRouterProvider(BaseVisionProvider):
    def __init__(self, config: ModelConfigPayload):
        super().__init__(config)
        self.endpoint_url = config.endpoint_url or "https://openrouter.ai/api/v1/chat/completions"
        self.model_name = config.model_name or "qwen/qwen3-vl-8b-instruct"
        self.api_key = config.api_key or ""

    def _apply_grid_to_image(self, image_base64: str) -> str:
        """Applies the 0-1000 visual grid overlay to the image before sending to the model.

        Falls back to the original image if grid application fails, so detection
        never breaks because of a grid rendering error.
        """
        try:
            return apply_visual_grid_overlay(image_base64)
        except Exception as e:
            logger.warning(f"[OpenRouter] Failed to apply visual grid overlay, sending original image: {e}")
            return image_base64

    @staticmethod
    def _get_image_dimensions(image_base64: str) -> Tuple[int, int]:
        """Extracts (width, height) of the original image from base64 data."""
        try:
            raw_b64 = image_base64.split(",")[1] if "," in image_base64 else image_base64
            img_bytes = base64.b64decode(raw_b64)
            with Image.open(io.BytesIO(img_bytes)) as img:
                return img.size  # (width, height)
        except Exception:
            # Safe fallback: assume a common large resolution so pixel coords
            # are still normalized rather than divided by 1000 blindly
            return (1920, 1080)

    def _build_system_prompt(self, active_classes: List[ClassDef]) -> str:
        classes_desc = "\n".join([
            f"- Class ID: '{c.id}', Name: '{c.name}' ({c.display_name or c.name})\n"
            f"  Visual Description: {c.visual_description}\n"
            f"  Condition Criteria: {c.condition_criteria}\n"
            f"  Feasibility Criteria: {c.feasibility_criteria}"
            for c in active_classes
        ])

        return (
            "Anda adalah AI vision pemantau infrastruktur kawasan dan fasilitas wilayah dengan visual grounding presisi tinggi.\n"
            "Tugas Anda: Menemukan semua objek fasilitas dan titik kerusakan fisik (seperti jalan retak, jalan berlubang, kaca cembung, dll) pada citra sesuai daftar kelas.\n\n"
            "DAFTAR KELAS AKTIF:\n"
            f"{classes_desc}\n\n"
            "ATURAN BOUNDING BOX (box_2d: [ymin, xmin, ymax, xmax] skala 0 - 1000):\n"
            "1. Format Koordinat: [ymin, xmin, ymax, xmax] dengan nilai 0 s.d. 1000 (0=paling atas/kiri, 1000=paling bawah/kanan).\n"
            "2. Lingkupi Objek / Kerusakan Secara Presisi & Proporsional:\n"
            "   - Bounding box HARUS melingkupi seluruh area fisik objek atau kerusakan dengan wajar (JANGAN membuat garis 1D super tipis / lidi, dan JANGAN meleset dari letak sebenarnya).\n"
            "   - Untuk Kerusakan Jalan Retak (jalan_retak): Buat bounding box yang melingkupi seluruh alur retakan jalan dan area aspal yang rusak di sekitarnya dengan lebar kotak yang proporsional.\n"
            "   - Untuk Jalan Berlubang (jalan_berlubang): Lingkupi seluruh lubang aspal beserta batas tepinya yang rusak secara pas.\n"
            "   - Untuk Kaca Cembung / Rambu (kaca_cembung / rambu): Lingkupi seluruh unit cermin / rambu yang tampak pada citra.\n\n"
            "FORMAT OUTPUT WAJIB (JSON murni tanpa markdown):\n"
            "{\n"
            '  "detections": [\n'
            "    {\n"
            '      "class_id": "id-kelas-dari-daftar",\n'
            '      "class_name": "nama_kelas_dari_daftar",\n'
            '      "condition": "deskripsi faktual kondisi kerusakan/objek",\n'
            '      "feasibility": "tidak_layak",\n'
            '      "box_2d": [ymin, xmin, ymax, xmax],\n'
            '      "confidence": 0.95\n'
            "    }\n"
            "  ]\n"
            "}\n"
            "Jika tidak ada objek yang cocok dari daftar kelas, kembalikan: {\"detections\": []}"
        )

    def _parse_bbox(self, d: dict, image_width: int, image_height: int) -> BBox:
        """Robust parser supporting {x, y, width, height}, {ymin, xmin, ymax, xmax}, and list formats.

        Handles three coordinate conventions the model may return:
        1. box_2d / bbox_2d: [ymin, xmin, ymax, xmax] on 0-1000 grid (visual grounding)
        2. Absolute pixel coords [x1, y1, x2, y2] or [x, y, w, h] in original image pixels
        3. Normalized 0-1 coords
        """
        # 1. Native visual grounding box_2d or bbox_2d: [ymin, xmin, ymax, xmax]
        box_2d = d.get("box_2d") or d.get("bbox_2d")
        if isinstance(box_2d, list) and len(box_2d) == 4:
            try:
                return grid_to_normalized_bbox(box_2d)
            except Exception:
                pass

        # 2. Key 'bbox' as dict
        bbox_dict = d.get("bbox")
        if isinstance(bbox_dict, dict):
            if "ymin" in bbox_dict and "xmin" in bbox_dict and "ymax" in bbox_dict and "xmax" in bbox_dict:
                return grid_to_normalized_bbox([
                    float(bbox_dict["ymin"]),
                    float(bbox_dict["xmin"]),
                    float(bbox_dict["ymax"]),
                    float(bbox_dict["xmax"])
                ])
            x = float(bbox_dict.get("x", 0.0))
            y = float(bbox_dict.get("y", 0.0))
            w = float(bbox_dict.get("width", 0.2))
            h = float(bbox_dict.get("height", 0.2))
            return self._normalize_pixel_or_relative(x, y, w, h, image_width, image_height)

        # 3. Key 'bbox' as list
        if isinstance(bbox_dict, list) and len(bbox_dict) == 4:
            try:
                vals = [float(v) for v in bbox_dict]
                # Ambiguous 4-number list: decide convention by magnitude
                if any(v > 1.0 for v in vals):
                    # Could be 0-1000 grid OR absolute pixels. If values exceed the
                    # image dimension, treat as 0-1000 grid; otherwise treat as pixels.
                    if any(v > max(image_width, image_height) for v in vals):
                        return grid_to_normalized_bbox(vals)
                    # Heuristic: [ymin, xmin, ymax, xmax] grid convention has ymin < ymax
                    # and values <= 1000. Absolute pixel [x1, y1, x2, y2] also has
                    # x1 < x2. Distinguish by checking if values look like grid coords
                    # (multiples of common grid steps) vs raw pixels.
                    if self._looks_like_grid_coords(vals, image_width, image_height):
                        return grid_to_normalized_bbox(vals)
                    # Otherwise: absolute pixel coords [x1, y1, x2, y2]
                    return self._pixel_to_normalized_bbox(vals, image_width, image_height)
                # All values <= 1.0: normalized [x1, y1, x2, y2]
                if vals[2] >= vals[0] and vals[3] >= vals[1] and (vals[2] - vals[0] > 0.01 or vals[3] - vals[1] > 0.01):
                    return grid_to_normalized_bbox(vals)
                else:
                    x, y, w, h = vals
                    return self._normalize_pixel_or_relative(x, y, w, h, image_width, image_height)
            except Exception:
                pass

        return BBox(x=0.1, y=0.1, width=0.3, height=0.3)

    @staticmethod
    def _looks_like_grid_coords(vals: List[float], image_width: int, image_height: int) -> bool:
        """Heuristic to distinguish 0-1000 grid coords from absolute pixel coords.

        Grid coords tend to be round-ish numbers on a 0-1000 scale. Absolute pixel
        coords scale with the actual image dimensions. If the max value is far below
        the image dimension but above 1.0, it is likely a 0-1000 grid value.
        """
        max_dim = max(image_width, image_height)
        max_val = max(abs(v) for v in vals)
        # If max value exceeds image dimension, it cannot be pixels -> grid
        if max_val > max_dim:
            return True
        # If max value is much smaller than image dimension (e.g. <= 1000 while
        # image is >= 2000px), it is likely grid coords
        if max_val <= 1000 and max_dim >= 2000:
            return True
        # Otherwise assume absolute pixels
        return False

    @staticmethod
    def _pixel_to_normalized_bbox(vals: List[float], image_width: int, image_height: int) -> BBox:
        """Convert absolute pixel [x1, y1, x2, y2] to normalized BBox."""
        x1, y1, x2, y2 = vals
        if x1 > x2:
            x1, x2 = x2, x1
        if y1 > y2:
            y1, y2 = y2, y1
        x1 = max(0.0, min(float(image_width), x1))
        x2 = max(0.0, min(float(image_width), x2))
        y1 = max(0.0, min(float(image_height), y1))
        y2 = max(0.0, min(float(image_height), y2))
        w = max(0.01, (x2 - x1) / max(1.0, float(image_width)))
        h = max(0.01, (y2 - y1) / max(1.0, float(image_height)))
        return BBox(
            x=max(0.0, min(1.0 - w, x1 / max(1.0, float(image_width)))),
            y=max(0.0, min(1.0 - h, y1 / max(1.0, float(image_height))),
            ),
            width=w,
            height=h,
        )

    @staticmethod
    def _normalize_pixel_or_relative(x: float, y: float, w: float, h: float, image_width: int, image_height: int) -> BBox:
        """Normalize {x, y, width, height} that may be pixels or 0-1 relative."""
        if x > 1.0 or y > 1.0 or w > 1.0 or h > 1.0:
            # Absolute pixels -> normalize by image dimension
            x = x / max(1.0, float(image_width))
            y = y / max(1.0, float(image_height))
            w = w / max(1.0, float(image_width))
            h = h / max(1.0, float(image_height))
        return BBox(
            x=max(0.0, min(1.0, x)),
            y=max(0.0, min(1.0, y)),
            width=max(0.01, min(1.0 - x, w)),
            height=max(0.01, min(1.0 - y, h))
        )

    async def detect(
        self,
        image_base64: str,
        active_classes: List[ClassDef],
        timestamp_seconds: Optional[float] = None,
        frame_index: Optional[int] = None
    ) -> DetectionSchema:
        if not self.api_key:
            raise ValueError("OpenRouter API Key belum dikonfigurasi.")

        if not active_classes:
            return DetectionSchema(detections=[])

        system_prompt = self._build_system_prompt(active_classes)

        # Send clean image directly to Vision LLM for natural, accurate visual grounding
        image_url = f"data:image/jpeg;base64,{image_base64}" if not image_base64.startswith("data:") else image_base64

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://bima-research.local",
            "X-Title": "Aplikasi Pemantauan Kawasan AI",
        }

        user_text = (
            "Analisis gambar ini dengan teliti. Temukan semua objek fasilitas dan titik kerusakan fisik sesuai daftar kelas.\n"
            "Tentukan koordinat box_2d: [ymin, xmin, ymax, xmax] (skala 0-1000) yang melingkupi objek/kerusakan secara akurat dan proporsional, serta evaluasi kondisi fisiknya."
        )

        payload = {
            "model": self.model_name,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": user_text
                        },
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ],
            "temperature": 0.1,
            "max_tokens": 4096,
            "response_format": {"type": "json_object"}
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(self.endpoint_url, headers=headers, json=payload)
            if response.status_code != 200:
                error_body = response.text
                print(f"[OpenRouter ERROR] Status {response.status_code}: {error_body}")
                raise ValueError(f"OpenRouter API error ({response.status_code}): {error_body}")
            res_data = response.json()

            raw_text = res_data["choices"][0]["message"]["content"]
            logger.info(f"[OpenRouter RAW] Response length={len(raw_text)}, preview={raw_text[:300]!r}")
            with open("openrouter_debug.log", "a", encoding="utf-8") as f:
                f.write("=== RAW RESPONSE ===\n" + raw_text + "\n===================\n")
            raw_detections = self._safe_parse_detections(raw_text)
            logger.info(f"[OpenRouter] Parsed {len(raw_detections)} raw detections: {[d.get('class_id','?') + '/' + d.get('class_name','?') for d in raw_detections]}")

            # Get original image dimensions for pixel-coordinate normalization
            image_width, image_height = self._get_image_dimensions(image_base64)

            # Map to DetectionItem with validation
            items: List[DetectionItem] = []
            class_id_map = {c.name: c.id for c in active_classes}
            class_name_map = {c.id: c.name for c in active_classes}
            # Fuzzy maps: lowercase & stripped for tolerant matching
            import difflib
            fuzzy_name_to_id: dict = {}
            for c in active_classes:
                fuzzy_name_to_id[c.name.lower().strip()] = c.id
                if c.display_name:
                    fuzzy_name_to_id[c.display_name.lower().strip()] = c.id

            for d in raw_detections:
                c_id = d.get("class_id")
                c_name_raw = d.get("class_name", "")

                # 1. Try direct class_id match against known IDs
                if c_id and c_id not in class_name_map:
                    # Not a real UUID - treat as a name slug
                    c_id = None

                # 2. Try class_name exact match
                if not c_id:
                    c_id = class_id_map.get(c_name_raw)

                # 3. Try fuzzy lowercase match on class_id or class_name
                if not c_id:
                    c_id = fuzzy_name_to_id.get(c_name_raw.lower().strip())

                # 4. Try fuzzy match on the class_id field (model may return slug like 'kaca_cembung')
                if not c_id and d.get("class_id"):
                    c_id = fuzzy_name_to_id.get(d["class_id"].lower().strip().replace("-", "_"))

                # 5. Advanced difflib fuzzy matching
                if not c_id:
                    all_names = list(fuzzy_name_to_id.keys())
                    matches = difflib.get_close_matches(c_name_raw.lower().strip(), all_names, n=1, cutoff=0.4)
                    if not matches and d.get("class_id"):
                        matches = difflib.get_close_matches(d["class_id"].lower().strip(), all_names, n=1, cutoff=0.4)
                    if matches:
                        c_id = fuzzy_name_to_id[matches[0]]

                if not c_id:
                    logger.warning(f"[OpenRouter] No class match for class_id={d.get('class_id')!r} class_name={c_name_raw!r}. Skipping.")
                    continue

                c_name = class_name_map.get(c_id, c_name_raw)
                bbox = self._parse_bbox(d, image_width, image_height)

                feasibility = d.get("feasibility", "cukup_layak").lower()
                if feasibility not in ["layak", "cukup_layak", "tidak_layak"]:
                    feasibility = "cukup_layak"

                items.append(
                    DetectionItem(
                        class_id=c_id,
                        class_name=c_name,
                        bbox=bbox,
                        condition=d.get("condition", "Kondisi terdeteksi oleh AI"),
                        feasibility=feasibility,
                        confidence=float(d.get("confidence", 0.9)),
                        timestamp_seconds=timestamp_seconds,
                        frame_index=frame_index
                    )
                )

            logger.info(f"[OpenRouter] Final mapped items: {len(items)}. BBoxes: {[str(i.bbox) for i in items]}")
            return DetectionSchema(detections=items)

    def _safe_parse_detections(self, raw_text: str) -> List[dict]:
        """Robust parser to handle valid JSON, truncated responses, and unterminated strings."""
        text = raw_text.strip()
        if text.startswith("```json"):
            text = text.replace("```json", "", 1)
        if text.startswith("```"):
            text = text.replace("```", "", 1)
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        # 1. Standard parse
        try:
            parsed = json.loads(text)
            if isinstance(parsed, dict) and "detections" in parsed:
                return parsed["detections"]
            if isinstance(parsed, list):
                return parsed
        except Exception:
            pass

        # 2. Repair truncated JSON (unterminated strings/arrays)
        for suffix in ['"}]}', '"}]', '}]}', '}', '"]}', '"]']:
            try:
                repaired = text + suffix
                parsed = json.loads(repaired)
                if isinstance(parsed, dict) and "detections" in parsed:
                    return parsed["detections"]
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                continue

        # 3. Regex extraction of individual valid objects
        import re
        pattern = re.compile(r'\{[^{}]*"(?:class_id|class_name)"[^{}]*\}', re.DOTALL)
        items = []
        for m in pattern.finditer(text):
            try:
                obj = json.loads(m.group(0))
                if isinstance(obj, dict):
                    items.append(obj)
            except Exception:
                continue

        return items

    async def test_connection(self) -> bool:
        if not self.api_key:
            return False
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.get("https://openrouter.ai/api/v1/auth/key", headers=headers)
            return res.status_code == 200
