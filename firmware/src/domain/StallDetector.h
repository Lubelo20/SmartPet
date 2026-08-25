#pragma once

/**
 * The servo is being commanded and nothing is arriving in the bowl, so
 * something is jammed. Continuing risks stripping the servo gears, which the
 * hardware design flags as the weak point of the whole build.
 */
class StallDetector {
public:
    void reset(float startingG);
    void observe(float settledG);
    bool stalled() const;

private:
    float last_ = 0.0f;
    int   unchanged_ = 0;
};
