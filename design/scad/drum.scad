include <common.scad>

horn_l = 20;    // servo horn arm length
horn_w = 5;
horn_t = 2;

module drum() {
  difference() {
    union() {
      // Drum body. Axis along Z here for printing; it mounts along X.
      cylinder(d = drum_dia, h = drum_len);
      // Idler shaft stub (far end from the servo).
      translate([0, 0, drum_len]) cylinder(d = shaft_dia, h = shaft_len, $fn = 48);
    }

    // The scoop pocket: a circular segment of depth pocket_depth, running the
    // full length. Everything with y > r - pocket_depth is removed.
    translate([-drum_dia/2 - 1, drum_r - pocket_depth, -1])
      cube([drum_dia + 2, pocket_depth + 2, drum_len + 2]);

    // Servo horn recess in the driven face, plus two M2 screw holes.
    translate([0, 0, -0.01]) {
      cube([horn_l, horn_w, 2*horn_t], center = true);
      cylinder(d = 8, h = 2*horn_t, center = true, $fn = 32);
      for (x = [-horn_l/2 + 3, horn_l/2 - 3])
        translate([x, 0, 0]) cylinder(d = 2.2, h = 4*horn_t, center = true, $fn = 20);
    }
  }
}

drum();
