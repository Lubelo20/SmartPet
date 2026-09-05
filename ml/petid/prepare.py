"""Build data/{train,val,test}/{class}/ from the extracted Oxford-IIIT images.

Usage: python -m petid.prepare <images_dir> <out_dir>

Validation opens every candidate with PIL and drops the corrupt ones (the
Oxford set famously contains a handful of broken JPEGs and a few files that
are really PNGs or GIFs with a .jpg name). Dropped files are listed, not
silently skipped — the spec's step 5 says remove OR FLAG, and a training run
whose input quietly shrank is how dataset bugs hide.
"""

import shutil
import sys
from pathlib import Path

from PIL import Image

from .config import (
    MAX_IMAGES_PER_CLASS, OTHER_CLASS, OTHER_OXFORD_CLASSES, OTHER_PER_BREED,
    PET_CLASSES, SEED, SPLIT,
)
from .dataset import split_files


def valid_image(path: Path) -> bool:
    try:
        with Image.open(path) as im:
            im.verify()
        # verify() closes the file; reopen to force a real decode of the data.
        with Image.open(path) as im:
            im.convert("RGB")
        return True
    except Exception:
        return False


def files_for_breed(images_dir: Path, breed: str) -> list:
    # Oxford names files like beagle_1.jpg / British_Shorthair_10.jpg. The
    # underscore before the number matters: "beagle_" must not match
    # "beagle_something_else" (it does not exist in this set, but cheap safety).
    out = []
    for p in sorted(images_dir.glob(f"{breed}_*.jpg")):
        stem_rest = p.stem[len(breed) + 1:]
        if stem_rest.isdigit():
            out.append(p)
    return out


def build_manifest(images_dir: Path) -> dict:
    """classKey -> list of valid image paths, capped per config."""
    dropped = []
    manifest = {}

    for pet_id in sorted(PET_CLASSES.keys()):
        breed = PET_CLASSES[pet_id]["oxfordClass"]
        candidates = files_for_breed(images_dir, breed)
        good = []
        for p in candidates:
            if len(good) >= MAX_IMAGES_PER_CLASS:
                break
            (good if valid_image(p) else dropped).append(p)
        manifest[pet_id] = good

    other = []
    for breed in OTHER_OXFORD_CLASSES:
        taken = 0
        for p in files_for_breed(images_dir, breed):
            if taken >= OTHER_PER_BREED:
                break
            if valid_image(p):
                other.append(p)
                taken += 1
            else:
                dropped.append(p)
    manifest[OTHER_CLASS] = other

    if dropped:
        print(f"flagged {len(dropped)} invalid file(s):")
        for p in dropped:
            print(f"  {p.name}")
    return manifest


def main(images_dir: str, out_dir: str) -> None:
    images, out = Path(images_dir), Path(out_dir)
    manifest = build_manifest(images)

    for class_key, files in manifest.items():
        if len(files) < 30:
            raise SystemExit(
                f"class {class_key} has only {len(files)} usable images — refusing to "
                "train a class that thin; it would produce confident nonsense.")
        splits = split_files([str(p) for p in files], SPLIT, SEED)
        for split_name, split_paths in splits.items():
            dest = out / split_name / class_key
            dest.mkdir(parents=True, exist_ok=True)
            for src in split_paths:
                shutil.copy2(src, dest / Path(src).name)
        print(f"{class_key}: {len(splits['train'])} train / {len(splits['val'])} val / {len(splits['test'])} test")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
