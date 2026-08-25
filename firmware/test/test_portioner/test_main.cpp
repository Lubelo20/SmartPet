#include <unity.h>
#include "domain/Portioner.h"
#include "config.h"

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
    TEST_ASSERT_EQUAL_FLOAT(bowl, s.actualG);
}

void test_a_drum_that_delivers_nothing_stalls_rather_than_grinding() {
    TEST_ASSERT_EQUAL_INT((int)PortionOutcome::Stalled, (int)runCycle(120.0f, 0.0f));
}

void test_a_weak_drum_ends_short_at_the_sweep_ceiling() {
    // Delivering just above the noise band each time: never stalls, never
    // reaches, so the ceiling is what has to stop it.
    TEST_ASSERT_EQUAL_INT((int)PortionOutcome::Short, (int)runCycle(120.0f, NOISE_BAND_G * 2.0f));
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
    // Charging the animal for food already in the bowl would overfeed it.
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
