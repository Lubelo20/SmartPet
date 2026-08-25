#pragma once
class Drum {
public:
    void begin();
    /** Commanded closed. Called in setup() before anything else. */
    void closeNow();
    /** One 180-degree pocket sweep: fill, carry, drop, return. */
    void sweep();
};
