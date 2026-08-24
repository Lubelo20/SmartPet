#!/usr/bin/env bash
# Compile every part headlessly. Any assert() failure or syntax error exits non-zero.
set -uo pipefail
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

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fail=0

for f in scad/*.scad; do
  name=$(basename "$f" .scad)
  [ "$name" = "common" ] && continue
  if out=$("$OPENSCAD" --hardwarnings -o "$tmp/$name.stl" "$f" 2>&1); then
    printf '  ok    %s\n' "$name"
  else
    printf '  FAIL  %s\n' "$name"
    printf '%s\n' "$out" | sed 's/^/          /'
    fail=1
  fi
done

[ "$fail" -eq 0 ] && echo "all parts compile" || echo "one or more parts failed" >&2
exit "$fail"
