import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from petid.config import OTHER_CLASS, PET_CLASSES, class_labels
from petid.dataset import split_files


def _files(n: int) -> list[str]:
    return [f"img_{i:03d}.jpg" for i in range(n)]


def test_split_is_deterministic_for_a_seed():
    a = split_files(_files(100), (0.70, 0.15, 0.15), seed=42)
    b = split_files(_files(100), (0.70, 0.15, 0.15), seed=42)
    assert a == b


def test_split_changes_with_the_seed():
    a = split_files(_files(100), (0.70, 0.15, 0.15), seed=1)
    b = split_files(_files(100), (0.70, 0.15, 0.15), seed=2)
    assert a != b


def test_split_partitions_without_loss_or_overlap():
    files = _files(103)  # deliberately not divisible
    s = split_files(files, (0.70, 0.15, 0.15), seed=7)
    combined = s["train"] + s["val"] + s["test"]
    assert sorted(combined) == sorted(files)
    assert len(set(s["train"]) & set(s["val"])) == 0
    assert len(set(s["train"]) & set(s["test"])) == 0
    assert len(set(s["val"]) & set(s["test"])) == 0


def test_split_proportions_are_respected():
    s = split_files(_files(200), (0.70, 0.15, 0.15), seed=3)
    assert len(s["train"]) == 140
    assert len(s["val"]) == 30
    # remainder goes to test so nothing is dropped
    assert len(s["test"]) == 30


def test_every_split_is_nonempty_even_for_small_classes():
    # A class with few images must still land something in val and test, or
    # the metrics silently stop measuring that class at all.
    s = split_files(_files(10), (0.70, 0.15, 0.15), seed=5)
    assert len(s["val"]) >= 1
    assert len(s["test"]) >= 1


def test_class_labels_put_pets_first_sorted_and_other_last():
    labels = class_labels()
    assert labels[-1] == OTHER_CLASS
    assert labels[:-1] == sorted(PET_CLASSES.keys())
    assert len(labels) == len(PET_CLASSES) + 1
