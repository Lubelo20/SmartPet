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
    d.observe(20.0f); TEST_ASSERT_FALSE(d.stalled());
    d.observe(20.0f); TEST_ASSERT_FALSE(d.stalled());
    d.observe(20.0f); TEST_ASSERT_TRUE(d.stalled());
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
    d.observe(28.0f);
    TEST_ASSERT_FALSE(d.stalled());
    d.observe(28.0f); d.observe(28.0f);
    TEST_ASSERT_FALSE(d.stalled());
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
