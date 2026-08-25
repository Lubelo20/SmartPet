#pragma once
#include "domain/Scheduler.h"

/**
 * Calibration is a property of the built machine, not of the design. A feeder
 * that forgets it on a power cut over- or under-feeds silently. Schedules are
 * cached for the same reason: a device that boots with no network must still
 * run yesterday's schedule rather than doing nothing.
 */
class Store {
public:
    void begin();
    void saveCalibration(float bowlScale, float hopperScale, long bowlOffset, long hopperOffset);
    bool loadCalibration(float &bowlScale, float &hopperScale, long &bowlOffset, long &hopperOffset);
    void saveSchedules(const ScheduleEntry *entries, int count);
    int  loadSchedules(ScheduleEntry *out, int cap);
    void saveConfig(float defaultPortion, float maxDaily, int tzOffsetMinutes);
    bool loadConfig(float &defaultPortion, float &maxDaily, int &tzOffsetMinutes);
};
