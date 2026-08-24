#!/usr/bin/env bash
# Render every printable part to design/stl/.
set -euo pipefail
cd "$(dirname "$0")"

OPENSCAD="${OPENSCAD:-}"
if [ -z "$OPENSCAD" ]; then
  if command -v openscad >/dev/null 2>&1; then
    OPENSCAD=openscad
  elif app=$(ls -d /Applications/OpenSCAD*.app 2>/dev/null | head -1) && [ -x "$app/Contents/MacOS/OpenSCAD" ]; then
    OPENSCAD="$app/Contents/MacOS/OpenSCAD"
  else
    echo "OpenSCAD not found. Install it, or set OPENSCAD=/path/to/openscad" >&2
    exit 127
  fi
fi

mkdir -p stl
for f in scad/*.scad; do
  name=$(basename "$f" .scad)
  case "$name" in common|plate-all) continue;; esac
  echo "rendering $name"
  "$OPENSCAD" -o "stl/$name.stl" "$f"
done
echo "STLs in design/stl/"
