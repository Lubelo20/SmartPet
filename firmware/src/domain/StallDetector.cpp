#include "domain/StallDetector.h"
#include "config.h"

static float absf(float v) { return v < 0.0f ? -v : v; }

void StallDetector::reset(float startingG) {
    last_ = startingG;
    unchanged_ = 0;
}

void StallDetector::observe(float settledG) {
    if (absf(settledG - last_) <= NOISE_BAND_G) {
        unchanged_++;
    } else {
        unchanged_ = 0;
        last_ = settledG;
    }
}

bool StallDetector::stalled() const {
    return unchanged_ >= STALL_SWEEPS;
}
