#!/bin/bash
# Publish a trained model's registry entries to Firestore.
#
# Writes models/{version} and system/ai from the artefacts' metadata.json —
# the "training job writes the registry" role from the AI design spec. Uses
# the operator's own gcloud credentials, which bypass security rules exactly
# as the Admin SDK would; clients remain unable to write these documents
# (`allow write: if false`), which is the security point of the registry.
#
# Usage: scripts/publish-model-registry.sh <artifactsDir> <version> [projectId]
set -euo pipefail

ARTIFACTS="${1:?usage: publish-model-registry.sh <artifactsDir> <version> [projectId]}"
VERSION="${2:?version required, e.g. v1.0}"
PROJECT="${3:-smart-pet-feeder-g4}"

META="$ARTIFACTS/metadata.json"
[ -f "$META" ] || { echo "no metadata.json in $ARTIFACTS" >&2; exit 1; }

TOKEN=$(gcloud auth print-access-token)
BASE="https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/documents"

BODY=$(python3 - "$META" "$VERSION" <<'PY'
import json, sys, time
meta = json.load(open(sys.argv[1]))
version = sys.argv[2]
now = int(time.time() * 1000)

def val(v):
    if isinstance(v, bool): return {"booleanValue": v}
    if isinstance(v, int): return {"integerValue": str(v)}
    if isinstance(v, float): return {"doubleValue": v}
    return {"stringValue": str(v)}

fields = {
    "version": val(version),
    "status": val("ACTIVE"),
    "accuracy": val(float(meta["accuracy"])),
    "precision": val(float(meta["precision"])),
    "recall": val(float(meta["recall"])),
    "f1Score": val(float(meta["f1Score"])),
    "numberOfPets": val(int(meta["numberOfPets"])),
    "numberOfImages": val(int(meta["numberOfImages"])),
    "architecture": val(meta["architecture"]),
    "servedFrom": val(f"/models/{version}/ (static, browser inference — see spec amendment 14a)"),
    "createdAt": val(now),
}
print(json.dumps({"fields": fields}))
PY
)

echo "writing models/$VERSION ..."
curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "$BODY" "$BASE/models/$VERSION" > /dev/null

echo "writing system/ai ..."
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"fields\":{\"activeModelVersion\":{\"stringValue\":\"$VERSION\"},\"confidenceThreshold\":{\"doubleValue\":0.75},\"updatedAt\":{\"integerValue\":\"$NOW_MS\"}}}" \
  "$BASE/system/ai" > /dev/null

echo "done: models/$VERSION ACTIVE, system/ai -> $VERSION"
