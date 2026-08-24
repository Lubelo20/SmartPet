include <common.scad>

// The base plus a forward arm would be ~260 mm in Y and will not print on a
// 220 mm bed. The arm is therefore its own part, lapped and bolted to the base.
arm_w = 60;
arm_t = base_t + 2;
lap   = 40;    // overlap onto the base, bolted through

module bowl_arm() {
  difference() {
    union() {
      cube([arm_w, chute_forward + lap, arm_t], center = true);
      // Rib for stiffness — a cantilever carrying a bowl must not sag.
      translate([0, 0, arm_t/2])
        cube([wall*2, chute_forward + lap, 10], center = true);
    }
    // Bolts through the lap into the base.
    translate([0, (chute_forward + lap)/2 - lap/2, 0])
      bolt_square(30, m3_free, arm_t + 2);
    // Load cell mount at the tip.
    translate([0, -(chute_forward + lap)/2 + cell_l*0.225, 0])
      cell_mount(m3_tap, arm_t + 2);
  }
}

bowl_arm();
