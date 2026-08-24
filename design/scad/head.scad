include <common.scad>

shell = [60, 50, 34];

module head() {
  difference() {
    union() {
      // Shell, tilted so the camera looks down and forward at the bowl.
      rotate([head_tilt, 0, 0])
        cube(shell, center = true);
      // Neck that bolts to the top of the tower.
      translate([0, 0, -shell[2]/2 - 8])
        cube([30, 30, 16], center = true);
    }

    // Camera aperture and PCB pocket.
    rotate([head_tilt, 0, 0]) {
      translate([0, -shell[1]/2, 0])
        rotate([90, 0, 0]) cylinder(d = 12, h = 2*wall + 2, center = true, $fn = 48);
      translate([0, -shell[1]/2 + wall + cam_pcb[2]/2 + 1, 0])
        cube([cam_pcb[0] + fit_slide, cam_pcb[2] + fit_slide, cam_pcb[1] + fit_slide],
             center = true);
      // Hollow the shell.
      cube([shell[0] - 2*wall, shell[1] - 2*wall, shell[2] - 2*wall], center = true);
    }

    // Cable exit through the neck.
    translate([0, 0, -shell[2]/2 - 8])
      cylinder(d = 12, h = 20, center = true, $fn = 32);
    // Neck bolts.
    translate([0, 0, -shell[2]/2 - 8]) bolt_square(20, m3_free, 20);
  }
}

head();
