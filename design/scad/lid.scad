include <common.scad>

lid_t     = 3;
lid_over  = 4;                 // overhang past the hopper rim
lid_inner = hopper_mouth - fit_slide * 2;

module lid() {
  union() {
    // Top plate.
    cube([hopper_mouth + 2*wall + 2*lid_over,
          hopper_mouth + 2*wall + 2*lid_over, lid_t], center = true);
    // Labyrinth lip that drops into the mouth — keeps humidity and paws out.
    translate([0, 0, -lid_t/2 - 5])
      lip(lid_inner - 2*wall, wall, 10);
    // Finger recess boss.
    translate([0, 0, lid_t/2])
      difference() {
        cylinder(d = 40, h = 6, $fn = 64);
        translate([0, 0, 2]) cylinder(d = 34, h = 6, $fn = 64);
      }
  }
}

lid();
