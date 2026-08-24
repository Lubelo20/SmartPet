include <common.scad>

anchor_h = 20;

module tower() {
  difference() {
    union() {
      // Spine — an open C section, printed on its back, no supports needed.
      difference() {
        cube([tower_w, tower_d, tower_h], center = false);
        translate([wall, wall, -1])
          cube([tower_w - 2*wall, tower_d, tower_h + 2], center = false);
      }
      // Load cell anchor for the floating hopper assembly. The FRAME half of
      // the cantilever bolts here; the hopper half bolts to the valve housing.
      translate([tower_w/2 - (cell_w + 2*wall)/2, wall, tower_h - anchor_h])
        cube([cell_w + 2*wall, cell_l * 0.45, anchor_h], center = false);
    }

    // Cell bolt holes in the anchor.
    translate([tower_w/2, wall + cell_l*0.225, tower_h - anchor_h/2])
      cell_mount(m3_tap, cell_w + 2*wall + 2);

    // Cable routes: one for the servo service loop, one for the sensors.
    for (z = [tower_h*0.35, tower_h*0.65])
      translate([tower_w/2, tower_d/2, z])
        rotate([90, 0, 0]) cylinder(d = 12, h = tower_d + 2, center = true, $fn = 32);

    // Chute pass-through in the front face. The chute is frame-mounted and
    // descends across the tower on its way to the bowl; this opening lets it
    // pass without touching anything that is being weighed.
    translate([tower_w/2, wall/2, tower_h - 30])
      cube([outlet_x + 24, wall + 2, 70], center = true);

    // Ultrasonic window on the front face.
    translate([tower_w/2, wall/2, tower_h*0.30])
      rotate([90, 0, 0])
        for (x = [-sr04_pitch/2, sr04_pitch/2])
          translate([x, 0, 0])
            cylinder(d = sr04_dia + fit_slide, h = wall + 2, center = true, $fn = 48);
  }
}

tower();
