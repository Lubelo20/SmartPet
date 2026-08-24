include <common.scad>

flange_w     = 6;
flange_t     = 4;
flange_bolts = hopper_throat + 2*wall + 12;
servo_body   = [23, 12.5, 22.5];    // SG90 / MG90S body
servo_lug    = 32;                  // lug hole centres

module valve_housing() {
  difference() {
    union() {
      cube([housing_x, housing_y, housing_z], center = true);
      // Top flange, bolts to the hopper throat.
      translate([0, 0, housing_z/2])
        cube([hopper_throat + 2*wall + 2*flange_w,
              hopper_throat + 2*wall + 2*flange_w, flange_t], center = true);
    }

    // Drum bore, axis along X.
    rotate([0, 90, 0])
      cylinder(d = drum_bore, h = housing_x + 2, center = true);

    // Inlet from the hopper — top half only, so the drum still seals at rest.
    translate([0, 0, housing_z/4 + flange_t/2])
      cube([hopper_throat, hopper_throat, housing_z/2 + flange_t + 1], center = true);

    // Outlet to the chute — bottom half only.
    translate([0, 0, -housing_z/4])
      cube([outlet_x, outlet_y, housing_z/2 + 1], center = true);

    // Flange bolt holes.
    translate([0, 0, housing_z/2 + flange_t/2])
      bolt_square(flange_bolts, m3_free, flange_t + 2);

    // Servo pocket in the +X wall. The servo mounts to THIS part, which
    // floats on the load cell. Never mount it to the tower.
    translate([housing_x/2 - servo_body[2]/2 + 1, 0, 0])
      cube(servo_body, center = true);
    for (y = [-servo_lug/2, servo_lug/2])
      translate([housing_x/2 - 6, y, 0])
        rotate([0, 90, 0]) cylinder(d = m3_tap, h = 14, center = true, $fn = 24);
  }
}

valve_housing();
