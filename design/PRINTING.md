# Printing

Ten parts. Everything fits a 220 × 220 × 250 mm bed unsplit — that constraint is
asserted in `scad/common.scad`, so if you change a dimension and a part outgrows
the bed, `./check.sh` fails rather than letting you discover it in the slicer.

## Settings

| | Food path (hopper, valve housing, chute) | Drum | Everything else |
|---|---|---|---|
| Material | PETG | PETG | PETG or PLA |
| Layer | 0.2 mm | **0.15 mm** | 0.2 mm |
| Perimeters | 3 | 4 | 3 |
| Infill | 25% | 40% | 25% |
| Supports | none | none | head only |

PETG for anything touching food: tougher than PLA, tolerates a warm kitchen, and
survives repeated washing without going brittle.

The drum prints finer because it has to turn inside a bore with 0.4 mm radial
clearance. A coarse layer height plus elephant's foot eats that clearance and
the drum binds.

## Orientation

| Part | Orientation | Why |
|---|---|---|
| `hopper` | Throat down, as modelled | Walls self-support at 78°; no supports in the food path |
| `lid` | As modelled | Flat |
| `drum` | Axis vertical, as modelled | Round bore stays round; no support scars on the sealing surface |
| `valve-housing` | As modelled | Bore prints as a bridged circle — acceptable; ream lightly if tight |
| `chute` | Exit down | Funnel self-supports |
| `tower` | On its back (open face up) | The C section needs no supports this way |
| `base` | As modelled | Flat, large first layer — use a brim |
| `bowl-arm` | Rib up | Rib is the only overhang and it self-supports |
| `bowl-platform` | Ring up | Boss underneath needs a short support, or print boss-up and bridge |
| `head` | Neck down, **supports on** | The tilted shell overhangs |

## Food contact

FDM prints are **not food-safe for long-term use** — layer lines harbour bacteria
and cannot be reliably sanitised. The bowl is therefore a bought stainless or
ceramic item, never a printed one. The chute, drum and hopper do touch food:
print them in PETG with no supports in the food path, clean them weekly, and
replace them periodically. This is a prototype, not a certified food-contact product.

## First-print checks

Before printing all ten parts, print the **drum** and the **valve housing** alone
and check the drum turns freely in the bore under finger pressure. That pair is
the only fit in the design that has to be right, and it costs about two hours to
test versus a full day to reprint everything.

If the drum binds, raise `drum_clearance` in `scad/common.scad` from 0.4 to 0.5
and re-run `./render.sh`. If it rattles and leaks kibble past the seal, drop it
to 0.3.
