#pragma once

/**
 * Mirrors lib/schedule.ts. The device fires schedules; the dashboard only
 * displays them. Two traps this encodes, both learned in the dashboard:
 * never back-fire a time that had already passed when the schedule arrived,
 * and never fire at all on a clock that has not synced.
 */
enum class ScheduleDays { Daily, Weekdays, Weekends };

struct ScheduleEntry {
    char id[16];
    char petId[16];
    int  minuteOfDay;   // 0..1439; negative means unparseable and never fires
    float portionG;
    bool enabled;
    ScheduleDays days;
};

struct LocalTime {
    int year;
    int month;
    int day;
    int minuteOfDay;
    int weekday;        // 0 = Sunday
};

bool matchesDays(ScheduleDays days, int weekday);
bool isDue(const ScheduleEntry &e, const LocalTime &now);

constexpr int MAX_SCHEDULES = 16;

class Scheduler {
public:
    void setEntries(const ScheduleEntry *entries, int count);
    /** Treat everything already past as fired, so a boot does not replay the day. */
    void markPastAsFired(const LocalTime &now);
    /** Index of the first entry due and not yet fired today, or -1. */
    int  dueIndex(const LocalTime &now, bool timeSynced) const;
    void markFired(int index, const LocalTime &now);
    const ScheduleEntry &entry(int index) const { return entries_[index]; }

private:
    ScheduleEntry entries_[MAX_SCHEDULES]{};
    long firedOn_[MAX_SCHEDULES]{};
    int  count_ = 0;
    static long dayKey(const LocalTime &t);
};
