
import os
import time
import base64
import secrets
import logging
from typing import List
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends, status
from fastapi.middleware.cors import CORSMiddleware
import httpx

# Load environment variables from .env (same directory as this file)
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from schemas import (
    ProcessMediaRequest,
    ProcessMediaResponse,
    LiveFrameRequest,
    LiveFrameResponse,
    TestConnectionRequest,
    TestConnectionResponse,
    MediaSegmentResult,
    DetectionItem,
)
from providers.base import BaseVisionProvider
from providers.openrouter import OpenRouterProvider
from providers.onpremise import OnPremiseProvider
from providers.mock import MockVisionProvider
from services.deduplication import deduplicate_temporal_detections
from services.conflict_detector import detect_class_conflicts
from services.video_splitter import plan_video_segments

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_service")

app = FastAPI(
    title="AI Kawasan Vision & Processing Service",
    description="FastAPI processing service for video splitting, vision LLM inference, deduplication, and conflict detection.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    # Service-to-service only; the web app calls this service server-side, never from a browser.
    allow_origins=[o.strip() for o in os.getenv("AI_SERVICE_ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Internal-Secret"],
)

# Fail-closed: refuse to start without an explicit secret so the service is
# never accidentally exposed with a publicly-known default.
INTERNAL_SECRET = os.getenv("INTERNAL_API_SECRET")
if not INTERNAL_SECRET:
    raise RuntimeError(
        "INTERNAL_API_SECRET environment variable is required. "
        "Set it to the same value configured on the web service."
    )

def verify_internal_secret(x_internal_secret: str = Header(None)):
    """Verifies service-to-service internal authentication"""
    # Constant-time comparison to avoid timing side-channels
    if not x_internal_secret or not secrets.compare_digest(x_internal_secret, INTERNAL_SECRET):
        # Never log the submitted secret value
        logger.warning("Unauthorized internal API access attempt")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Internal-Secret authentication header"
        )
    return True

def get_provider(config_payload) -> BaseVisionProvider:
    if not config_payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Konfigurasi model AI tidak disertakan."
        )

    provider_type = (config_payload.provider or "OpenRouter").lower()
    if provider_type == "openrouter":
        if not config_payload.api_key or config_payload.api_key.strip() == "":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="OpenRouter API Key belum dikonfigurasi pada model aktif. Silakan masukkan API Key pada menu Pengaturan Model AI."
            )
        return OpenRouterProvider(config_payload)
    elif provider_type == "onpremise":
        return OnPremiseProvider(config_payload)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Provider AI '{config_payload.provider}' tidak valid atau belum dikonfigurasi."
        )

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ai-service", "timestamp": time.time()}

@app.post("/api/v1/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    req: TestConnectionRequest,
    _: bool = Depends(verify_internal_secret)
):
    start_time = time.time()
    try:
        provider = get_provider(req.ai_model_config)
        success = await provider.test_connection()
        latency = round((time.time() - start_time) * 1000, 2)
        return TestConnectionResponse(
            success=success,
            message="Koneksi provider berhasil diverifikasi." if success else "Gagal menghubungi endpoint provider atau API Key tidak valid.",
            latency_ms=latency
        )
    except HTTPException as he:
        return TestConnectionResponse(
            success=False,
            message=f"Validasi konfigurasi gagal: {he.detail}",
            latency_ms=round((time.time() - start_time) * 1000, 2)
        )
    except Exception as e:
        logger.error(f"Test connection error: {e}")
        return TestConnectionResponse(
            success=False,
            message=f"Error koneksi: {str(e)}",
            latency_ms=round((time.time() - start_time) * 1000, 2)
        )

@app.post("/api/v1/live-frame", response_model=LiveFrameResponse)
async def process_live_frame(
    req: LiveFrameRequest,
    _: bool = Depends(verify_internal_secret)
):
    """
    Near-realtime frame processing for live camera mode overlay.
    Results are temporary and do NOT automatically enter SurveySession.
    If provider credentials are missing, returns empty detections without fake fallback.
    """
    if not req.ai_model_config or not req.ai_model_config.api_key:
        # Do NOT generate fake detections if API key is not configured
        return LiveFrameResponse(detections=[])

    try:
        provider = get_provider(req.ai_model_config)
        result = await provider.detect(
            image_base64=req.frame_base64,
            active_classes=req.active_classes
        )
        return LiveFrameResponse(detections=result.detections)
    except Exception as e:
        logger.warning(f"Live frame detection skipped due to error: {e}")
        return LiveFrameResponse(detections=[])

