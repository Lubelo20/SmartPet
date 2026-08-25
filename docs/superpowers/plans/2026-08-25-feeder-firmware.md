# Feeder Firmware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Milestone-one ESP32 firmware for the feeder: presence sensing, dual load cells, weight-trimmed dispensing, on-device schedules, all five commands and RTDB telemetry — with every decision that moves food tested on a laptop.

**Architecture:** Four layers. `domain/` holds the logic that decides whether an animal eats and includes no Arduino header, so PlatformIO can run it natively. `drivers/` wraps one peripheral each. `net/` talks to Firebase RTDB. `main.cpp` does wiring and the state machine and nothing else. Tasks 2–7 are pure logic and fully testable; tasks 8–11 touch hardware and are not.

**Tech Stack:** PlatformIO, Arduino framework for ESP32, Unity test runner, Firebase RTDB via the Firebase Arduino client, HX711 and ESP32Servo libraries.

**Spec:** `docs/superpowers/specs/2026-08-25-feeder-firmware-design.md`

## Global Constraints

- **`src/domain/**` must not include `Arduino.h`, `WiFi.h`, or call `millis()`/`delay()`.** Time and I/O arrive as arguments. This is what keeps the native tests possible; a single stray include breaks the whole approach.
- Pin map is fixed and has **zero spare GPIO**: HX711 SCK **14**, HX711 DOUT **13**, HC-SR04 TRIG **12**, HC-SR04 ECHO **15**, servo **2**, flash LED **4**.
- HX711 channel **A = bowl, gain 128**; channel **B = hopper, gain 32**. Read A only during a cycle.
- Drum delivers **~8 g per 180° sweep**. `actualG` reported is always the **final settled weight**, never the target and never a sum of nominal sweeps.
- **The device is authoritative** for the schedule and the daily maximum. It enforces both on every path.
- **Commands are idempotent by id.** RTDB delivers at-least-once; acting twice on `feeding.start` feeds the animal twice.
- **Schedules never fire when the clock has not synced.** A feeder that guesses the time feeds at the wrong time.
- **Servo is commanded closed in `setup()` before anything else.**
- Secrets live in `firmware/include/secrets.h`, git-ignored. Only `secrets.example.h` is committed.
- Native tests must pass: `pio test -e native`. The device build must compile: `pio run -e esp32cam`.
- Commit at the end of every task.

---

### Task 1: Project skeleton and a native test harness that actually runs

Nothing else in this plan is verifiable until `pio test -e native` works, so it ships first and proves itself.

**Files:**
- Create: `firmware/platformio.ini`, `firmware/include/config.h`, `firmware/include/secrets.example.h`, `firmware/test/test_harness/test_main.cpp`, `firmware/.gitignore`
- Modify: `.gitignore` (repo root)

**Interfaces:**
- Consumes: nothing.
- Produces: `pio test -e native`, `pio run -e esp32cam`, and every constant in `config.h` that later tasks read.

- [ ] **Step 1: Install PlatformIO if it is missing**

```bash
pio --version || pip3 install --user platformio && pio --version
```

Expected: a version string. PlatformIO is not installed on the machine this plan was written on, so this step is real work, not a formality.

- [ ] **Step 2: Write `firmware/platformio.ini`**

```ini
; Two environments on purpose: `native` runs the domain logic on the host with no
; board attached, `esp32cam` builds the real firmware. Everything that decides
; whether an animal eats must be testable in the first one.
[platformio]
default_envs = esp32cam

[env:esp32cam]
platform = espressif32@6.5.0
board = esp32cam
framework = arduino
monitor_speed = 115200
lib_deps =
    bogde/HX711@^0.7.5
    madhephaestus/ESP32Servo@^3.0.5
    mobizt/Firebase Arduino Client Library for ESP8266 and ESP32@^4.4.14
    bblanchon/ArduinoJson@^7.0.4
build_flags = -DCORE_DEBUG_LEVEL=1

[env:native]
platform = native
test_framework = unity
build_flags = -std=gnu++17 -DUNIT_TEST -I include
test_ignore = test_embedded*
```

Library versions are pinned but **unverified** — they were chosen without a network fetch. If a version does not resolve, bump it and record the working version here rather than removing the pin.

- [ ] **Step 3: Write `firmware/include/config.h`**

```cpp
#pragma once

// Pin map. Fixed by the hardware design: the OV2640 consumes the rest of the
// GPIO and there is no spare. See docs/superpowers/specs/2026-08-24-feeder-hardware-design.md §5.
constexpr int PIN_HX711_SCK  = 14;
constexpr int PIN_HX711_DOUT = 13;
constexpr int PIN_SR04_TRIG  = 12;   // strapping pin: must be LOW at boot, and trigger idles low
constexpr int PIN_SR04_ECHO  = 15;   // 5V -> 3.3V through a 1k/2k divider
constexpr int PIN_SERVO      = 2;    // strapping pin: needs a 10k pull-down
constexpr int PIN_FLASH_LED  = 4;

// Drum mechanics, from the hardware design §4.
constexpr float GRAMS_PER_SWEEP = 8.0f;
constexpr int   SERVO_CLOSED_DEG = 10;
constexpr int   SERVO_OPEN_DEG   = 170;
constexpr int   SWEEP_TRAVEL_MS  = 600;

// Weighing. Every one of these is a GUESS until measured against the built
// machine; design/CALIBRATION.md is where the measured values go.
constexpr float TOLERANCE_G   = 3.0f;   // a load cell never lands exactly on a number
constexpr float NOISE_BAND_G  = 1.5f;   // below this, a change is noise, not food
constexpr int   SETTLE_MS     = 400;    // time for food to stop moving after a sweep
constexpr int   SAMPLE_COUNT  = 7;      // median filter width
constexpr int   STALL_SWEEPS  = 3;      // unchanged sweeps before declaring a jam

// Telemetry cadence, from the architecture doc.
constexpr int TELEMETRY_IDLE_MS = 1000;
constexpr int TELEMETRY_BUSY_MS = 200;

// Time.
constexpr int   NTP_RESYNC_HOURS = 6;
constexpr char  NTP_SERVER[]     = "pool.ntp.org";

// How many recently-seen command ids to remember. RTDB delivers at least once,
// so a reconnect can re-present a command already acted on.
constexpr int COMMAND_MEMORY = 16;
```

- [ ] **Step 4: Write `firmware/include/secrets.example.h`**

```cpp
#pragma once
// Copy to secrets.h and fill in. secrets.h is git-ignored and must stay that way.
#define WIFI_SSID       ""
#define WIFI_PASSWORD   ""
#define FIREBASE_API_KEY    ""
#define FIREBASE_DATABASE_URL ""   // https://<project>-default-rtdb.firebaseio.com
#define DEVICE_EMAIL    ""         // the device's own Firebase Auth user
#define DEVICE_PASSWORD ""
#define DEVICE_ID       "ESP32-PETFEEDER-001"
```

- [ ] **Step 5: Git-ignore the secrets and build output**

`firmware/.gitignore`:

```
.pio/
include/secrets.h
```

- [ ] **Step 6: Write a harness test that proves the native environment runs**

`firmware/test/test_harness/test_main.cpp`:

```cpp
#include <unity.h>
#include "config.h"

void setUp() {}
void tearDown() {}

// Not a behaviour test — it exists to prove `pio test -e native` compiles,
// links and runs before any real logic depends on it.
void test_config_is_reachable_from_a_native_test() {
    TEST_ASSERT_EQUAL_INT(14, PIN_HX711_SCK);
    TEST_ASSERT_EQUAL_FLOAT(8.0f, GRAMS_PER_SWEEP);
}

int main(int, char **) {
    UNITY_BEGIN();
    RUN_TEST(test_config_is_reachable_from_a_native_test);
    return UNITY_END();
}
```

