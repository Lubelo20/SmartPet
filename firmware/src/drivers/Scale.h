#pragma once
class Scale {
public:
    void begin();
    void setCalibration(float bowlScale, float hopperScale, long bowlOffset, long hopperOffset);
    /** Median of SAMPLE_COUNT readings on channel A (bowl, gain 128). */
    float readBowlSettled();
    /** Channel B (hopper, gain 32). Only meaningful when idle — see the cpp. */
    float readHopper();
    void tareBowl();
    long bowlOffset() const;
    long hopperOffset() const;
};
