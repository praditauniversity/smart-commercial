import pytest

from services.playback import frame_indices_for_times, plan_playback_times
from services.playback_tracker import FrameDetection, iou, track_detections

BOX = (0.40, 0.40, 0.20, 0.20)


def det(cls, box, conf=0.9):
    return FrameDetection(cls, box, conf)


def shifted(box, dx):
    return (box[0] + dx, box[1], box[2], box[3])


def test_iou_identical_disjoint_and_half_overlap():
    assert iou(BOX, BOX) == pytest.approx(1.0)
    assert iou(BOX, (0.0, 0.0, 0.1, 0.1)) == 0.0
    assert iou((0, 0, 0.2, 0.2), (0.1, 0, 0.2, 0.2)) == pytest.approx(1 / 3)


def test_object_moving_slowly_is_one_track():
    frames = [(i * 0.2, [det('sign', shifted(BOX, 0.02 * i))]) for i in range(6)]
    tracks = track_detections(frames, iou_min=0.3, max_missed=1)
    assert len(tracks) == 1
    assert len(tracks[0].points) == 6
    assert [p[0] for p in tracks[0].points] == pytest.approx([0, 0.2, 0.4, 0.6, 0.8, 1.0])


def test_different_classes_never_merge():
    frames = [(0.0, [det('sign', BOX)]), (0.2, [det('banner', BOX)])]
    tracks = track_detections(frames, iou_min=0.3, max_missed=1)
    assert sorted(t.model_class for t in tracks) == ['banner', 'sign']


def test_two_objects_same_class_keep_separate_tracks():
    left, right = (0.05, 0.4, 0.2, 0.2), (0.70, 0.4, 0.2, 0.2)
    frames = [(i * 0.2, [det('sign', shifted(left, 0.01 * i)), det('sign', shifted(right, -0.01 * i))]) for i in range(4)]
    tracks = track_detections(frames, iou_min=0.3, max_missed=1)
    assert len(tracks) == 2
    assert all(len(t.points) == 4 for t in tracks)


def test_gap_within_max_missed_continues_and_longer_gap_splits():
    d = [det('sign', BOX)]
    bridged = track_detections([(0.0, d), (0.2, []), (0.4, d)], iou_min=0.3, max_missed=1)
    assert len(bridged) == 1 and len(bridged[0].points) == 2
    split = track_detections([(0.0, d), (0.2, []), (0.4, []), (0.6, d)], iou_min=0.3, max_missed=1)
    assert len(split) == 2


def test_jump_below_iou_starts_new_track():
    tracks = track_detections([(0.0, [det('sign', BOX)]), (0.2, [det('sign', shifted(BOX, 0.5))])], iou_min=0.3, max_missed=1)
    assert len(tracks) == 2


def test_tracker_rejects_bad_parameters():
    with pytest.raises(ValueError):
        track_detections([], iou_min=0.0, max_missed=1)
    with pytest.raises(ValueError):
        track_detections([], iou_min=0.3, max_missed=-1)


def test_playback_times_include_sample_timestamps_once():
    times = plan_playback_times(2.0, 2.0, [0.75, 1.0, 5.0])
    assert times == [0.0, 0.5, 0.75, 1.0, 1.5, 2.0]  # 1.0 sudah ada di grid; 5.0 di luar durasi dibuang


def test_frame_indices_dedupe_and_real_times():
    pairs = frame_indices_for_times([0.0, 0.01, 0.5, 100.0], video_fps=30, frame_count=60)
    assert pairs[0] == (0, 0.0)
    assert (15, 0.5) in pairs
    assert pairs[-1][0] == 59  # waktu di luar durasi dijepit ke frame terakhir
    assert len({i for i, _ in pairs}) == len(pairs)