- [ ] **Step 7: Run it**

```bash
cd firmware && pio test -e native
```

Expected: `1 Tests 0 Failures 0 Ignored` and an OK line.

- [ ] **Step 8: Commit**

```bash
git add firmware .gitignore
git commit -m "Add firmware skeleton and a native test harness"
```

---

### Task 2: DailyLimit — the rule that stops an animal being overfed

**Files:**
- Create: `firmware/src/domain/DailyLimit.h`, `firmware/src/domain/DailyLimit.cpp`
- Test: `firmware/test/test_daily_limit/test_main.cpp`

**Interfaces:**
- Consumes: nothing.
- Produces: `struct DailyLimitCheck { bool allowed; float alreadyToday; float limit; float remaining; };` and `DailyLimitCheck checkDailyLimit(float alreadyToday, float portionG, float limit);`

This mirrors `lib/limits.ts` in the dashboard. The rules must match, and per spec §4 **this copy is the authoritative one**.

- [ ] **Step 1: Write the failing test**

```cpp
#include <unity.h>
#include "domain/DailyLimit.h"

void setUp() {}
void tearDown() {}

void test_allows_a_portion_within_the_limit() {
    DailyLimitCheck r = checkDailyLimit(300.0f, 200.0f, 600.0f);
    TEST_ASSERT_TRUE(r.allowed);
}

void test_allows_a_portion_landing_exactly_on_the_limit() {
    DailyLimitCheck r = checkDailyLimit(400.0f, 200.0f, 600.0f);
    TEST_ASSERT_TRUE(r.allowed);
}

void test_refuses_a_portion_that_would_cross_the_limit() {
    DailyLimitCheck r = checkDailyLimit(580.0f, 100.0f, 600.0f);
    TEST_ASSERT_FALSE(r.allowed);
    TEST_ASSERT_EQUAL_FLOAT(20.0f, r.remaining);
}

void test_never_reports_negative_headroom() {
    DailyLimitCheck r = checkDailyLimit(700.0f, 10.0f, 600.0f);
    TEST_ASSERT_EQUAL_FLOAT(0.0f, r.remaining);
}

void test_a_non_positive_limit_means_not_configured() {
    // A blank or zeroed field must never lock the feeder out and leave a pet unfed.
    TEST_ASSERT_TRUE(checkDailyLimit(900.0f, 100.0f, 0.0f).allowed);
    TEST_ASSERT_TRUE(checkDailyLimit(900.0f, 100.0f, -5.0f).allowed);
}

int main(int, char **) {
    UNITY_BEGIN();
    RUN_TEST(test_allows_a_portion_within_the_limit);
    RUN_TEST(test_allows_a_portion_landing_exactly_on_the_limit);
    RUN_TEST(test_refuses_a_portion_that_would_cross_the_limit);
    RUN_TEST(test_never_reports_negative_headroom);
    RUN_TEST(test_a_non_positive_limit_means_not_configured);
    return UNITY_END();
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd firmware && pio test -e native -f test_daily_limit`
Expected: a compile error — `domain/DailyLimit.h` does not exist.

- [ ] **Step 3: Write the header**

```cpp
#pragma once

/**
 * Mirrors lib/limits.ts in the dashboard. Per the firmware spec §4 this copy is
 * authoritative: the device enforces the maximum regardless of what the
 * dashboard believes, and the dashboard's copy only refuses early so the user
 * gets an explanation instead of silence.
 *
 * No Arduino header here, on purpose — see the plan's global constraints.
 */
struct DailyLimitCheck {
    bool  allowed;
    float alreadyToday;
    float limit;
    float remaining;   // never negative
};

DailyLimitCheck checkDailyLimit(float alreadyToday, float portionG, float limit);
```

- [ ] **Step 4: Write the implementation**

```cpp
#include "domain/DailyLimit.h"

DailyLimitCheck checkDailyLimit(float alreadyToday, float portionG, float limit) {
    float remaining = limit - alreadyToday;
    if (remaining < 0.0f) remaining = 0.0f;

    // A non-positive limit means "not configured", not "allow nothing". A blank
    // field must never leave an animal unfed.
    if (limit <= 0.0f) {
        return DailyLimitCheck{ true, alreadyToday, limit, remaining };
    }
    return DailyLimitCheck{ alreadyToday + portionG <= limit, alreadyToday, limit, remaining };
}
```

- [ ] **Step 5: Run the tests**

Run: `cd firmware && pio test -e native -f test_daily_limit`
Expected: `5 Tests 0 Failures`.

- [ ] **Step 6: Commit**

```bash
git add firmware/src/domain/DailyLimit.* firmware/test/test_daily_limit
git commit -m "Add the on-device daily limit rule"
```

---

### Task 3: Scheduler — fire the right meal at the right time, once

**Files:**
- Create: `firmware/src/domain/Scheduler.h`, `firmware/src/domain/Scheduler.cpp`
- Test: `firmware/test/test_scheduler/test_main.cpp`

**Interfaces:**
- Consumes: nothing.
- Produces:
```cpp
enum class ScheduleDays { Daily, Weekdays, Weekends };
struct ScheduleEntry { char id[16]; char petId[16]; int minuteOfDay; float portionG; bool enabled; ScheduleDays days; };
struct LocalTime { int year; int month; int day; int minuteOfDay; int weekday; }; // weekday 0=Sun
bool matchesDays(ScheduleDays days, int weekday);
bool isDue(const ScheduleEntry &e, const LocalTime &now);
```
and `class Scheduler` with `void setEntries(const ScheduleEntry*, int)`, `void markPastAsFired(const LocalTime&)`, `int dueIndex(const LocalTime&, bool timeSynced)`, `void markFired(int index, const LocalTime&)`.

Mirrors `lib/schedule.ts`. Same rules, and the same two traps: never back-fire on boot, and never treat an unparseable or unknown time as midnight.

- [ ] **Step 1: Write the failing test**

