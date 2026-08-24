// Assembled preview. NOT a printable part — render.sh skips this file.
// Use it to eyeball interference before spending filament.
//
// Coordinate convention: the pet approaches from -Y. The chute sweeps -Y and
// the bowl arm extends -Y, so "forward" is -Y everywhere in this design.
include <common.scad>
use <hopper.scad>
use <lid.scad>
use <valve-housing.scad>
use <drum.scad>
use <chute.scad>
use <tower.scad>
use <base.scad>
use <bowl-arm.scad>
use <bowl-platform.scad>
use <head.scad>

bay_top  = base_t/2 + bay_h;
valve_z  = bay_top + tower_h + housing_z/2;
hopper_z = valve_z + housing_z/2 + 4;
bowl_y   = -chute_forward;   // directly under the chute exit

// Frame
color("gray")      base();
color("gray")      translate([-tower_w/2, -tower_d/2, bay_top]) tower();

// Bowl side — arm laps onto the base, platform cantilevers off its tip.
color("lightblue") translate([0, -base_size/2 + 20 - (chute_forward + 40)/2 + 20, base_t/2 + 4])
                     bowl_arm();
color("lightblue") translate([0, bowl_y, base_t/2 + 12]) bowl_platform();
// The bought bowl, shown as a plain disc so the chute clearance is visible.
color("silver")    translate([0, bowl_y, base_t/2 + 17]) cylinder(d = bowl_dia, h = 45);

// Floating assembly: housing + drum + hopper + lid move together on the cell.
color("orange")    translate([0, 0, valve_z]) valve_housing();
color("red")       translate([-housing_x/2 - 2, 0, valve_z]) rotate([0, 90, 0]) drum();
color("tan")       translate([0, 0, hopper_z]) hopper();
color("tan")       translate([0, 0, hopper_z + hopper_h + 8]) lid();

// Frame-mounted chute, passing the floating assembly with a non-contact gap.
color("green")     translate([0, 0, valve_z - housing_z/2]) chute();

// Head on a front mast, looking down and forward at the bowl. It must clear
// the chute, which occupies the space directly below it.
color("purple")    translate([0, -tower_d/2 - 55, valve_z + 40]) head();
