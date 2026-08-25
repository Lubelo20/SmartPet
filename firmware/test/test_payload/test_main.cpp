#include <unity.h>
#include <cstring>
#include <cstdio>
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
    const char *keys[] = { "deviceId", "ts", "distanceCm", "bowlG", "hopperG",
                           "servo", "detection", "wifi", "uptimeS", "timeSynced" };
    for (const char *key : keys) {
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
    CommandLog log;
    TEST_ASSERT_FALSE(log.seen("cmd-1"));
    log.remember("cmd-1");
    TEST_ASSERT_TRUE(log.seen("cmd-1"));
    TEST_ASSERT_FALSE(log.seen("cmd-2"));
}

void test_the_command_log_forgets_the_oldest_first() {
    CommandLog log;
    char id[16];
    for (int i = 0; i < COMMAND_MEMORY + 2; i++) { std::sprintf(id, "c%d", i); log.remember(id); }
    TEST_ASSERT_FALSE(log.seen("c0"));
    std::sprintf(id, "c%d", COMMAND_MEMORY + 1);
    TEST_ASSERT_TRUE(log.seen(id));
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