```cpp
#include <unity.h>
#include "domain/Scheduler.h"

void setUp() {}
void tearDown() {}

// 2026-08-24 is a Monday; 2026-08-22 a Saturday.
static LocalTime mon(int h, int m) { return LocalTime{2026, 8, 24, h * 60 + m, 1}; }
static LocalTime sat(int h, int m) { return LocalTime{2026, 8, 22, h * 60 + m, 6}; }

static ScheduleEntry entry(bool enabled = true, ScheduleDays days = ScheduleDays::Daily) {
    ScheduleEntry e{};
    // 06:30
    e.minuteOfDay = 390; e.portionG = 150.0f; e.enabled = enabled; e.days = days;
    e.id[0] = 'A'; e.id[1] = 0; e.petId[0] = 'P'; e.petId[1] = 0;
    return e;
}

void test_not_due_before_its_time() {
    TEST_ASSERT_FALSE(isDue(entry(), mon(6, 29)));
}

void test_due_exactly_at_its_time() {
    TEST_ASSERT_TRUE(isDue(entry(), mon(6, 30)));
}

void test_still_due_after_its_time_so_a_late_tick_fires() {
    TEST_ASSERT_TRUE(isDue(entry(), mon(6, 31)));
}

void test_disabled_is_never_due() {
    TEST_ASSERT_FALSE(isDue(entry(false), mon(9, 0)));
}

void test_weekdays_excludes_saturday() {
    TEST_ASSERT_FALSE(isDue(entry(true, ScheduleDays::Weekdays), sat(9, 0)));
    TEST_ASSERT_TRUE(isDue(entry(true, ScheduleDays::Weekends), sat(9, 0)));
}

void test_fires_once_per_day() {
    ScheduleEntry e = entry();
    Scheduler s; s.setEntries(&e, 1);
    TEST_ASSERT_EQUAL_INT(0, s.dueIndex(mon(6, 30), true));
    s.markFired(0, mon(6, 30));
    TEST_ASSERT_EQUAL_INT(-1, s.dueIndex(mon(6, 31), true));
    TEST_ASSERT_EQUAL_INT(-1, s.dueIndex(mon(9, 0), true));
}

void test_does_not_back_fire_times_already_past_at_boot() {
    // Powering on in the evening must not dump the day's missed meals at once.
    ScheduleEntry e = entry();
    Scheduler s; s.setEntries(&e, 1);
    s.markPastAsFired(mon(19, 0));
    TEST_ASSERT_EQUAL_INT(-1, s.dueIndex(mon(19, 1), true));
}

void test_never_fires_when_the_clock_has_not_synced() {
    // A feeder that guesses the time feeds at the wrong time, which is worse
    // than not feeding: the owner believes it is handled.
    ScheduleEntry e = entry();
    Scheduler s; s.setEntries(&e, 1);
    TEST_ASSERT_EQUAL_INT(-1, s.dueIndex(mon(6, 30), false));
}

void test_a_new_day_makes_it_eligible_again() {
    ScheduleEntry e = entry();
    Scheduler s; s.setEntries(&e, 1);
    s.markFired(0, mon(6, 30));
    LocalTime tue{2026, 8, 25, 390, 2};
    TEST_ASSERT_EQUAL_INT(0, s.dueIndex(tue, true));
}

int main(int, char **) {
    UNITY_BEGIN();
    RUN_TEST(test_not_due_before_its_time);
    RUN_TEST(test_due_exactly_at_its_time);
    RUN_TEST(test_still_due_after_its_time_so_a_late_tick_fires);
    RUN_TEST(test_disabled_is_never_due);
    RUN_TEST(test_weekdays_excludes_saturday);
    RUN_TEST(test_fires_once_per_day);
    RUN_TEST(test_does_not_back_fire_times_already_past_at_boot);
    RUN_TEST(test_never_fires_when_the_clock_has_not_synced);
    RUN_TEST(test_a_new_day_makes_it_eligible_again);
    return UNITY_END();
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd firmware && pio test -e native -f test_scheduler`
Expected: compile error — `domain/Scheduler.h` does not exist.

- [ ] **Step 3: Write the header**

```cpp
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
    int  minuteOfDay;   // 0..1439; -1 means unparseable and never fires
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

private:
    ScheduleEntry entries_[MAX_SCHEDULES]{};
    long firedOn_[MAX_SCHEDULES]{};   // yyyymmdd of the last firing, 0 = never
    int  count_ = 0;
    static long dayKey(const LocalTime &t);
};
```

- [ ] **Step 4: Write the implementation**

```cpp
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
```

- [ ] **Step 5: Run the tests**

Run: `cd firmware && pio test -e native -f test_scheduler`
Expected: `9 Tests 0 Failures`.

- [ ] **Step 6: Commit**

```bash
git add firmware/src/domain/Scheduler.* firmware/test/test_scheduler
git commit -m "Add the on-device scheduler"
```

---

### Task 4: StallDetector — stop grinding when nothing is arriving

**Files:**
- Create: `firmware/src/domain/StallDetector.h`, `firmware/src/domain/StallDetector.cpp`
- Test: `firmware/test/test_stall/test_main.cpp`

**Interfaces:**
- Consumes: `NOISE_BAND_G`, `STALL_SWEEPS` from `config.h`.
- Produces: `class StallDetector` with `void reset(float startingG)`, `void observe(float settledG)`, `bool stalled() const`.

- [ ] **Step 1: Write the failing test**

```cpp
#include <unity.h>
#include "domain/StallDetector.h"

void setUp() {}
void tearDown() {}

void test_does_not_stall_while_food_is_arriving() {
    StallDetector d; d.reset(0.0f);
    d.observe(8.0f); d.observe(16.0f); d.observe(24.0f); d.observe(32.0f);
    TEST_ASSERT_FALSE(d.stalled());
}

void test_stalls_after_three_unchanged_sweeps() {
    StallDetector d; d.reset(20.0f);
    d.observe(20.0f);
    TEST_ASSERT_FALSE(d.stalled());
    d.observe(20.0f);
    TEST_ASSERT_FALSE(d.stalled());
    d.observe(20.0f);
    TEST_ASSERT_TRUE(d.stalled());
}

void test_noise_within_the_band_still_counts_as_unchanged() {
    // A load cell drifts. Half a gram is not food arriving.
    StallDetector d; d.reset(20.0f);
    d.observe(20.4f); d.observe(19.7f); d.observe(20.2f);
    TEST_ASSERT_TRUE(d.stalled());
}

void test_real_movement_resets_the_count() {
    StallDetector d; d.reset(20.0f);
    d.observe(20.0f); d.observe(20.0f);
    d.observe(28.0f);                 // food arrived
    TEST_ASSERT_FALSE(d.stalled());
    d.observe(28.0f); d.observe(28.0f);
    TEST_ASSERT_FALSE(d.stalled());   // count restarted from the new level
    d.observe(28.0f);
    TEST_ASSERT_TRUE(d.stalled());
}

int main(int, char **) {
    UNITY_BEGIN();
    RUN_TEST(test_does_not_stall_while_food_is_arriving);
    RUN_TEST(test_stalls_after_three_unchanged_sweeps);
    RUN_TEST(test_noise_within_the_band_still_counts_as_unchanged);
    RUN_TEST(test_real_movement_resets_the_count);
    return UNITY_END();
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd firmware && pio test -e native -f test_stall`
Expected: compile error — `domain/StallDetector.h` does not exist.

- [ ] **Step 3: Write the header**

```cpp
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
```

- [ ] **Step 4: Write the implementation**

```cpp
#include "domain/StallDetector.h"
#include "config.h"

static float absf(float v) { return v < 0.0f ? -v : v; }

void StallDetector::reset(float startingG) {
    last_ = startingG;
    unchanged_ = 0;
}

void StallDetector::observe(float settledG) {
    if (absf(settledG - last_) <= NOISE_BAND_G) {
        unchanged_++;
    } else {
        unchanged_ = 0;
        last_ = settledG;
    }
}

bool StallDetector::stalled() const {
    return unchanged_ >= STALL_SWEEPS;
}
```

- [ ] **Step 5: Run the tests**

Run: `cd firmware && pio test -e native -f test_stall`
Expected: `4 Tests 0 Failures`.

- [ ] **Step 6: Commit**

```bash
git add firmware/src/domain/StallDetector.* firmware/test/test_stall
git commit -m "Add stall detection for the drum valve"
```

---

### Task 5: Portioner — the only thing that moves food

**Files:**
- Create: `firmware/src/domain/Portioner.h`, `firmware/src/domain/Portioner.cpp`
- Test: `firmware/test/test_portioner/test_main.cpp`

**Interfaces:**
- Consumes: `checkDailyLimit`, `StallDetector`, `GRAMS_PER_SWEEP`, `TOLERANCE_G`.
- Produces:
```cpp
enum class PortionAction { Sweep, Complete, Abort };
enum class PortionOutcome { None, Reached, Short, Stalled, RefusedLimit, RefusedBusy };
struct PortionStep { PortionAction action; PortionOutcome outcome; float actualG; };
class Portioner { bool begin(float targetG, float alreadyToday, float maxDaily, float bowlG);
                  PortionStep next(float settledBowlG);
                  bool active() const; int sweeps() const; PortionOutcome outcome() const; };
```

