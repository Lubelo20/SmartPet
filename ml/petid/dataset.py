"""Deterministic dataset splitting, kept pure so it is testable without images.

Oxford-IIIT photos are independent shots, not bursts, so a per-class random
split is sound here. User-uploaded photos (sub-project B) arrive in bursts of
near-duplicates and will need grouped splitting — that requirement lives in
the AI design spec §8 and deliberately does NOT exist yet (nothing would test
it honestly against this dataset).
"""

import random


def split_files(files, split, seed):
    """Partition ``files`` into train/val/test.

    Deterministic for a seed, loses nothing, overlaps nothing, and guarantees
    val and test each get at least one file — a class whose metrics silently
    measure nothing is worse than a smaller training set.
    """
    train_frac, val_frac, _ = split
    shuffled = list(files)
    random.Random(seed).shuffle(shuffled)

    n = len(shuffled)
    n_train = int(n * train_frac)
    n_val = max(1, int(n * val_frac)) if n >= 3 else 0
    # Keep at least one for test by shrinking train, never val.
    if n - n_train - n_val < 1 and n >= 3:
        n_train = n - n_val - 1

    return {
        "train": shuffled[:n_train],
        "val": shuffled[n_train:n_train + n_val],
        "test": shuffled[n_train + n_val:],
    }
