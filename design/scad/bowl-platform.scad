include <common.scad>

boss_l = cell_l * 0.45;
boss_w = cell_w + 2*wall;
boss_h = 14;

module bowl_platform() {
  difference() {
    union() {
      cylinder(d = platform_dia, h = platform_t);

      // Retaining ring that locates the bought bowl.
      translate([0, 0, platform_t])
        difference() {
          cylinder(d = bowl_dia + 2*ring_w + 2*fit_slide, h = ring_h);
          translate([0, 0, -1])
            cylinder(d = bowl_dia + 2*fit_slide, h = ring_h + 2);
        }

      // Cantilever boss on the underside — the ONLY thing that touches
      // anything else. The load cell bolts here; nothing else may.
      translate([-boss_w/2, -platform_dia/4, -boss_h])
        cube([boss_w, boss_l, boss_h], center = false);
    }

    // Load cell bolt holes through the boss.
    translate([0, -platform_dia/4 + boss_l/2, -boss_h/2])
      cell_mount(m3_tap, boss_h + 2);

    // Drain slots, so spilled water leaves the platform instead of sitting
    // on the cell.
    for (a = [0:60:359])
      rotate([0, 0, a]) translate([platform_dia/4, 0, -1])
        cube([20, 3, platform_t + 2], center = true);
  }
}

bowl_platform();