Deliberately a pure state machine: it never touches a servo or a scale, it is told the settled weight and says what to do next. That is what lets a whole feeding cycle run on a laptop.

- [ ] **Step 1: Write the failing test**

```cpp
#include <unity.h>
#include "domain/Portioner.h"

void setUp() {}
void tearDown() {}

/** Drive a cycle with a fake scale that adds `perSweep` grams each sweep. */
static PortionOutcome runCycle(float target, float perSweep, int maxIterations = 200) {
    Portioner p;
    TEST_ASSERT_TRUE(p.begin(target, 0.0f, 0.0f, 0.0f));
    float bowl = 0.0f;
    for (int i = 0; i < maxIterations; i++) {
        PortionStep s = p.next(bowl);
        if (s.action == PortionAction::Sweep) { bowl += perSweep; continue; }
        return s.outcome;
    }
    return PortionOutcome::None;
}

void test_reaches_the_target() {
    TEST_ASSERT_EQUAL_INT((int)PortionOutcome::Reached, (int)runCycle(120.0f, 8.0f));
}

void test_reports_the_settled_weight_not_the_target() {
    Portioner p;
    p.begin(100.0f, 0.0f, 0.0f, 0.0f);
    float bowl = 0.0f;
    PortionStep s = p.next(bowl);
    while (s.action == PortionAction::Sweep) { bowl += 9.0f; s = p.next(bowl); }
    // Overshoot is real: sweeps deliver whole pockets. The report must be honest.
    TEST_ASSERT_EQUAL_INT((int)PortionOutcome::Reached, (int)s.outcome);
    TEST_ASSERT_TRUE(s.actualG >= 100.0f);
    TEST_ASSERT_EQUAL_FLOAT(bowl, s.actualG);
}

void test_a_drum_that_delivers_nothing_stalls_rather_than_grinding() {
    TEST_ASSERT_EQUAL_INT((int)PortionOutcome::Stalled, (int)runCycle(120.0f, 0.0f));
}

void test_a_weak_drum_ends_short_at_the_sweep_ceiling() {
    // Delivering just above the noise band each time: never stalls, never
    // reaches, so the ceiling is what has to stop it.
    TEST_ASSERT_EQUAL_INT((int)PortionOutcome::Short, (int)runCycle(120.0f, 2.0f));
}

void test_refuses_to_start_when_the_daily_limit_would_break() {
    Portioner p;
    TEST_ASSERT_FALSE(p.begin(150.0f, 580.0f, 600.0f, 0.0f));
    TEST_ASSERT_EQUAL_INT((int)PortionOutcome::RefusedLimit, (int)p.outcome());
}

void test_refuses_a_second_concurrent_cycle() {
    Portioner p;
    TEST_ASSERT_TRUE(p.begin(100.0f, 0.0f, 0.0f, 0.0f));
    TEST_ASSERT_FALSE(p.begin(100.0f, 0.0f, 0.0f, 0.0f));
    TEST_ASSERT_EQUAL_INT((int)PortionOutcome::RefusedBusy, (int)p.outcome());
}

void test_counts_food_already_in_the_bowl_toward_the_target() {
    // Starting with 100 g present and asking for 120 needs far fewer sweeps
    // than starting empty; charging the animal for food already there would
    // overfeed it.
    Portioner p;
    p.begin(120.0f, 0.0f, 0.0f, 100.0f);
    float bowl = 100.0f;
    int sweeps = 0;
    PortionStep s = p.next(bowl);
    while (s.action == PortionAction::Sweep) { bowl += 8.0f; sweeps++; s = p.next(bowl); }
    TEST_ASSERT_EQUAL_INT((int)PortionOutcome::Reached, (int)s.outcome);
    TEST_ASSERT_TRUE(sweeps <= 4);
}

int main(int, char **) {
    UNITY_BEGIN();
    RUN_TEST(test_reaches_the_target);
    RUN_TEST(test_reports_the_settled_weight_not_the_target);
    RUN_TEST(test_a_drum_that_delivers_nothing_stalls_rather_than_grinding);
    RUN_TEST(test_a_weak_drum_ends_short_at_the_sweep_ceiling);
    RUN_TEST(test_refuses_to_start_when_the_daily_limit_would_break);
    RUN_TEST(test_refuses_a_second_concurrent_cycle);
    RUN_TEST(test_counts_food_already_in_the_bowl_toward_the_target);
    return UNITY_END();
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd firmware && pio test -e native -f test_portioner`
Expected: compile error — `domain/Portioner.h` does not exist.

- [ ] **Step 3: Write the header**

```cpp
#pragma once
#include "domain/StallDetector.h"

enum class PortionAction  { Sweep, Complete, Abort };
enum class PortionOutcome { None, Reached, Short, Stalled, RefusedLimit, RefusedBusy };

struct PortionStep {
    PortionAction  action;
    PortionOutcome outcome;
    float          actualG;   // the settled weight, never the target
};

/**
 * A pure state machine. It never touches a servo or a scale: it is told the
 * settled bowl weight and answers with what to do next. That is what lets a
 * whole feeding cycle be exercised on a laptop.
 */
class Portioner {
public:
    bool begin(float targetG, float alreadyToday, float maxDaily, float bowlG);
    PortionStep next(float settledBowlG);
    bool active() const { return active_; }
    int sweeps() const { return sweeps_; }
    PortionOutcome outcome() const { return outcome_; }

private:
    bool  active_ = false;
    float target_ = 0.0f;
    int   sweeps_ = 0;
    int   ceiling_ = 0;
    PortionOutcome outcome_ = PortionOutcome::None;
    StallDetector stall_;
};
```

- [ ] **Step 4: Write the implementation**

```cpp
#include "domain/Portioner.h"
#include "domain/DailyLimit.h"
#include "config.h"

static int sweepCeiling(float targetG) {
    // Generous, because kibble density varies — but finite, because a drum
    // that turns without delivering has to stop rather than grind.
    int nominal = (int)((targetG / GRAMS_PER_SWEEP) + 0.999f);
    return nominal * 2 + 3;
}

bool Portioner::begin(float targetG, float alreadyToday, float maxDaily, float bowlG) {
    if (active_) { outcome_ = PortionOutcome::RefusedBusy; return false; }

    DailyLimitCheck limit = checkDailyLimit(alreadyToday, targetG, maxDaily);
    if (!limit.allowed) { outcome_ = PortionOutcome::RefusedLimit; return false; }

    active_  = true;
    target_  = targetG;
    sweeps_  = 0;
    ceiling_ = sweepCeiling(targetG);
    outcome_ = PortionOutcome::None;
    stall_.reset(bowlG);
    return true;
}

PortionStep Portioner::next(float settledBowlG) {
    if (!active_) return PortionStep{ PortionAction::Complete, outcome_, settledBowlG };

    if (settledBowlG >= target_ - TOLERANCE_G) {
        active_ = false;
        outcome_ = PortionOutcome::Reached;
        return PortionStep{ PortionAction::Complete, outcome_, settledBowlG };
    }

    if (sweeps_ > 0) {
        stall_.observe(settledBowlG);
        if (stall_.stalled()) {
            active_ = false;
            outcome_ = PortionOutcome::Stalled;
            return PortionStep{ PortionAction::Abort, outcome_, settledBowlG };
        }
    }

    if (sweeps_ >= ceiling_) {
        active_ = false;
        outcome_ = PortionOutcome::Short;
        return PortionStep{ PortionAction::Complete, outcome_, settledBowlG };
    }

    sweeps_++;
    return PortionStep{ PortionAction::Sweep, PortionOutcome::None, settledBowlG };
}
```

