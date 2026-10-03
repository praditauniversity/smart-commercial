import os

# Harus diset sebelum `main` diimpor (main membaca konfigurasi saat impor).
os.environ.setdefault("INTERNAL_API_SECRET", "test-secret")
os.environ.setdefault("AI_SERVICE_ALLOWED_ORIGINS", "http://localhost:3000")

import base64
import cv2
import numpy as np
import pytest

from providers.yolo import to_detection_items, wants_condition_stage
from schemas import ClassDef
from services.sign_condition import (
    STAGE2_MODEL_ID,
    STAGE2_MODEL_LABEL,
    SignConditionClassifier,
    adaptive_crop_box,
    classify_signs,
)
from services.yolo_engine import RawDetection


# ---------------------------------------------------------------- adaptive_crop_box (angka dihitung manual)
def test_crop_without_neighbors_uses_base_margin_028():
    # w=100, h=200 -> margin x=28, y=56
    assert adaptive_crop_box((100, 100, 200, 300), [], 1000, 800) == (72, 44, 228, 356)


def test_crop_adjacent_neighbor_drops_to_min_margin_005():
    # jarak 0 -> margin 0,05: x=5, y=10
    assert adaptive_crop_box((100, 100, 200, 300), [(200, 100, 300, 300)], 1000, 800) == (95, 90, 205, 310)


def test_crop_far_neighbor_keeps_base_margin():
    # ambang = 0,5 * max(w,h) = 100; jarak 200 >= ambang -> margin dasar
    assert adaptive_crop_box((100, 100, 200, 300), [(400, 100, 500, 300)], 1000, 800) == (72, 44, 228, 356)


def test_crop_mid_distance_interpolates_margin():
    # jarak 40 -> margin = 0,05 + 0,23 * (40/100) = 0,142 -> mx=14,2 my=28,4
    assert adaptive_crop_box((100, 100, 200, 300), [(240, 100, 340, 300)], 1000, 800) == (86, 72, 214, 328)


def test_crop_uses_the_closest_neighbor_when_several():
    near = (205, 100, 300, 300)  # jarak 5
    far = (500, 100, 600, 300)
    assert adaptive_crop_box((100, 100, 200, 300), [far, near], 1000, 800) == adaptive_crop_box((100, 100, 200, 300), [near], 1000, 800)


def test_crop_is_clipped_to_image_bounds():
    x1, y1, x2, y2 = adaptive_crop_box((10, 10, 60, 60), [], 100, 100)
    assert (x1, y1) == (0, 0)
    assert x2 <= 100 and y2 <= 100
    assert adaptive_crop_box((900, 700, 995, 795), [], 1000, 800)[2:] == (1000, 800)


# ---------------------------------------------------------------- classify_signs dengan classifier palsu
class FakeClassifier(SignConditionClassifier):
    def __init__(self, labels):
        super().__init__()
        self.labels = list(labels)
        self.crops = []

    def classify_crop(self, crop_bgr):
        self.crops.append(crop_bgr.shape[:2])
        return self.labels[len(self.crops) - 1]


def _raw(model_class, xyxy):
    x1, y1, x2, y2 = xyxy
    return RawDetection(model_class, model_class, 0.9, 0, 0, 0, 0, xyxy=(x1, y1, x2, y2))


def test_classify_signs_only_signs_and_other_boxes_are_other_signs():
    img = np.zeros((800, 1000, 3), dtype=np.uint8)
    dets = [
        _raw("weeds", (110, 110, 190, 290)),  # BUKAN rambu: tidak boleh memengaruhi margin rambu
        _raw("sign", (100, 100, 200, 300)),
        _raw("pavedroad_pothole", (200, 100, 300, 300)),  # tetangga berdekatan tetapi bukan rambu
    ]
    clf = FakeClassifier(["damaged"])
    out = classify_signs(img, dets, clf)
    assert out == {1: "damaged"}  # kunci = indeks pada daftar deteksi asli
    assert clf.crops == [(312, 156)]  # margin dasar 0,28 (tinggi 356-44, lebar 228-72), tidak dikurangi


