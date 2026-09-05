"""The one place the dataset↔pet mapping and training constants live.

The demo pets come from the dashboard's seed data (lib/seed-data.ts) and the
images from the Oxford-IIIT Pet dataset. Two of the three map cleanly; Max is
a Labrador Retriever and Oxford-IIIT has none, so a German Shorthaired
Pointer stands in as his visual identity. That approximation is recorded in
the exported metadata rather than hidden — anyone auditing why the model
recognises "Max" deserves the real answer.

OTHER_CLASS is a trained negative class of unrelated breeds. Softmax over
only the registered pets must pick one of them for ANY animal, so
unknown-rejection by confidence alone is weak; a class whose job is
"none of the registered pets" makes the rejection genuine.
"""

IMAGE_SIZE = 224
SEED = 20260905

# classIndex order is alphabetical by key for determinism.
PET_CLASSES = {
    "PET001": {"name": "Max", "species": "Dog", "oxfordClass": "german_shorthaired",
               "note": "visual stand-in: dataset has no Labrador Retriever"},
    "PET002": {"name": "Bella", "species": "Dog", "oxfordClass": "beagle"},
    "PET003": {"name": "Simba", "species": "Cat", "oxfordClass": "British_Shorthair"},
}

OTHER_CLASS = "OTHER"
OTHER_OXFORD_CLASSES = ["pug", "samoyed", "Bengal", "boxer", "Abyssinian", "pomeranian"]
OTHER_PER_BREED = 25

MAX_IMAGES_PER_CLASS = 160
SPLIT = (0.70, 0.15, 0.15)  # train / val / test

BATCH_SIZE = 32
HEAD_EPOCHS = 6
FINE_TUNE_EPOCHS = 4
FINE_TUNE_LAYERS = 30
LEARNING_RATE = 1e-3
FINE_TUNE_LR = 1e-5


def class_labels() -> list[str]:
    """Model output order: registered pet ids sorted, then OTHER last."""
    return sorted(PET_CLASSES.keys()) + [OTHER_CLASS]
