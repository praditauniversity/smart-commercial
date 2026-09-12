import pytest
from schemas import BBox, DetectionItem, ClassDef
from services.deduplication import calculate_iou, deduplicate_temporal_detections
from services.conflict_detector import detect_class_conflicts
from services.video_splitter import plan_video_segments

def test_iou_calculation():
    # Identical boxes
    box1 = BBox(x=0.1, y=0.1, width=0.2, height=0.2)
    box2 = BBox(x=0.1, y=0.1, width=0.2, height=0.2)
    assert calculate_iou(box1, box2) == pytest.approx(1.0)

    # Disjoint boxes
    box3 = BBox(x=0.5, y=0.5, width=0.2, height=0.2)
    assert calculate_iou(box1, box3) == pytest.approx(0.0)

    # Partial overlap
    box4 = BBox(x=0.2, y=0.1, width=0.2, height=0.2)
    iou = calculate_iou(box1, box4)
    assert 0.0 < iou < 1.0

def test_video_segmentation_planning():
    # 27 second video should split into 3 segments: 0-10, 10-20, 20-27
    segs = plan_video_segments(27.0, max_segment_duration=10.0)
    assert len(segs) == 3
    assert segs[0] == (0, 0.0, 10.0)
    assert segs[1] == (1, 10.0, 20.0)
    assert segs[2] == (2, 20.0, 27.0)

    # Short 8s video: 1 segment
    segs_short = plan_video_segments(8.0, max_segment_duration=10.0)
    assert len(segs_short) == 1
    assert segs_short[0] == (0, 0.0, 8.0)

def test_temporal_deduplication():
    box = BBox(x=0.2, y=0.2, width=0.3, height=0.3)
    d1 = DetectionItem(
        class_id="cls-1",
        class_name="jalan_berlubang",
        bbox=box,
        condition="aspal retak",
        feasibility="tidak_layak",
        timestamp_seconds=1.0,
        frame_index=1
    )
    # Same class and region at timestamp 2.0s (within 2s window)
    d2 = DetectionItem(
        class_id="cls-1",
        class_name="jalan_berlubang",
        bbox=box,
        condition="aspal retak",
        feasibility="tidak_layak",
        timestamp_seconds=2.0,
        frame_index=2
    )
    # Different region / different time
    d3 = DetectionItem(
        class_id="cls-1",
        class_name="jalan_berlubang",
        bbox=BBox(x=0.7, y=0.7, width=0.2, height=0.2),
        condition="aspal retak",
        feasibility="tidak_layak",
        timestamp_seconds=1.0,
        frame_index=1
    )

    deduped = deduplicate_temporal_detections([d1, d2, d3], time_window=2.0, iou_threshold=0.5)
    assert len(deduped) == 2

def test_mutually_exclusive_conflict_detection():
    active_classes = [
        ClassDef(
            id="c1",
            name="jalan_berlubang",
            visual_description="lubang",
            condition_criteria="rusak",
            feasibility_criteria="tidak layak",
            mutually_exclusive_with=["jalan_mulus"],
            conflict_iou_threshold=0.5
        ),
        ClassDef(
            id="c2",
            name="jalan_mulus",
            visual_description="mulus",
            condition_criteria="baik",
            feasibility_criteria="layak",
            mutually_exclusive_with=["jalan_berlubang"],
            conflict_iou_threshold=0.5
        )
    ]

    # Two overlapping detections with mutually exclusive classes
    box = BBox(x=0.2, y=0.2, width=0.3, height=0.3)
    d1 = DetectionItem(
        class_id="c1",
        class_name="jalan_berlubang",
        bbox=box,
        condition="rusak",
        feasibility="tidak_layak"
    )
    d2 = DetectionItem(
        class_id="c2",
        class_name="jalan_mulus",
        bbox=box,
        condition="mulus",
        feasibility="layak"
    )

    result = detect_class_conflicts([d1, d2], active_classes, default_iou_threshold=0.5)
    assert result[0].has_conflict is True
    assert result[1].has_conflict is True
    assert "mutually exclusive" in result[0].conflict_details["reason"]

def test_grid_to_pixel_coords_calculation():
    from services.visual_grid import grid_to_pixel_coords

    # Case 1: 1920x1080 image, box [ymin=200, xmin=150, ymax=600, xmax=750]
    box_2d = [200, 150, 600, 750]
    coords = grid_to_pixel_coords(box_2d, orig_width=1920, orig_height=1080)

    # Pixel X = (150 / 1000) * 1920 = 288.0
    # Pixel Y = (200 / 1000) * 1080 = 216.0
    # Pixel Width = ((750 - 150) / 1000) * 1920 = 1152.0
    # Pixel Height = ((600 - 200) / 1000) * 1080 = 432.0
    assert coords["pixel_x"] == pytest.approx(288.0)
    assert coords["pixel_y"] == pytest.approx(216.0)
    assert coords["pixel_width"] == pytest.approx(1152.0)
    assert coords["pixel_height"] == pytest.approx(432.0)
    assert coords["orig_width"] == 1920
    assert coords["orig_height"] == 1080

    # Case 2: 800x600 image with normalized 0.0-1.0 input
    box_normalized = [0.1, 0.2, 0.5, 0.8]
    coords_norm = grid_to_pixel_coords(box_normalized, orig_width=800, orig_height=600)
    assert coords_norm["pixel_x"] == pytest.approx(160.0) # 0.2 * 800
    assert coords_norm["pixel_y"] == pytest.approx(60.0)  # 0.1 * 600
    assert coords_norm["pixel_width"] == pytest.approx(480.0) # (0.8 - 0.2) * 800
    assert coords_norm["pixel_height"] == pytest.approx(240.0) # (0.5 - 0.1) * 600

def test_grid_to_normalized_bbox():
    from services.visual_grid import grid_to_normalized_bbox

    # 0-1000 scale
    box_2d = [100, 250, 400, 750]
    bbox = grid_to_normalized_bbox(box_2d)
    assert bbox.x == pytest.approx(0.25)
    assert bbox.y == pytest.approx(0.10)
    assert bbox.width == pytest.approx(0.50)
    assert bbox.height == pytest.approx(0.30)

    # Inverted min/max handling
    box_inverted = [500, 800, 200, 300]
    bbox_inv = grid_to_normalized_bbox(box_inverted)
    assert bbox_inv.x == pytest.approx(0.30)
    assert bbox_inv.y == pytest.approx(0.20)
    assert bbox_inv.width == pytest.approx(0.50)
    assert bbox_inv.height == pytest.approx(0.30)

def test_apply_visual_grid_overlay():
    import base64
    import io
    from PIL import Image
    from services.visual_grid import apply_visual_grid_overlay

    # Buat citra uji 640x480 warna solid
    img = Image.new("RGB", (640, 480), color=(100, 100, 100))
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG")
    orig_b64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    # Terapkan overlay grid
    overlaid_b64 = apply_visual_grid_overlay(orig_b64)
    assert isinstance(overlaid_b64, str)
    assert len(overlaid_b64) > 0

    # Decode kembali dan verifikasi dimensi citra tidak berubah
    decoded_bytes = base64.b64decode(overlaid_b64)
    result_img = Image.open(io.BytesIO(decoded_bytes))
    assert result_img.size == (640, 480)
    assert result_img.mode == "RGB"