def test_classify_signs_neighbor_sign_reduces_margin_for_both_crops():
    img = np.zeros((800, 1000, 3), dtype=np.uint8)
    dets = [_raw("sign", (100, 100, 200, 300)), _raw("sign", (200, 100, 300, 300))]
    clf = FakeClassifier(["normal", "damaged"])
    out = classify_signs(img, dets, clf)
    assert out == {0: "normal", 1: "damaged"}
    assert clf.crops == [(220, 110), (220, 110)]  # margin 0,05 pada keduanya (jarak 0)


def test_classify_signs_skips_empty_crops_without_crashing():
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    dets = [_raw("sign", (150, 150, 180, 180))]  # di luar gambar
    assert classify_signs(img, dets, FakeClassifier(["damaged"])) == {}


# ---------------------------------------------------------------- pemetaan ke DetectionItem
def _cls(name, cid, stage=False):
    return ClassDef(id=cid, name=name, visual_description="v", condition_criteria="c", feasibility_criteria="f", has_condition_stage=stage)


def test_condition_attached_only_for_classes_requesting_stage2():
    raw = [_raw("sign", (0, 0, 10, 10)), _raw("weeds", (0, 0, 10, 10))]
    items = to_detection_items(raw, [_cls("sign", "c-sign", True), _cls("weeds", "c-weeds")], 1.0, 0, conditions={0: "damaged", 1: "damaged"})
    by = {i.class_name: i for i in items}
    assert by["sign"].condition_state == "damaged"
    assert by["sign"].condition_model == STAGE2_MODEL_ID
    assert STAGE2_MODEL_LABEL in by["sign"].condition
    assert by["weeds"].condition_state is None and by["weeds"].condition_model is None


def test_no_condition_when_stage2_not_run():
    items = to_detection_items([_raw("sign", (0, 0, 10, 10))], [_cls("sign", "c-sign", True)], 0.0, 0, conditions=None)
    assert items[0].condition_state is None


def test_wants_condition_stage_requires_env_and_flagged_sign_class(monkeypatch):
    classes = [_cls("sign", "c-sign", True)]
    monkeypatch.delenv("SIGN_CONDITION_WEIGHTS", raising=False)
    assert wants_condition_stage(classes) is False
    monkeypatch.setenv("SIGN_CONDITION_WEIGHTS", "x.pt")
    assert wants_condition_stage(classes) is True
    assert wants_condition_stage([_cls("sign", "c-sign", False)]) is False
    assert wants_condition_stage([_cls("weeds", "c-w", True)]) is False


def test_loading_fails_loudly_when_weights_missing(monkeypatch, tmp_path):
    monkeypatch.setenv("YOLO_WEIGHTS_DIR", str(tmp_path))
    monkeypatch.setenv("SIGN_CONDITION_WEIGHTS", "tidak_ada.pt")
    with pytest.raises(RuntimeError, match="tidak ditemukan"):
        SignConditionClassifier().load()


def test_disabled_when_env_unset(monkeypatch):
    monkeypatch.delenv("SIGN_CONDITION_WEIGHTS", raising=False)
    c = SignConditionClassifier()
    assert c.enabled is False
    with pytest.raises(RuntimeError, match="tidak aktif"):
        c.load()


# ---------------------------------------------------------------- model asli (dilewati bila bobot/ultralytics tidak ada)
WEIGHTS = os.environ.get("YOLO_WEIGHTS_DIR")
SAMPLES = os.environ.get("YOLO_SAMPLE_DIR")


def _base():
    return WEIGHTS if WEIGHTS and os.path.isabs(WEIGHTS) else os.path.join(os.path.dirname(os.path.abspath(__file__)), WEIGHTS or "")


def _real_ready():
    try:
        import ultralytics  # noqa: F401
    except ImportError:
        return False
    return bool(WEIGHTS and SAMPLES) and os.path.isfile(os.path.join(_base(), "sign_stage2_fold0_best.pt")) and os.path.isfile(os.path.join(_base(), "sign-best.pt"))


real = pytest.mark.skipif(not _real_ready(), reason="bobot Tahap 2, bobot sign, atau YOLO_SAMPLE_DIR tidak tersedia")


