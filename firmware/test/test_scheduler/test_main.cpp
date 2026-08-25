#include <unity.h>
#include "domain/Scheduler.h"

void setUp() {}
void tearDown() {}

// 2026-08-24 is a Monday; 2026-08-22 a Saturday.
static LocalTime mon(int h, int m) { return LocalTime{2026, 8, 24, h * 60 + m, 1}; }
static LocalTime sat(int h, int m) { return LocalTime{2026, 8, 22, h * 60 + m, 6}; }

static ScheduleEntry entry(bool enabled = true, ScheduleDays days = ScheduleDays::Daily) {
    ScheduleEntry e{};
    e.minuteOfDay = 390; e.portionG = 150.0f; e.enabled = enabled; e.days = days;
    e.id[0] = 'A'; e.id[1] = 0; e.petId[0] = 'P'; e.petId[1] = 0;
    return e;
}

void test_not_due_before_its_time() { TEST_ASSERT_FALSE(isDue(entry(), mon(6, 29))); }
void test_due_exactly_at_its_time() { TEST_ASSERT_TRUE(isDue(entry(), mon(6, 30))); }
void test_still_due_after_its_time_so_a_late_tick_fires() { TEST_ASSERT_TRUE(isDue(entry(), mon(6, 31))); }
void test_disabled_is_never_due() { TEST_ASSERT_FALSE(isDue(entry(false), mon(9, 0))); }

void test_weekdays_excludes_saturday() {
    TEST_ASSERT_FALSE(isDue(entry(true, ScheduleDays::Weekdays), sat(9, 0)));
    TEST_ASSERT_TRUE(isDue(entry(true, ScheduleDays::Weekends), sat(9, 0)));
}

void test_unparseable_time_never_fires() {
    ScheduleEntry e = entry(); e.minuteOfDay = -1;
    TEST_ASSERT_FALSE(isDue(e, mon(23, 59)));
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
    ScheduleEntry e = entry();
    Scheduler s; s.setEntries(&e, 1);
    s.markPastAsFired(mon(19, 0));
    TEST_ASSERT_EQUAL_INT(-1, s.dueIndex(mon(19, 1), true));
}

void test_never_fires_when_the_clock_has_not_synced() {
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
    RUN_TEST(test_unparseable_time_never_fires);
    RUN_TEST(test_fires_once_per_day);
    RUN_TEST(test_does_not_back_fire_times_already_past_at_boot);
    RUN_TEST(test_never_fires_when_the_clock_has_not_synced);
    RUN_TEST(test_a_new_day_makes_it_eligible_again);
    return UNITY_END();
}
