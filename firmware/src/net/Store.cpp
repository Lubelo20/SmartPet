#include "net/Store.h"
#include <Preferences.h>

static Preferences prefs;
static const char *NS = "feeder";

void Store::begin() { prefs.begin(NS, false); }

void Store::saveCalibration(float bs, float hs, long bo, long ho) {
    prefs.putFloat("bs", bs); prefs.putFloat("hs", hs);
    prefs.putLong("bo", bo);  prefs.putLong("ho", ho);
    prefs.putBool("cal", true);
}

bool Store::loadCalibration(float &bs, float &hs, long &bo, long &ho) {
    if (!prefs.getBool("cal", false)) return false;
    bs = prefs.getFloat("bs", 1.0f); hs = prefs.getFloat("hs", 1.0f);
    bo = prefs.getLong("bo", 0);     ho = prefs.getLong("ho", 0);
    return true;
}

void Store::saveSchedules(const ScheduleEntry *entries, int count) {
    if (count > MAX_SCHEDULES) count = MAX_SCHEDULES;
    prefs.putInt("schedN", count);
    prefs.putBytes("sched", entries, sizeof(ScheduleEntry) * count);
}

int Store::loadSchedules(ScheduleEntry *out, int cap) {
    int n = prefs.getInt("schedN", 0);
    if (n <= 0) return 0;
    if (n > cap) n = cap;
    prefs.getBytes("sched", out, sizeof(ScheduleEntry) * n);
    return n;
}

void Store::saveConfig(float dp, float md, int tz) {
    prefs.putFloat("dp", dp); prefs.putFloat("md", md); prefs.putInt("tz", tz);
    prefs.putBool("cfg", true);
}

bool Store::loadConfig(float &dp, float &md, int &tz) {
    if (!prefs.getBool("cfg", false)) return false;
    dp = prefs.getFloat("dp", 120.0f); md = prefs.getFloat("md", 600.0f);
    tz = prefs.getInt("tz", 0);
    return true;
}
