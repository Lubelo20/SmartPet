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
