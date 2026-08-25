#pragma once
class Ranger {
public:
    void begin();
    /** Median-filtered distance in cm; negative when nothing echoed. */
    float readCm();
};
