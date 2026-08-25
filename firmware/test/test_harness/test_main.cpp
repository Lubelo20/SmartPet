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
