#include "domain/Scheduler.h"

bool matchesDays(ScheduleDays days, int weekday) {
    if (days == ScheduleDays::Weekdays) return weekday >= 1 && weekday <= 5;
    if (days == ScheduleDays::Weekends) return weekday == 0 || weekday == 6;
    return true;
}

bool isDue(const ScheduleEntry &e, const LocalTime &now) {
    if (!e.enabled) return false;
    // A negative minuteOfDay means the time never parsed. Treating it as
    // midnight would fire every schedule the moment the device booted.
    if (e.minuteOfDay < 0) return false;
    if (!matchesDays(e.days, now.weekday)) return false;
    return now.minuteOfDay >= e.minuteOfDay;
}

long Scheduler::dayKey(const LocalTime &t) {
    return (long)t.year * 10000L + (long)t.month * 100L + (long)t.day;
}

void Scheduler::setEntries(const ScheduleEntry *entries, int count) {
    if (count > MAX_SCHEDULES) count = MAX_SCHEDULES;
    for (int i = 0; i < count; i++) entries_[i] = entries[i];
    count_ = count;
}

void Scheduler::markPastAsFired(const LocalTime &now) {
    for (int i = 0; i < count_; i++) {
        if (isDue(entries_[i], now)) firedOn_[i] = dayKey(now);
    }
}

int Scheduler::dueIndex(const LocalTime &now, bool timeSynced) const {
    if (!timeSynced) return -1;
    for (int i = 0; i < count_; i++) {
        if (firedOn_[i] == dayKey(now)) continue;
        if (isDue(entries_[i], now)) return i;
    }
    return -1;
}

void Scheduler::markFired(int index, const LocalTime &now) {
    if (index < 0 || index >= count_) return;
    firedOn_[index] = dayKey(now);
}