- [ ] **Step 5: Run the tests**

Run: `cd firmware && pio test -e native -f test_portioner`
Expected: `7 Tests 0 Failures`. If `test_a_weak_drum_ends_short_at_the_sweep_ceiling` instead reports `Stalled`, the noise band is swallowing the 2 g increments — that is a real interaction between `NOISE_BAND_G` and the test's per-sweep delivery, so change the test's delivery to `NOISE_BAND_G * 2` rather than widening the band.

- [ ] **Step 6: Run every native test together**

Run: `cd firmware && pio test -e native`
Expected: all suites pass — harness, daily limit, scheduler, stall, portioner.

- [ ] **Step 7: Commit**

```bash
git add firmware/src/domain/Portioner.* firmware/test/test_portioner
git commit -m "Add the portioning state machine"
```

---

### Task 6: Telemetry payload and command parsing

**Files:**
- Create: `firmware/src/domain/Payload.h`, `firmware/src/domain/Payload.cpp`, `firmware/src/domain/CommandLog.h`, `firmware/src/domain/CommandLog.cpp`
- Test: `firmware/test/test_payload/test_main.cpp`

**Interfaces:**
- Consumes: nothing.
- Produces: `struct TelemetrySnapshot { ... }; int buildTelemetryJson(const TelemetrySnapshot&, char* out, int cap);` and `class CommandLog` with `bool seen(const char* id)`, `void remember(const char* id)`.

The payload is built by hand rather than with a JSON library so it can be tested natively without pulling ArduinoJson into the host build. It is a fixed, small shape.

- [ ] **Step 1: Write the failing test**

```cpp
#include <unity.h>
#include <cstring>
#include "domain/Payload.h"
#include "domain/CommandLog.h"

void setUp() {}
void tearDown() {}

static TelemetrySnapshot sample() {
    TelemetrySnapshot t{};
    std::strcpy(t.deviceId, "ESP32-PETFEEDER-001");
    t.ts = 1755676800; t.distanceCm = 18; t.bowlG = 125.4f; t.hopperG = 742.0f;
    std::strcpy(t.servo, "DISPENSING");
    std::strcpy(t.detectionState, "detected");
    t.rssi = -58; std::strcpy(t.ip, "192.168.0.114");
    t.uptimeS = 183642; t.timeSynced = true;
    return t;
}

void test_payload_contains_every_field_the_dashboard_parses() {
    char buf[512];
    TEST_ASSERT_TRUE(buildTelemetryJson(sample(), buf, sizeof(buf)) > 0);
    for (const char *key : { "deviceId", "ts", "distanceCm", "bowlG", "hopperG",
                             "servo", "detection", "wifi", "uptimeS", "timeSynced" }) {
        TEST_ASSERT_NOT_NULL_MESSAGE(std::strstr(buf, key), key);
    }
}

void test_payload_reports_presence_not_identity_in_milestone_one() {
    char buf[512];
    buildTelemetryJson(sample(), buf, sizeof(buf));
    TEST_ASSERT_NOT_NULL(std::strstr(buf, "\"petId\":null"));
}

void test_payload_refuses_to_overflow_its_buffer() {
    char tiny[16];
    TEST_ASSERT_EQUAL_INT(-1, buildTelemetryJson(sample(), tiny, sizeof(tiny)));
}

void test_a_command_id_is_only_acted_on_once() {
    // RTDB delivers at least once. Acting twice on feeding.start feeds the
    // animal twice.
    CommandLog log;
    TEST_ASSERT_FALSE(log.seen("cmd-1"));
    log.remember("cmd-1");
    TEST_ASSERT_TRUE(log.seen("cmd-1"));
    TEST_ASSERT_FALSE(log.seen("cmd-2"));
}

void test_the_command_log_forgets_the_oldest_first() {
    CommandLog log;
    char id[8];
    for (int i = 0; i < COMMAND_MEMORY + 2; i++) { std::sprintf(id, "c%d", i); log.remember(id); }
    TEST_ASSERT_FALSE(log.seen("c0"));                       // evicted
    std::sprintf(id, "c%d", COMMAND_MEMORY + 1);
    TEST_ASSERT_TRUE(log.seen(id));                          // most recent kept
}

int main(int, char **) {
    UNITY_BEGIN();
    RUN_TEST(test_payload_contains_every_field_the_dashboard_parses);
    RUN_TEST(test_payload_reports_presence_not_identity_in_milestone_one);
    RUN_TEST(test_payload_refuses_to_overflow_its_buffer);
    RUN_TEST(test_a_command_id_is_only_acted_on_once);
    RUN_TEST(test_the_command_log_forgets_the_oldest_first);
    return UNITY_END();
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `cd firmware && pio test -e native -f test_payload`
Expected: compile error — the headers do not exist.

- [ ] **Step 3: Write `Payload.h`**

```cpp
#pragma once

struct TelemetrySnapshot {
    char  deviceId[32];
    long  ts;
    float distanceCm;
    float bowlG;
    float hopperG;
    char  servo[16];            // "READY" | "DISPENSING"
    char  detectionState[16];   // milestone one: "idle" | "detected"
    int   rssi;
    char  ip[16];
    long  uptimeS;
    bool  timeSynced;
};

/** Returns bytes written, or -1 if the buffer is too small. */
int buildTelemetryJson(const TelemetrySnapshot &t, char *out, int cap);
```

- [ ] **Step 4: Write `Payload.cpp`**

```cpp
#include "domain/Payload.h"
#include <cstdio>

int buildTelemetryJson(const TelemetrySnapshot &t, char *out, int cap) {
    // Built by hand rather than with a JSON library so it can be tested on the
    // host without pulling ArduinoJson into the native build. The shape is
    // fixed and small; see docs/ARCHITECTURE.md.
    int n = std::snprintf(
        out, cap,
        "{\"deviceId\":\"%s\",\"ts\":%ld,\"distanceCm\":%.1f,\"bowlG\":%.1f,"
        "\"hopperG\":%.1f,\"servo\":\"%s\","
        "\"detection\":{\"state\":\"%s\",\"petId\":null,\"confidence\":0},"
        "\"wifi\":{\"rssi\":%d,\"ip\":\"%s\"},\"uptimeS\":%ld,\"timeSynced\":%s}",
        t.deviceId, t.ts, t.distanceCm, t.bowlG, t.hopperG, t.servo,
        t.detectionState, t.rssi, t.ip, t.uptimeS, t.timeSynced ? "true" : "false");
    if (n < 0 || n >= cap) return -1;
    return n;
}
```

- [ ] **Step 5: Write `CommandLog.h` and `CommandLog.cpp`**

```cpp
#pragma once
#include "config.h"

/**
 * Remembers recently-acted command ids. RTDB delivery is at-least-once and a
 * reconnect can re-present a command already handled; acting twice on
 * feeding.start feeds the animal twice.
 */
class CommandLog {
public:
    bool seen(const char *id) const;
    void remember(const char *id);

private:
    char ids_[COMMAND_MEMORY][40]{};
    int  next_ = 0;
};
```

```cpp
#include "domain/CommandLog.h"
#include <cstring>

bool CommandLog::seen(const char *id) const {
    for (int i = 0; i < COMMAND_MEMORY; i++) {
        if (ids_[i][0] && std::strncmp(ids_[i], id, sizeof(ids_[0]) - 1) == 0) return true;
    }
    return false;
}

