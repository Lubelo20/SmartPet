#include "net/TimeSync.h"
#include "config.h"
#include <Arduino.h>
#include <time.h>

void TimeSync::begin(int tzOffsetMinutes) {
    tzOffsetMinutes_ = tzOffsetMinutes;
    configTime(tzOffsetMinutes_ * 60, 0, NTP_SERVER);
    struct tm t;
    // Bounded wait: a device that blocks forever on NTP never reaches its
    // watchdog-fed loop and looks dead.
    synced_ = getLocalTime(&t, 8000);
    lastSyncMs_ = millis();
}

bool TimeSync::synced() const { return synced_; }

LocalTime TimeSync::now() const {
    struct tm t;
    if (!getLocalTime(&t, 50)) return LocalTime{0, 0, 0, 0, 0};
    return LocalTime{ t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
                      t.tm_hour * 60 + t.tm_min, t.tm_wday };
}

void TimeSync::maybeResync() {
    unsigned long due = (unsigned long)NTP_RESYNC_HOURS * 3600UL * 1000UL;
    if (millis() - lastSyncMs_ < due) return;
    begin(tzOffsetMinutes_);
}
