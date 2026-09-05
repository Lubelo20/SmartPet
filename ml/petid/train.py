"""Train the pet classifier and write every artefact the registry needs.

Usage: python -m petid.train <data_dir> <artifacts_dir> <version>

MobileNetV2 transfer learning, exactly as the AI design spec §8 lays out:
frozen ImageNet base, new head, then a short fine-tune of the last few base
layers at a much lower learning rate. alpha=0.35 keeps the exported model
small enough to ship to a browser (~a few MB), which is the deployment
target while the project has no billing and therefore no Cloud Run.

Metrics are computed from the held-out test split with plain numpy — the
confusion matrix IS the product here, and a metrics library would only hide
what it does.
"""

import json
import sys
import time
from pathlib import Path

import numpy as np
import tensorflow as tf

from .config import (
    BATCH_SIZE, FINE_TUNE_EPOCHS, FINE_TUNE_LAYERS, FINE_TUNE_LR, HEAD_EPOCHS,
    IMAGE_SIZE, LEARNING_RATE, OTHER_CLASS, PET_CLASSES, SEED, class_labels,
)


def load_split(data_dir: Path, name: str, shuffle: bool) -> tf.data.Dataset:
    return tf.keras.utils.image_dataset_from_directory(
        data_dir / name,
        labels="inferred",
        label_mode="int",
        class_names=class_labels(),  # fixed order: labels.json depends on it
        image_size=(IMAGE_SIZE, IMAGE_SIZE),
        batch_size=BATCH_SIZE,
        shuffle=shuffle,
        seed=SEED,
    )


def build_model(n_classes: int) -> tf.keras.Model:
    base = tf.keras.applications.MobileNetV2(
        input_shape=(IMAGE_SIZE, IMAGE_SIZE, 3),
        include_top=False, weights="imagenet", alpha=0.35,
    )
    base.trainable = False

    inputs = tf.keras.Input(shape=(IMAGE_SIZE, IMAGE_SIZE, 3))
    x = tf.keras.layers.RandomFlip("horizontal")(inputs)
    x = tf.keras.layers.RandomRotation(15 / 360)(x)
    x = tf.keras.layers.RandomZoom(0.1)(x)
    x = tf.keras.layers.RandomBrightness(0.15)(x)
    # The model owns its preprocessing so a caller feeds plain 0..255 RGB.
    x = tf.keras.applications.mobilenet_v2.preprocess_input(x)
    x = base(x, training=False)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    x = tf.keras.layers.Dropout(0.2)(x)
    outputs = tf.keras.layers.Dense(n_classes, activation="softmax")(x)
    return tf.keras.Model(inputs, outputs)


def confusion(model: tf.keras.Model, ds: tf.data.Dataset, n: int) -> np.ndarray:
    m = np.zeros((n, n), dtype=int)
    for batch, labels in ds:
        preds = np.argmax(model.predict(batch, verbose=0), axis=1)
        for t, p in zip(labels.numpy(), preds):
            m[t][p] += 1
    return m


def metrics_from_confusion(m: np.ndarray) -> dict:
    tp = np.diag(m).astype(float)
    precision = np.divide(tp, m.sum(axis=0), out=np.zeros_like(tp), where=m.sum(axis=0) > 0)
    recall = np.divide(tp, m.sum(axis=1), out=np.zeros_like(tp), where=m.sum(axis=1) > 0)
    f1 = np.divide(2 * precision * recall, precision + recall,
                   out=np.zeros_like(tp), where=(precision + recall) > 0)
    return {
        "accuracy": float(tp.sum() / m.sum()),
        "precision": float(precision.mean()),
        "recall": float(recall.mean()),
        "f1Score": float(f1.mean()),
        "confusionMatrix": m.tolist(),
    }


def main(data_dir: str, artifacts_dir: str, version: str) -> None:
    data, artifacts = Path(data_dir), Path(artifacts_dir)
    artifacts.mkdir(parents=True, exist_ok=True)
    labels = class_labels()
    started = time.time()

    train_ds = load_split(data, "train", shuffle=True).prefetch(tf.data.AUTOTUNE)
    val_ds = load_split(data, "val", shuffle=False).prefetch(tf.data.AUTOTUNE)
    test_ds = load_split(data, "test", shuffle=False).prefetch(tf.data.AUTOTUNE)

    model = build_model(len(labels))
    model.compile(optimizer=tf.keras.optimizers.Adam(LEARNING_RATE),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    head = model.fit(train_ds, validation_data=val_ds, epochs=HEAD_EPOCHS)

    # Fine-tune the tail of the base network at a much lower learning rate.
    base = next(l for l in model.layers if l.name.startswith("mobilenetv2"))
    base.trainable = True
    for layer in base.layers[:-FINE_TUNE_LAYERS]:
        layer.trainable = False
    model.compile(optimizer=tf.keras.optimizers.Adam(FINE_TUNE_LR),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    fine = model.fit(train_ds, validation_data=val_ds, epochs=FINE_TUNE_EPOCHS)

    cm = confusion(model, test_ds, len(labels))
    metrics = metrics_from_confusion(cm)
    print("test metrics:", json.dumps({k: v for k, v in metrics.items() if k != "confusionMatrix"}, indent=2))
    print("confusion (rows=truth, cols=predicted):")
    for label, row in zip(labels, cm.tolist()):
        print(f"  {label:8s} {row}")

    # ---- artefacts, per spec §9 ----
    model.save(artifacts / "pet_model.keras")

    converter = tf.lite.TFLiteConverter.from_keras_model(model)
    converter.optimizations = [tf.lite.Optimize.DEFAULT]
    (artifacts / "pet_model.tflite").write_bytes(converter.convert())

    label_rows = {}
    for i, key in enumerate(labels):
        if key == OTHER_CLASS:
            label_rows[str(i)] = {"petId": None, "petName": "Unknown", "species": None}
        else:
            pet = PET_CLASSES[key]
            label_rows[str(i)] = {"petId": key, "petName": pet["name"], "species": pet["species"]}
    (artifacts / "labels.json").write_text(json.dumps(label_rows, indent=2))

    counts = {s: sum(1 for _ in (data / s).rglob("*.jpg")) for s in ("train", "val", "test")}
    metadata = {
        "version": version,
        "architecture": "MobileNetV2 alpha=0.35, 224x224, transfer learning",
        "numberOfPets": len(PET_CLASSES),
        "numberOfImages": sum(counts.values()),
        "splitCounts": counts,
        "classOrder": labels,
        "datasetNotes": {
            "source": "Oxford-IIIT Pet dataset (bootstrap; user uploads arrive with sub-project B)",
            "standIns": {k: v["note"] for k, v in PET_CLASSES.items() if "note" in v},
        },
        "headHistory": {k: [float(x) for x in v] for k, v in head.history.items()},
        "fineTuneHistory": {k: [float(x) for x in v] for k, v in fine.history.items()},
        "trainSeconds": round(time.time() - started, 1),
        **metrics,
    }
    (artifacts / "metadata.json").write_text(json.dumps(metadata, indent=2))
    print(f"artefacts written to {artifacts}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
