import base64
import os

import cv2
import numpy as np
import pytest

from providers.yolo import to_detection_items
from schemas import ClassDef
from services.frame_sampler import MAX_FRAMES, plan_frame_timestamps
from services.yolo_engine import CATEGORY_MODELS, RawDetection, YoloEngine


def test_frame_plan_short_clip_follows_half_fps():
    ts = plan_frame_timestamps(10.0)  # 10 s * 0,5 fps = 5 frame
    assert len(ts) == 5
    assert ts == [1.0, 3.0, 5.0, 7.0, 9.0]


def test_frame_plan_caps_at_24_and_spreads_evenly_over_whole_clip():
    ts = plan_frame_timestamps(60.82)  # klip 60 dtk -> 24 frame, bukan 24 frame pertama
    assert len(ts) == MAX_FRAMES == 24
    assert ts[0] < 2.6
    assert ts[-1] > 60.82 - 2.6  # ujung klip tercakup
    assert ts == sorted(ts)
    steps = [b - a for a, b in zip(ts, ts[1:])]
    assert max(steps) - min(steps) < 0.01  # jarak seragam (toleransi pembulatan 3 desimal)


def test_frame_plan_long_video_still_24():
    assert len(plan_frame_timestamps(20 * 60)) == 24


def test_frame_plan_degenerate_inputs():
    assert plan_frame_timestamps(0) == [0.0]
    assert plan_frame_timestamps(-5) == [0.0]
    assert len(plan_frame_timestamps(0.5)) == 1


def _cls(name, cid, model_class=None):
    return ClassDef(id=cid, name=name, visual_description="v", condition_criteria="c", feasibility_criteria="f", model_class=model_class)


def test_mapping_uses_model_class_and_drops_inactive():
    classes = [_cls("pavedroad_pothole", "c-pothole"), _cls("rambu", "c-sign", model_class="sign")]
    raw = [
        RawDetection("pavedroad_pothole", "pavedroad", 0.9, 0.1, 0.2, 0.3, 0.4),
        RawDetection("sign", "sign", 0.5, 0.0, 0.0, 0.1, 0.1),
        RawDetection("banner", "banner", 0.8, 0.5, 0.5, 0.1, 0.1),  # kelas tidak aktif -> dibuang
    ]
    items = to_detection_items(raw, classes, timestamp_seconds=4.5, frame_index=2)
    assert [i.class_id for i in items] == ["c-pothole", "c-sign"]
    assert items[0].confidence == pytest.approx(0.9)
    assert items[0].timestamp_seconds == 4.5 and items[0].frame_index == 2
    assert items[0].feasibility == "tidak_dinilai"  # tidak dipalsukan sebagai layak/tidak layak
    assert items[0].bbox.width == pytest.approx(0.3)


def test_engine_status_reports_missing_weights(tmp_path, monkeypatch):
    (tmp_path / "sign-best.pt").write_bytes(b"x")
    monkeypatch.setenv("YOLO_WEIGHTS_DIR", str(tmp_path))
    st = YoloEngine().status()
    assert st["present"] == ["sign"]
    assert set(st["missing"]) == set(CATEGORY_MODELS) - {"sign"}
    assert st["ok"] is False


def test_engine_requires_env(monkeypatch):
    monkeypatch.delenv("YOLO_WEIGHTS_DIR", raising=False)
    with pytest.raises(RuntimeError, match="YOLO_WEIGHTS_DIR"):
        YoloEngine().status()


WEIGHTS = os.environ.get("YOLO_WEIGHTS_DIR")
SAMPLES = os.environ.get("YOLO_SAMPLE_DIR")  # folder berisi <kategori>/<kategori>.jpg


def _weights_ready():
    if not WEIGHTS:
        return False
    try:
        from ultralytics import YOLO  # noqa: F401
    except ImportError:
        return False
    d = WEIGHTS if os.path.isabs(WEIGHTS) else os.path.join(os.path.dirname(os.path.abspath(__file__)), WEIGHTS)
    return all(os.path.isfile(os.path.join(d, f"{c}-best.pt")) for c in CATEGORY_MODELS)


@pytest.mark.skipif(not _weights_ready(), reason="bobot YOLO / ultralytics tidak tersedia")
def test_real_engine_runs_all_six_models_on_blank_image(monkeypatch):
    monkeypatch.setenv("YOLO_CONF", "0.25")
    monkeypatch.setenv("YOLO_DEVICE", "cpu")
    eng = YoloEngine()
    dets, timings = eng.detect(np.full((480, 640, 3), 127, dtype=np.uint8))
    assert set(timings.per_model_ms) == set(CATEGORY_MODELS)
    assert all(0.0 <= d.x <= 1.0 and 0.0 <= d.width <= 1.0 for d in dets)


EXPECTED = {
    "pavedroad": "pavedroad_pothole",
    "weeds": "weeds",
    "sign": "sign",
    "banner": "banner",
    "house_notice": "house_notice",
}


@pytest.mark.skipif(not (_weights_ready() and SAMPLES), reason="bobot atau YOLO_SAMPLE_DIR tidak tersedia")
@pytest.mark.parametrize("category,expected", EXPECTED.items())
def test_real_engine_detects_expected_class_on_sample(category, expected, monkeypatch):
    monkeypatch.setenv("YOLO_CONF", "0.25")
    monkeypatch.setenv("YOLO_DEVICE", "cpu")
    img = cv2.imread(os.path.join(SAMPLES, category, f"{category}.jpg"))
    assert img is not None
    dets, _ = YoloEngine().detect(img)
    assert expected in {d.model_class for d in dets}