void CommandLog::remember(const char *id) {
    std::strncpy(ids_[next_], id, sizeof(ids_[0]) - 1);
    ids_[next_][sizeof(ids_[0]) - 1] = '\0';
    next_ = (next_ + 1) % COMMAND_MEMORY;   // ring buffer: oldest is overwritten
}
```

- [ ] **Step 6: Run the tests**

Run: `cd firmware && pio test -e native -f test_payload`
Expected: `5 Tests 0 Failures`.

- [ ] **Step 7: Commit**

```bash
git add firmware/src/domain/Payload.* firmware/src/domain/CommandLog.* firmware/test/test_payload
git commit -m "Add telemetry payload building and command de-duplication"
```

---

### Task 7: Drivers

**Files:**
- Create: `firmware/src/drivers/Scale.h`, `firmware/src/drivers/Scale.cpp`, `firmware/src/drivers/Ranger.h`, `firmware/src/drivers/Ranger.cpp`, `firmware/src/drivers/Drum.h`, `firmware/src/drivers/Drum.cpp`
- Test: none native — these are the hardware boundary. Verified on the bench.

**Interfaces:**
- Consumes: `config.h`.
- Produces: `class Scale { void begin(); void tare(); float readBowlSettled(); float readHopper(); void setCalibration(float bowlScale, float hopperScale, long bowlOffset, long hopperOffset); }`, `class Ranger { void begin(); float readCm(); }`, `class Drum { void begin(); void closeNow(); void sweep(); }`.

- [ ] **Step 1: Write `Drum.h` / `Drum.cpp`**

```cpp
#pragma once
class Drum {
public:
    void begin();
    /** Commanded closed. Called in setup() before anything else. */
    void closeNow();
    /** One 180-degree pocket sweep: fill, carry, drop, return. */
    void sweep();
};
```

```cpp
#include "drivers/Drum.h"
#include "config.h"
#include <ESP32Servo.h>

static Servo servo;

void Drum::begin() {
    servo.setPeriodHertz(50);
    servo.attach(PIN_SERVO, 500, 2400);
    closeNow();
}

void Drum::closeNow() {
    servo.write(SERVO_CLOSED_DEG);
}

void Drum::sweep() {
    servo.write(SERVO_OPEN_DEG);
    delay(SWEEP_TRAVEL_MS);
    servo.write(SERVO_CLOSED_DEG);
    delay(SWEEP_TRAVEL_MS);
}
```

- [ ] **Step 2: Write `Ranger.h` / `Ranger.cpp`**

```cpp
#pragma once
class Ranger {
public:
    void begin();
    /** Median-filtered distance in cm; negative when nothing echoed. */
    float readCm();
};
```

```cpp
#include "drivers/Ranger.h"
#include "config.h"
#include <Arduino.h>

void Ranger::begin() {
    pinMode(PIN_SR04_TRIG, OUTPUT);
    digitalWrite(PIN_SR04_TRIG, LOW);   // strapping pin: must be LOW at boot
    pinMode(PIN_SR04_ECHO, INPUT);      // 5V echo arrives through a 1k/2k divider
}

static float onePing() {
    digitalWrite(PIN_SR04_TRIG, LOW);  delayMicroseconds(2);
    digitalWrite(PIN_SR04_TRIG, HIGH); delayMicroseconds(10);
    digitalWrite(PIN_SR04_TRIG, LOW);
    unsigned long us = pulseIn(PIN_SR04_ECHO, HIGH, 30000UL);
    if (us == 0) return -1.0f;
    return (float)us / 58.0f;
}

float Ranger::readCm() {
    float a = onePing(), b = onePing(), c = onePing();
    // Median of three: a single ping off a curved bowl is unreliable.
    if (a > b) { float t = a; a = b; b = t; }
    if (b > c) { float t = b; b = c; c = t; }
    if (a > b) { float t = a; a = b; b = t; }
    return b;
}
```

- [ ] **Step 3: Write `Scale.h` / `Scale.cpp`**

```cpp
#pragma once
class Scale {
public:
    void begin();
    void setCalibration(float bowlScale, float hopperScale, long bowlOffset, long hopperOffset);
    /** Median of SAMPLE_COUNT readings on channel A. */
    float readBowlSettled();
    /** Channel B. Only meaningful when idle: see the comment in the cpp. */
    float readHopper();
    void tareBowl();
};
```

```cpp
#include "drivers/Scale.h"
#include "config.h"
#include <HX711.h>

static HX711 hx;
static float bowlScale_ = 1.0f, hopperScale_ = 1.0f;
static long  bowlOffset_ = 0,   hopperOffset_ = 0;

void Scale::begin() { hx.begin(PIN_HX711_DOUT, PIN_HX711_SCK); }

void Scale::setCalibration(float bs, float hs, long bo, long ho) {
    bowlScale_ = bs; hopperScale_ = hs; bowlOffset_ = bo; hopperOffset_ = ho;
}

static long medianOf(int gain, int samples) {
    long v[SAMPLE_COUNT];
    if (samples > SAMPLE_COUNT) samples = SAMPLE_COUNT;
    hx.set_gain(gain);
    hx.read();                       // discarded: the HX711 needs one reading
                                     // after a channel switch before it is valid
    for (int i = 0; i < samples; i++) v[i] = hx.read();
    for (int i = 1; i < samples; i++) {          // insertion sort, tiny n
        long k = v[i]; int j = i - 1;
        while (j >= 0 && v[j] > k) { v[j + 1] = v[j]; j--; }
        v[j + 1] = k;
    }
    return v[samples / 2];
}

float Scale::readBowlSettled() {
    return (float)(medianOf(128, SAMPLE_COUNT) - bowlOffset_) / bowlScale_;
}

float Scale::readHopper() {
    // Channel B. Switching channels costs a discarded reading, so this must NOT
    // be called during a cycle — the bowl reading is what closes the loop and it
    // needs every sample it can get. Call only when idle and settled.
    return (float)(medianOf(32, SAMPLE_COUNT) - hopperOffset_) / hopperScale_;
}

void Scale::tareBowl() { bowlOffset_ = medianOf(128, SAMPLE_COUNT); }
```

- [ ] **Step 4: Confirm the device build compiles**

Run: `cd firmware && pio run -e esp32cam`
Expected: `SUCCESS`. This is the first task that pulls in the Arduino libraries, so a failure here is most likely an unresolved `lib_deps` version — bump it and record the working version in `platformio.ini`.

- [ ] **Step 5: Confirm the native tests still pass**

Run: `cd firmware && pio test -e native`
Expected: unchanged. If a driver header leaked into `domain/`, this is where it shows up as a native build failure.

- [ ] **Step 6: Commit**

```bash
git add firmware/src/drivers
git commit -m "Add HX711, HC-SR04 and servo drivers"
```

---

### Task 8: Persistence — calibration and schedules that survive a power cut

**Files:**
- Create: `firmware/src/net/Store.h`, `firmware/src/net/Store.cpp`
- Test: none native — `Preferences` is an ESP32 API.

**Interfaces:**
- Consumes: `ScheduleEntry` from Task 3.
- Produces: `class Store { void begin(); void saveCalibration(float,float,long,long); bool loadCalibration(float&,float&,long&,long&); void saveSchedules(const ScheduleEntry*, int); int loadSchedules(ScheduleEntry*, int); void saveConfig(float,float,int); bool loadConfig(float&,float&,int&); }`.

Calibration is a property of the built machine, not the design. A feeder that forgets it on a power cut over- or under-feeds silently.

- [ ] **Step 1: Write `Store.h`**

```cpp
#pragma once
#include "domain/Scheduler.h"

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
```

- [ ] **Step 2: Write `Store.cpp`**

```cpp
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
```

- [ ] **Step 3: Confirm it compiles**

Run: `cd firmware && pio run -e esp32cam`
Expected: SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add firmware/src/net/Store.*
git commit -m "Persist calibration, schedules and config to NVS"
```

