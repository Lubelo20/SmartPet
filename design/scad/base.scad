include <common.scad>

usb_w = 10;
usb_h = 5;

module base() {
  difference() {
    union() {
      // Main plate.
      cube([base_size, base_size, base_t], center = true);
      // Electronics bay walls.
      translate([0, 0, base_t/2 + bay_h/2])
        difference() {
          cube([base_size, base_size, bay_h], center = true);
          cube([base_size - 2*wall, base_size - 2*wall, bay_h + 1], center = true);
        }
    }

    // Bowl arm lap bolts — the arm prints separately, see bowl-arm.scad.
    translate([0, -base_size/2 + 20, 0]) bolt_square(30, m3_free, base_t + 2);

    // USB-C panel cutout in the rear bay wall.
    translate([0, base_size/2 - wall/2, base_t/2 + bay_h/2])
      cube([usb_w, wall + 2, usb_h], center = true);

    // Ventilation for the bay.
    for (x = [-40:20:40])
      translate([x, -base_size/2 + wall/2, base_t/2 + bay_h/2])
        cube([4, wall + 2, bay_h * 0.6], center = true);

    // Tower mounting holes.
    translate([0, 40, 0]) bolt_square(60, m3_free, base_t + 2);
  }
}

base();
