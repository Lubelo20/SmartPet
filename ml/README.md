# ml/ — pet identification training

The training pipeline from the AI design spec
(`docs/superpowers/specs/2026-09-04-ai-pet-identification-design.md`), running
locally instead of Colab while the project has no billing. The logic lives in
`petid/` as plain modules with pytest coverage for everything pure; a Colab
notebook, when one exists, should stay a thin wrapper around them.

```bash
# Do NOT `pip install -r requirements.txt` blindly — read the install-order
# comment at the top of that file; the tensorflowjs resolver loops otherwise.
python3 -m venv .venv
.venv/bin/python -m pytest tests/            # pure logic
.venv/bin/python -m petid.prepare <oxford images dir> data
.venv/bin/python -m petid.train data artifacts v1.0
```

Artefacts land in `artifacts/` (git-ignored): `pet_model.keras` (the
retraining artefact — regenerate it rather than committing it),
`pet_model.tflite`, `labels.json`, `metadata.json`. The browser-served copy
of the deployable files is committed under `public/models/<version>/`.

The bootstrap dataset is Oxford-IIIT Pet (academic use). Max has no Labrador
in that set; a German Shorthaired Pointer stands in, and `metadata.json`
records the substitution. The OTHER class is a trained negative — softmax
over only the registered pets must pick one of them for any animal, so
unknown-rejection needs a class whose job is "none of them".