---

### Task 9: Network — time, telemetry and commands

**Files:**
- Create: `firmware/src/net/TimeSync.h`, `firmware/src/net/TimeSync.cpp`, `firmware/src/net/Rtdb.h`, `firmware/src/net/Rtdb.cpp`
- Test: none native.

**Interfaces:**
- Consumes: `secrets.h`, `LocalTime` from Task 3, `TelemetrySnapshot` from Task 6.
- Produces: `class TimeSync { void begin(int tzOffsetMinutes); bool synced() const; LocalTime now() const; void maybeResync(); }` and `class Rtdb { bool begin(); void publishTelemetry(const char* json); bool readCommand(char* idOut, char* typeOut, char* payloadOut, int cap); void ackCommand(const char* id, bool ok, const char* message); void clearCommand(); bool readSchedules(ScheduleEntry* out, int cap, int& countOut); }`.

- [ ] **Step 1: Write `TimeSync.h` / `TimeSync.cpp`**

```cpp
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
```

```cpp
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
```

- [ ] **Step 2: Write `Rtdb.h` / `Rtdb.cpp`**

`Rtdb.cpp` wraps the Firebase client. Paths, exactly as the spec's §5 defines them:

```cpp
#include "net/Rtdb.h"
#include "config.h"
#include "secrets.h"
#include <Firebase_ESP_Client.h>

static FirebaseData  fbdo;
static FirebaseAuth  auth;
static FirebaseConfig cfg;

static String basePath() { return String("devices/") + DEVICE_ID; }

bool Rtdb::begin() {
    cfg.api_key = FIREBASE_API_KEY;
    cfg.database_url = FIREBASE_DATABASE_URL;
    // The device signs in as ITS OWN user. Rules grant that uid write access to
    // devices/<its id> and nothing else; it never holds a member's credentials.
    auth.user.email = DEVICE_EMAIL;
    auth.user.password = DEVICE_PASSWORD;
    Firebase.begin(&cfg, &auth);
    Firebase.reconnectWiFi(true);
    return Firebase.ready();
}

void Rtdb::publishTelemetry(const char *json) {
    if (!Firebase.ready()) return;    // telemetry is lossy on purpose: missed
                                      // telemetry is not missed food
    Firebase.RTDB.setJSON(&fbdo, (basePath() + "/telemetry").c_str(),
                          new FirebaseJson(String(json)));
}

bool Rtdb::readCommand(char *idOut, char *typeOut, char *payloadOut, int cap) {
    if (!Firebase.ready()) return false;
    if (!Firebase.RTDB.getJSON(&fbdo, (basePath() + "/command").c_str())) return false;
    FirebaseJson &j = fbdo.jsonObject();
    FirebaseJsonData d;
    if (!j.get(d, "id") || d.stringValue.length() == 0) return false;
    snprintf(idOut, cap, "%s", d.stringValue.c_str());
    if (j.get(d, "type"))    snprintf(typeOut, cap, "%s", d.stringValue.c_str());
    if (j.get(d, "payload")) snprintf(payloadOut, cap, "%s", d.stringValue.c_str());
    return true;
}

void Rtdb::ackCommand(const char *id, bool ok, const char *message) {
    FirebaseJson ack;
    ack.set("ok", ok);
    ack.set("message", message);
    Firebase.RTDB.setJSON(&fbdo, (basePath() + "/ack/" + id).c_str(), &ack);
}

void Rtdb::clearCommand() {
    Firebase.RTDB.deleteNode(&fbdo, (basePath() + "/command").c_str());
}
```

Write `Rtdb.h` to match those signatures, plus `bool readSchedules(ScheduleEntry *out, int cap, int &countOut);` which reads `devices/{id}/schedule` and fills the array, returning false when the node is absent.

- [ ] **Step 3: Confirm it compiles**

Run: `cd firmware && pio run -e esp32cam`
Expected: SUCCESS. The Firebase client is the heaviest dependency; if the build overflows flash, enable a larger partition scheme with `board_build.partitions = huge_app.csv` in `platformio.ini`.

- [ ] **Step 4: Commit**

```bash
git add firmware/src/net/TimeSync.* firmware/src/net/Rtdb.*
git commit -m "Add NTP time sync and the RTDB transport"
```

---

### Task 10: `main.cpp` — wiring, the state machine, and fail-safe

**Files:**
- Create: `firmware/src/main.cpp`
- Test: none native.

**Interfaces:**
- Consumes: every class from Tasks 2–9.
- Produces: the firmware.

- [ ] **Step 1: Write `setup()`, closing the servo first**

```cpp
#include <Arduino.h>
#include <WiFi.h>
#include <esp_task_wdt.h>
#include "config.h"
#include "secrets.h"
#include "drivers/Drum.h"
#include "drivers/Ranger.h"
#include "drivers/Scale.h"
#include "domain/Portioner.h"
#include "domain/Scheduler.h"
#include "domain/Payload.h"
#include "domain/CommandLog.h"
#include "net/Rtdb.h"
#include "net/Store.h"
#include "net/TimeSync.h"

static Drum drum; static Ranger ranger; static Scale scale;
static Portioner portioner; static Scheduler scheduler; static CommandLog cmdLog;
static Rtdb rtdb; static Store store; static TimeSync clockSync;

static float dailyTotal = 0.0f;     // grams delivered to the current pet today
static float maxDaily = 600.0f;
static char  currentPet[16] = {0};

void setup() {
    Serial.begin(115200);

    // FIRST. A reboot mid-pour must not leave the drum open, so the servo is
    // commanded closed before Wi-Fi, before Firebase, before anything.
    drum.begin();
    drum.closeNow();

    esp_task_wdt_init(30, true);
    esp_task_wdt_add(NULL);

    scale.begin();
    ranger.begin();
    store.begin();

    float bs, hs; long bo, ho;
    if (store.loadCalibration(bs, hs, bo, ho)) scale.setCalibration(bs, hs, bo, ho);

    float dp; int tz = 0;
    store.loadConfig(dp, maxDaily, tz);

    ScheduleEntry cached[MAX_SCHEDULES];
    int n = store.loadSchedules(cached, MAX_SCHEDULES);
    if (n > 0) scheduler.setEntries(cached, n);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
        delay(250); esp_task_wdt_reset();
    }

    clockSync.begin(tz);
    if (clockSync.synced()) scheduler.markPastAsFired(clockSync.now());
    rtdb.begin();
}
```

- [ ] **Step 2: Write the cycle runner**

```cpp
/**
 * Runs one feeding cycle to completion. Blocking on purpose: nothing else may
 * move the drum while this is running, and the watchdog is fed inside the loop.
 */
static void runCycle(const char *petId, float targetG, const char *trigger) {
    float bowl = scale.readBowlSettled();
    if (!portioner.begin(targetG, dailyTotal, maxDaily, bowl)) return;

    snprintf(currentPet, sizeof(currentPet), "%s", petId);

    for (;;) {
        esp_task_wdt_reset();
        PortionStep step = portioner.next(scale.readBowlSettled());
        if (step.action == PortionAction::Sweep) { drum.sweep(); delay(SETTLE_MS); continue; }

        drum.closeNow();
        float delivered = step.actualG - bowl;
        if (delivered > 0.0f) dailyTotal += delivered;
        // The dashboard derives Completed / Under-dispensed from target vs
        // actual, so reporting the settled weight is what makes that honest.
        return;
    }
}
```

- [ ] **Step 3: Write `loop()`**

