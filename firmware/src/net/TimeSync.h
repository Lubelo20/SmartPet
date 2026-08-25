#pragma once
#include "domain/Scheduler.h"

class TimeSync {
public:
    void begin(int tzOffsetMinutes);
    bool synced() const;
    LocalTime now() const;
    void maybeResync();

private:
    int  tzOffsetMinutes_ = 0;
    bool synced_ = false;
    unsigned long lastSyncMs_ = 0;
};