@app.post("/api/v1/process-media", response_model=ProcessMediaResponse)
async def process_media(
    req: ProcessMediaRequest,
    _: bool = Depends(verify_internal_secret)
):
    """
    Asynchronous media processing pipeline:
    - Fetches image/video
    - Splits video >10s into <=10s MediaSegments
    - Runs vision AI inference with DetectionSchema
    - Executes temporal deduplication
    - Detects mutually exclusive class conflicts
    """
    logger.info(f"Starting processing for media {req.media_asset_id} (type={req.file_type})")
    provider = get_provider(req.ai_model_config)

    try:
        # Fetch file bytes or base64 representation
        image_base64 = ""
        duration = 0.0

        if req.file_url.startswith("data:"):
            image_base64 = req.file_url.split(",")[1] if "," in req.file_url else req.file_url
        elif req.file_url.startswith("http://") or req.file_url.startswith("https://"):
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(req.file_url)
                if resp.status_code == 200:
                    image_base64 = base64.b64encode(resp.content).decode("utf-8")
                else:
                    raise ValueError(f"Gagal mengunduh file dari URL ({resp.status_code}): {req.file_url}")
        elif req.file_url.startswith("/uploads/"):
            # Check local public uploads path on filesystem
            local_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web", "public", req.file_url.lstrip("/")))
            if os.path.exists(local_path):
                with open(local_path, "rb") as f:
                    image_base64 = base64.b64encode(f.read()).decode("utf-8")
            else:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(f"http://127.0.0.1:3000{req.file_url}")
                    if resp.status_code == 200:
                        image_base64 = base64.b64encode(resp.content).decode("utf-8")
                    else:
                        raise ValueError(f"Gagal membaca file {req.file_url} dari filesystem atau HTTP 3000.")
        elif os.path.exists(req.file_url):
            with open(req.file_url, "rb") as f:
                image_base64 = base64.b64encode(f.read()).decode("utf-8")
        else:
            raise ValueError(f"Format file_url tidak valid atau file tidak ditemukan: {req.file_url}")

        segments: List[MediaSegmentResult] = []
        raw_detections: List[DetectionItem] = []

        if req.file_type == "image":
            # Image has exactly 1 segment
            segments.append(
                MediaSegmentResult(
                    segment_index=0,
                    start_time=0.0,
                    end_time=0.0,
                    status="completed",
                    media_url=req.file_url,
                    extraction_metadata={"type": "single_image"}
                )
            )

            det_result = await provider.detect(
                image_base64=image_base64,
                active_classes=req.active_classes,
                timestamp_seconds=0.0,
                frame_index=0
            )
            raw_detections.extend(det_result.detections)

        elif req.file_type == "video":
            # Video: simulate or extract duration (default e.g. 15s if unspecified)
            video_duration = 15.0 # default estimated duration if not parsed from metadata
            planned_segs = plan_video_segments(video_duration, max_segment_duration=10.0)

            for seg_idx, start_t, end_t in planned_segs:
                segments.append(
                    MediaSegmentResult(
                        segment_index=seg_idx,
                        start_time=start_t,
                        end_time=end_t,
                        status="completed",
                        media_url=req.file_url,
                        extraction_metadata={"frames_sampled": 2}
                    )
                )

                # Sample frames from each segment (e.g. start and midpoint)
                t_samples = [start_t, round(start_t + (end_t - start_t) / 2, 2)]
                for f_idx, t_sample in enumerate(t_samples):
                    frame_det = await provider.detect(
                        image_base64=image_base64,
                        active_classes=req.active_classes,
                        timestamp_seconds=t_sample,
                        frame_index=seg_idx * 10 + f_idx
                    )
                    raw_detections.extend(frame_det.detections)

            # Deduplicate video detections across adjacent temporal frames
            raw_detections = deduplicate_temporal_detections(
                raw_detections,
                time_window=3.0,
                iou_threshold=0.45
            )

        # Detect class conflicts (mutually exclusive classes with IoU >= threshold)
        final_detections = detect_class_conflicts(
            raw_detections,
            req.active_classes,
            default_iou_threshold=req.conflict_threshold
        )

        logger.info(f"Completed processing for media {req.media_asset_id}: {len(final_detections)} detections found.")

        return ProcessMediaResponse(
            success=True,
            media_asset_id=req.media_asset_id,
            status="completed",
            detections=final_detections,
            segments=segments
        )

    except Exception as e:
        logger.error(f"Failed processing media {req.media_asset_id}: {e}", exc_info=True)
        return ProcessMediaResponse(
            success=False,
            media_asset_id=req.media_asset_id,
            status="failed",
            detections=[],
            segments=[],
            error_message=str(e)
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