```cpp
void loop() {
    esp_task_wdt_reset();
    clockSync.maybeResync();

    // Commands.
    char id[40] = {0}, type[32] = {0}, payload[192] = {0};
    if (rtdb.readCommand(id, type, payload, sizeof(payload))) {
        if (!cmdLog.seen(id)) {
            cmdLog.remember(id);
            // Handle each of the five types here; feeding.start parses petId
            // and portionG from `payload` and calls runCycle.
            rtdb.ackCommand(id, true, "accepted");
        }
        rtdb.clearCommand();
    }

    // Schedules. Wi-Fi may be down; the cached schedule and the local clock are
    // enough, because a pet must not miss a meal because a router rebooted.
    if (clockSync.synced()) {
        LocalTime now = clockSync.now();
        int due = scheduler.dueIndex(now, true);
        if (due >= 0) {
            scheduler.markFired(due, now);
            // runCycle for that entry's pet and portion.
        }
    }

    // Telemetry.
    static unsigned long lastPublish = 0;
    unsigned long interval = portioner.active() ? TELEMETRY_BUSY_MS : TELEMETRY_IDLE_MS;
    if (millis() - lastPublish >= interval) {
        lastPublish = millis();
        TelemetrySnapshot t{};
        snprintf(t.deviceId, sizeof(t.deviceId), "%s", DEVICE_ID);
        t.ts = (long)time(nullptr);
        t.distanceCm = ranger.readCm();
        t.bowlG = scale.readBowlSettled();
        // Channel B only while idle: switching mid-cycle costs the bowl a sample.
        if (!portioner.active()) t.hopperG = scale.readHopper();
        snprintf(t.servo, sizeof(t.servo), portioner.active() ? "DISPENSING" : "READY");
        snprintf(t.detectionState, sizeof(t.detectionState),
                 (t.distanceCm > 0 && t.distanceCm < 60) ? "detected" : "idle");
        t.rssi = WiFi.RSSI();
        snprintf(t.ip, sizeof(t.ip), "%s", WiFi.localIP().toString().c_str());
        t.uptimeS = millis() / 1000;
        t.timeSynced = clockSync.synced();

        char json[512];
        if (buildTelemetryJson(t, json, sizeof(json)) > 0) rtdb.publishTelemetry(json);
    }
}
```

- [ ] **Step 4: Fill in the five command handlers**

In the block marked in Step 3, implement each: `feeding.start` (parse `petId`, `portionG`, call `runCycle`), `feeding.stop` (`portioner` abort and `drum.closeNow()`), `portion.update` and `schedule.update` (persist via `store`, re-inject into `scheduler`), and `device.config` (`tare` → `scale.tareBowl()` and `store.saveCalibration`, `ping` → ack only, `restart` → `drum.closeNow()` then `ESP.restart()`).

**`restart` must close the drum before restarting.** The reset is immediate and the servo holds its last commanded position.

- [ ] **Step 5: Confirm it compiles**

Run: `cd firmware && pio run -e esp32cam`
Expected: SUCCESS.

- [ ] **Step 6: Confirm the native tests still pass**

Run: `cd firmware && pio test -e native`
Expected: all suites pass. `main.cpp` is excluded from the native build by `test_ignore`/env separation; if it is being compiled into the native environment, add `src_filter` to the native env rather than moving logic out of `domain/`.

- [ ] **Step 7: Commit**

```bash
git add firmware/src/main.cpp
git commit -m "Wire the firmware state machine with fail-safe servo close"
```

---

### Task 11: RTDB security rules and firmware documentation

**Files:**
- Create: `database.rules.json`, `firmware/README.md`
- Modify: `firebase.json`, `SETUP.md`

**Interfaces:**
- Consumes: the paths from Task 9.
- Produces: the rules that make the device's identity mean something.

- [ ] **Step 1: Write `database.rules.json`**

```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        ".read": "auth != null && root.child('households').child(auth.uid).exists() || auth.uid === $deviceId",
        "telemetry": { ".write": "auth != null && auth.token.email === root.child('deviceAuth').child($deviceId).child('email').val()" },
        "ack":       { ".write": "auth != null && auth.token.email === root.child('deviceAuth').child($deviceId).child('email').val()" },
        "command":   { ".write": "auth != null" },
        "schedule":  { ".write": "auth != null" },
        "config":    { ".write": "auth != null" }
      }
    }
  }
}
```

These rules are **the weakest part of this plan** and must be reviewed before deploying: they permit any signed-in user to write a command to any device. Tightening that needs a household-to-device mapping in RTDB mirroring the Firestore one, which milestone one does not build. Until then, do not point this at a project with real users.

- [ ] **Step 2: Register the rules in `firebase.json`**

Add alongside the existing `firestore` block:

```json
"database": { "rules": "database.rules.json" }
```

- [ ] **Step 3: Write `firmware/README.md`**

Cover: what milestone one does and does not do (no vision), the two build commands, how to create `secrets.h` from the example, how to create the device's Firebase Auth user, that `pio test -e native` is the only automated verification and covers `domain/` only, and — prominently — that **every timing constant in `config.h` is a guess until measured**, pointing at `design/CALIBRATION.md`.

Open with the same warning `design/README.md` carries: this is not a substitute for supervised feeding.

- [ ] **Step 4: Add a firmware section to `SETUP.md`**

Three lines: where the firmware lives, that it needs its own Firebase Auth user, and that RTDB rules must be deployed with `npx firebase deploy --only database`.

- [ ] **Step 5: Final verification**

```bash
cd firmware && pio test -e native && pio run -e esp32cam
cd .. && npm test && npm run typecheck && npm run lint
```

Expected: firmware tests pass, device build succeeds, and the dashboard's 127 tests are untouched.

- [ ] **Step 6: Commit**

```bash
git add database.rules.json firebase.json firmware/README.md SETUP.md
git commit -m "Add RTDB rules and firmware documentation"
```

---

## Definition of Done

- `pio test -e native` passes every domain suite; `pio run -e esp32cam` builds.
- The servo is commanded closed in `setup()` before Wi-Fi.
- Schedules do not fire when `timeSynced` is false, and do not back-fire after a boot.
- A command id is acted on at most once.
- The daily maximum is enforced on every path, including scheduled feeds.
- `actualG` reported is always the settled weight.
- `secrets.h` is git-ignored and only the example is committed.
- The dashboard's own test suites are unaffected.

## Out of Scope

Vision and pet identification; OTA updates; more than one device per household; battery operation; a household-to-device mapping in RTDB (which is what the Task 11 rules need before real use).

## Self-review

**Spec coverage.** §1 interface → Tasks 6, 9, 10. §2 decisions → Task 1. §3 layering → the file structure across 2–10. §4 authority → Tasks 2, 3, 5, enforced in 10. §5 data model → Tasks 6, 9, 11. §6 dispensing loop → Task 5. §7 sensing → Task 7. §8 time → Tasks 3, 9. §9 fail-safe → Task 10. §10 testing → Tasks 2–6. §11 out of scope → respected. §12 honesty → Task 11's README.

**Known weakness.** The Task 11 RTDB rules let any signed-in user write a command to any device, and the plan says so in place rather than hiding it. Closing that needs a household-to-device mapping that milestone one does not build.

**Type consistency.** `LocalTime`, `ScheduleEntry`, `ScheduleDays`, `PortionStep`, `PortionOutcome`, `TelemetrySnapshot` and `DailyLimitCheck` are each defined once and used with those exact names throughout. `readBowlSettled()`, `readHopper()`, `tareBowl()`, `closeNow()`, `sweep()`, `readCm()` match between their driver headers and `main.cpp`.
