include <common.scad>

skirt_h   = 12;
skirt_gap = 6;    // the non-contact labyrinth gap around the floating assembly

module chute() {
  union() {
    difference() {
      // Outer funnel: outlet swept forward (-Y, toward the bowl) and down.
      hull() {
        cube([outlet_x + 2*wall, outlet_y + 2*wall, 1], center = true);
        translate([0, -chute_forward, -chute_drop])
          cube([chute_exit + 2*wall, chute_exit + 2*wall, 1], center = true);
      }
      // Inner void, extended past both ends.
      hull() {
        translate([0, 0, 1]) cube([outlet_x, outlet_y, 1], center = true);
        translate([0, -chute_forward, -chute_drop - 1])
          cube([chute_exit, chute_exit, 1], center = true);
      }
    }

    // Non-contact skirt. It overlaps the floating valve housing so kibble
    // cannot escape through the isolation gap. It MUST NOT TOUCH the housing —
    // skirt_gap is that promise expressed as geometry.
    translate([0, 0, skirt_h/2])
      lip(outlet_x + 2*wall + 2*skirt_gap, wall, skirt_h);
  }
}

chute();
