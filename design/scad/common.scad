// common.scad — every dimension in the feeder lives here.
// Change a value, re-run ../check.sh, and every part regrows together.

/* ---------- Printer envelope ---------- */
bed_x = 220;
bed_y = 220;
bed_z = 250;

/* ---------- Material and process ---------- */
wall      = 2.0;    // nominal wall thickness (5 perimeters at 0.4 nozzle)
fit_slide = 0.30;   // clearance for parts that must move against each other
fit_press = 0.15;   // clearance for parts pressed together
$fn       = 96;

/* ---------- Fasteners ---------- */
m3_free = 3.4;      // M3 clearance hole
m3_tap  = 2.8;      // M3 self-tapping into plastic
m4_free = 4.5;

/* ---------- Load cells (VERIFY against the cells you actually buy) ----------
   Figures below are for the common YZC-133 straight bar. Bolt spacing varies
   between suppliers; measure yours before printing the base or the platform. */
cell_l            = 80;
cell_w            = 12.7;
cell_h            = 12.7;
cell_bolt_spacing = 15;   // centre-to-centre, at each end
cell_gap          = 3;    // spacer thickness — the beam MUST be free to flex

/* ---------- Food model ---------- */
kibble_density = 0.40;   // g/cm^3, dry kibble bulk density

/* ---------- Hopper ---------- */
hopper_volume_l = 2.0;
hopper_mouth    = 140;   // inner, square, at the top
hopper_throat   = 55;    // inner, square, at the bottom

// Square frustum volume: V = h/3 * (A1 + A2 + sqrt(A1*A2))
// For squares sqrt(A1*A2) collapses to mouth*throat, so height is exact:
hopper_h = 3 * hopper_volume_l * 1000000 /
           (hopper_mouth*hopper_mouth + hopper_throat*hopper_throat +
            hopper_mouth*hopper_throat);

hopper_run        = (hopper_mouth - hopper_throat) / 2;
hopper_wall_angle = atan(hopper_h / hopper_run);   // from horizontal
hopper_taper_rate = (hopper_mouth - hopper_throat) / hopper_h;
hopper_capacity_g = hopper_volume_l * 1000 * kibble_density;

/* ---------- Drum valve ---------- */
drum_dia       = 50;
drum_len       = 60;
drum_clearance = 0.4;                      // radial
drum_bore      = drum_dia + 2*drum_clearance;
pocket_depth   = 11.3;                     // segment depth of the scoop
shaft_dia      = 6;
shaft_len      = 8;

// Circular-segment maths. OpenSCAD trig is in DEGREES; the segment area
// formula needs the angle in RADIANS, hence the two forms below.
drum_r          = drum_dia / 2;
pocket_theta    = 2 * acos(1 - pocket_depth/drum_r);        // degrees
pocket_theta_r  = pocket_theta * PI / 180;                  // radians
pocket_area     = drum_r*drum_r/2 * (pocket_theta_r - sin(pocket_theta));
pocket_volume   = pocket_area * drum_len;                   // mm^3
sweep_grams     = pocket_volume / 1000 * kibble_density;    // DERIVED, not assumed

/* ---------- Valve housing ---------- */
housing_x = drum_len + 4*wall;      // along the drum axis
housing_y = drum_bore + 4*wall;
housing_z = drum_bore + 4*wall;
outlet_x  = 45;
outlet_y  = 45;

/* ---------- Chute ---------- */
chute_forward = 70;    // how far forward of the tower the food lands
chute_drop    = 90;    // vertical fall from valve outlet to chute exit
chute_exit    = 40;
chute_clear   = 40;    // exit height above the bowl rim — impulse, not load

/* ---------- Bowl and platform ---------- */
bowl_dia     = 140;    // the BOUGHT stainless/ceramic bowl
platform_dia = 150;
platform_t   = 5;
ring_w       = 3;
ring_h       = 8;
bowl_gap     = 6;      // air on every side — the isolation gap

/* ---------- Base and tower ---------- */
base_size = 190;
base_t    = 6;
bay_h     = 28;        // electronics bay height
tower_w   = 90;
tower_d   = 70;
tower_h   = 150;

/* ---------- Head ---------- */
head_tilt   = 30;      // camera, degrees down from horizontal
cam_pcb     = [40, 40, 1.6];
sr04_dia    = 16;
sr04_pitch  = 26;      // centre-to-centre of the two transducers

/* ---------- Derived overall ---------- */
total_h = base_t + bay_h + tower_h + housing_z + hopper_h;

/* ---------- Assertions: the things that silently ruin a print ---------- */
assert(hopper_wall_angle >= 60,
       str("Hopper wall ", hopper_wall_angle, " deg is below 60 - kibble will bridge"));
assert(hopper_h + 2*wall <= bed_z,
       str("Hopper ", hopper_h, " mm exceeds bed Z ", bed_z));
assert(hopper_mouth + 2*wall <= bed_x,
       "Hopper mouth exceeds bed X");
assert(base_size <= bed_x && base_size <= bed_y,
       "Base exceeds bed footprint");
assert(platform_dia <= bed_x, "Bowl platform exceeds bed X");
assert(drum_clearance > 0, "Drum clearance must be positive or the drum seizes");
assert(drum_bore > drum_dia, "Drum bore must exceed drum diameter");
assert(pocket_depth < drum_r,
       "Pocket deeper than the drum radius - the scoop would cut through the axis");
assert(sweep_grams > 6 && sweep_grams < 10,
       str("Sweep delivers ", sweep_grams, " g - outside the 6-10 g design window"));
assert(bowl_gap > 0, "Bowl isolation gap must be positive");
assert(cell_gap > 0, "Load cell needs a flex gap or it reads nothing");
assert(chute_forward + 40 <= bed_y,
       "Bowl arm exceeds bed Y - split it or shorten chute_forward");

/* ---------- Shared geometry ---------- */
// A square frustum, bottom face on the XY plane, centred on Z.
module frustum(bottom, top, h) {
  linear_extrude(height = h, scale = top/bottom)
    square([bottom, bottom], center = true);
}

// A rectangular tube used for the labyrinth lip on the lid and hopper mouth.
module lip(inner, thickness, h) {
  difference() {
    cube([inner + 2*thickness, inner + 2*thickness, h], center = true);
    cube([inner, inner, h + 1], center = true);
  }
}

// Four bolt holes on a square pattern.
module bolt_square(spacing, dia, h) {
  for (i = [0:3])
    rotate([0, 0, 90*i])
      translate([spacing/2, spacing/2, 0])
        cylinder(d = dia, h = h, center = true, $fn = 24);
}

// The cantilever footprint a load cell bolts into: two holes plus a relief slot.
module cell_mount(dia = m3_tap, h = 10) {
  for (y = [-cell_bolt_spacing/2, cell_bolt_spacing/2])
    translate([0, y, 0]) cylinder(d = dia, h = h, center = true, $fn = 24);
}

echo(str("hopper_h = ", hopper_h, " mm"));
echo(str("hopper wall angle = ", hopper_wall_angle, " deg"));
echo(str("hopper capacity = ", hopper_capacity_g, " g"));
echo(str("sweep = ", sweep_grams, " g"));
echo(str("total height = ", total_h, " mm"));