@real
def test_real_classifier_structure_and_label_by_name(monkeypatch):
    monkeypatch.setenv("SIGN_CONDITION_WEIGHTS", "sign_stage2_fold0_best.pt")
    monkeypatch.setenv("YOLO_DEVICE", "cpu")
    c = SignConditionClassifier()
    c.load()
    assert set(c._model.names.values()) == {"damaged", "normal"}
    img = cv2.imread(os.path.join(SAMPLES, "sign", "sign.jpg"))
    assert c.classify_crop(img[100:900, 50:700]) in {"damaged", "normal"}


@real
def test_real_classifier_rejects_a_detection_model(monkeypatch):
    monkeypatch.setenv("SIGN_CONDITION_WEIGHTS", "sign-best.pt")  # model deteksi, bukan classifier
    with pytest.raises(RuntimeError, match="tidak sesuai"):
        SignConditionClassifier().load()


@real
def test_real_roundtrip_matches_notebook_file_path(monkeypatch):
    """Jalur encode/decode JPEG di memori harus identik dengan jalur notebook (tulis crop ke file JPEG lalu prediksi path)."""
    from ultralytics import YOLO

    monkeypatch.setenv("SIGN_CONDITION_WEIGHTS", "sign_stage2_fold0_best.pt")
    monkeypatch.setenv("YOLO_DEVICE", "cpu")
    c = SignConditionClassifier()
    c.load()
    img = cv2.imread(os.path.join(SAMPLES, "sign", "sign.jpg"))
    crop = img[50:950, 40:720]
    tmp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_tmp_crop_test.jpg")
    try:
        cv2.imwrite(tmp, crop)
        ref = YOLO(os.path.join(_base(), "sign_stage2_fold0_best.pt")).predict(tmp, imgsz=224, verbose=False)[0]
        ref_label = ref.names[int(ref.probs.top1)]
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    assert c.classify_crop(crop) == ref_label


@real
def test_real_endpoint_runs_stage2_on_sample_sign(monkeypatch):
    from fastapi.testclient import TestClient
    import main

    monkeypatch.setenv("YOLO_CONF", "0.25")
    monkeypatch.setenv("YOLO_DEVICE", "cpu")
    sample = os.path.join(SAMPLES, "sign", "sign.jpg")
    body = {
        "session_id": "s", "media_asset_id": "m", "conflict_threshold": 0.5,
        "frames": [{"frame_index": 0, "timestamp_seconds": 0.0, "url": sample}],
        "active_classes": [
            {"id": "c-sign", "name": "sign", "visual_description": "v", "condition_criteria": "c", "feasibility_criteria": "f", "has_condition_stage": True},
            {"id": "c-weeds", "name": "weeds", "visual_description": "v", "condition_criteria": "c", "feasibility_criteria": "f"},
        ],
    }
    client = TestClient(main.app)
    headers = {"X-Internal-Secret": os.environ["INTERNAL_API_SECRET"]}

    monkeypatch.setenv("SIGN_CONDITION_WEIGHTS", "sign_stage2_fold0_best.pt")
    r = client.post("/api/v1/yolo/detect", json=body, headers=headers).json()
    assert r["success"], r
    signs = [d for d in r["detections"] if d["class_name"] == "sign"]
    assert signs and all(d["condition_state"] in {"damaged", "normal"} for d in signs)
    assert all(d["condition_model"] == STAGE2_MODEL_ID for d in signs)
    assert r["metrics"]["stage2_crops"] == len(signs) and r["metrics"]["stage2_model"] == STAGE2_MODEL_ID
    assert r["metrics"]["stage2_ms"] > 0

    monkeypatch.delenv("SIGN_CONDITION_WEIGHTS")
    r2 = client.post("/api/v1/yolo/detect", json=body, headers=headers).json()
    assert r2["success"]
    assert all(d["condition_state"] is None for d in r2["detections"])  # Tahap 2 nonaktif -> "belum diklasifikasi"
    assert r2["metrics"]["stage2_crops"] == 0 and r2["metrics"]["stage2_model"] is None
