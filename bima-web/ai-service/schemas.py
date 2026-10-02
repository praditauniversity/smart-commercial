from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class BBox(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    x: float = Field(..., ge=0.0, le=1.0, description="Normalized x coordinate (top-left)")
    y: float = Field(..., ge=0.0, le=1.0, description="Normalized y coordinate (top-left)")
    width: float = Field(..., ge=0.0, le=1.0, description="Normalized width")
    height: float = Field(..., ge=0.0, le=1.0, description="Normalized height")

class DetectionItem(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    class_id: str
    class_name: str
    bbox: BBox
    condition: str
    feasibility: str = Field(..., description="layak | cukup_layak | tidak_layak")
    confidence: Optional[float] = 0.9
    timestamp_seconds: Optional[float] = None
    frame_index: Optional[int] = None
    has_conflict: bool = False
    conflict_details: Optional[Dict[str, Any]] = None

class DetectionSchema(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    detections: List[DetectionItem] = Field(default_factory=list)

class ClassDef(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    id: str
    name: str
    display_name: Optional[str] = None
    visual_description: str
    condition_criteria: str
    feasibility_criteria: str
    mutually_exclusive_with: List[str] = Field(default_factory=list)
    conflict_iou_threshold: Optional[float] = 0.5
    sam_prompt: Optional[str] = None  # text prompt for the local SAM3 provider
    sam_color: Optional[str] = None   # "#RRGGBB" overlay color for SAM3 results
    model_class: Optional[str] = None  # YOLO output class name (e.g. "pavedroad_pothole"); falls back to `name`

class ModelConfigPayload(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    provider: str = "OpenRouter" # OpenRouter | onpremise | sam3 | yolo | mock
    model_name: str  # always sent by the web app from the ModelConfig row
    endpoint_url: Optional[str] = None
    api_key: Optional[str] = None
    sam_mode: Optional[str] = None  # sam3 video algorithm: "optimized" (default) | "fast"

class ProcessMediaRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    session_id: str
    media_asset_id: str
    file_url: str
    file_type: str # "image" | "video"
    active_classes: List[ClassDef]
    ai_model_config: ModelConfigPayload
    idempotency_key: Optional[str] = None
    conflict_threshold: float  # default IoU threshold for class conflicts; sent by the web app from its environment

class MediaSegmentResult(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    segment_index: int
    start_time: float
    end_time: float
    status: str = "completed"
    media_url: Optional[str] = None
    extraction_metadata: Optional[Dict[str, Any]] = None

class ProcessMediaResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    success: bool
    media_asset_id: str
    status: str # "completed" | "failed"
    detections: List[DetectionItem] = Field(default_factory=list)
    segments: List[MediaSegmentResult] = Field(default_factory=list)
    error_message: Optional[str] = None

class TestConnectionRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    ai_model_config: ModelConfigPayload

class TestConnectionResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    success: bool
    message: str
    latency_ms: Optional[float] = None


class FrameInput(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    frame_index: int
    timestamp_seconds: float
    url: str  # http(s) URL, data: URL, or local path of an already-extracted frame (JPEG/PNG)

class YoloDetectRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    session_id: str
    media_asset_id: str
    frames: List[FrameInput] = Field(..., min_length=1, max_length=64)
    active_classes: List[ClassDef]
    conflict_threshold: float

class YoloDetectMetrics(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    frames: int
    download_ms: float
    inference_ms: float
    total_ms: float
    per_model_ms: Dict[str, float] = Field(default_factory=dict)  # total ms per category model
    detections_by_class: Dict[str, int] = Field(default_factory=dict)
    missing_models: List[str] = Field(default_factory=list)
    device: Optional[str] = None
    conf: float

class YoloDetectResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    success: bool
    media_asset_id: str
    detections: List[DetectionItem] = Field(default_factory=list)
    metrics: Optional[YoloDetectMetrics] = None
    error_message: Optional[str] = None
