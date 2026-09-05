import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from petid.prepare import files_for_breed
from petid.train import metrics_from_confusion


def test_perfect_confusion_matrix_scores_one():
    m = np.diag([10, 10, 10, 10])
    scores = metrics_from_confusion(m)
    assert scores["accuracy"] == 1.0
    assert scores["precision"] == 1.0
    assert scores["recall"] == 1.0
    assert scores["f1Score"] == 1.0


def test_known_confusion_matrix_scores_match_hand_calculation():
    # class 0: 8 right, 2 predicted as class 1. class 1: all 10 right.
    m = np.array([[8, 2], [0, 10]])
    scores = metrics_from_confusion(m)
    assert scores["accuracy"] == 18 / 20
    # precision per class: 8/8, 10/12 -> macro mean
    assert abs(scores["precision"] - (1.0 + 10 / 12) / 2) < 1e-9
    # recall per class: 8/10, 10/10
    assert abs(scores["recall"] - (0.8 + 1.0) / 2) < 1e-9


def test_a_class_never_predicted_does_not_divide_by_zero():
    # Nothing was ever predicted as class 1; its precision is 0, not NaN.
    m = np.array([[10, 0], [10, 0]])
    scores = metrics_from_confusion(m)
    assert scores["precision"] == (10 / 20 + 0.0) / 2
    assert not any(np.isnan(v) for v in
                   [scores["accuracy"], scores["precision"], scores["recall"], scores["f1Score"]])


def test_confusion_matrix_is_serialisable():
    scores = metrics_from_confusion(np.diag([1, 1]))
    assert scores["confusionMatrix"] == [[1, 0], [0, 1]]


def test_files_for_breed_matches_only_the_exact_breed(tmp_path):
    for name in ["beagle_1.jpg", "beagle_23.jpg", "beagle_extra_1.jpg",
                 "Bengal_1.jpg", "beagle_notes.jpg"]:
        (tmp_path / name).write_bytes(b"x")
    found = [p.name for p in files_for_breed(tmp_path, "beagle")]
    assert found == ["beagle_1.jpg", "beagle_23.jpg"]
