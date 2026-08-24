include <common.scad>

flange_w = 6;
flange_t = 4;
flange_bolts = hopper_throat + 2*wall + 12;

module hopper() {
  difference() {
    union() {
      // Outer shell.
      frustum(hopper_throat + 2*wall, hopper_mouth + 2*wall, hopper_h);
      // Throat flange — bolts onto the valve housing.
      translate([0, 0, -flange_t/2])
        cube([hopper_throat + 2*wall + 2*flange_w,
              hopper_throat + 2*wall + 2*flange_w, flange_t], center = true);
      // Mouth rim, thickened so the lid lip has something to seat against.
      translate([0, 0, hopper_h - 3])
        lip(hopper_mouth, wall + 1.5, 3);
    }

    // Food void. Extended past each end so the boolean has no coincident
    // faces; the taper rate is applied so the throat and mouth stay exact.
    translate([0, 0, -flange_t - 1])
      frustum(hopper_throat - hopper_taper_rate * (flange_t + 1),
              hopper_mouth  + hopper_taper_rate,
              hopper_h + flange_t + 2);

    // Flange bolt holes.
    translate([0, 0, -flange_t/2])
      bolt_square(flange_bolts, m3_free, flange_t + 2);
  }
}

hopper();
