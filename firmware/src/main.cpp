#include <Arduino.h>
#include <WiFi.h>
#include <esp_task_wdt.h>
#include <time.h>
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

static Drum drum;
static Ranger ranger;
static Scale scale;
static Portioner portioner;
static Scheduler scheduler;
static CommandLog cmdLog;
static Rtdb rtdb;
static Store store;
static TimeSync clockSync;

static float dailyTotal = 0.0f;      // grams delivered today, reset at midnight
static long  dailyTotalDay = 0;      // yyyymmdd the total belongs to
static float maxDaily = 600.0f;
static float defaultPortion = 120.0f;
static bool  stopRequested = false;

static long dayKeyOf(const LocalTime &t) {
    return (long)t.year * 10000L + (long)t.month * 100L + (long)t.day;
}

/** A new local day resets the running total; otherwise a feeder would refuse forever. */
static void rollDailyTotal() {
    if (!clockSync.synced()) return;
    long today = dayKeyOf(clockSync.now());
    if (today != dailyTotalDay) { dailyTotalDay = today; dailyTotal = 0.0f; }
}

/**
 * Runs one feeding cycle to completion. Blocking on purpose: nothing else may
 * move the drum while this is running, and the watchdog is fed inside the loop.
 */
static void runCycle(const char *petId, float targetG) {
    (void)petId;
    rollDailyTotal();

    float startBowl = scale.readBowlSettled();
    if (!portioner.begin(targetG, dailyTotal, maxDaily, startBowl)) return;

    stopRequested = false;
    for (;;) {
        esp_task_wdt_reset();

        if (stopRequested) { portioner.abort(); drum.closeNow(); return; }

        PortionStep step = portioner.next(scale.readBowlSettled());
        if (step.action == PortionAction::Sweep) {
            drum.sweep();
            delay(SETTLE_MS);
            continue;
        }

        drum.closeNow();
        float delivered = step.actualG - startBowl;
        if (delivered > 0.0f) dailyTotal += delivered;
        return;
    }
}

static void handleCommand(const char *type, const char *payload) {
    if (strcmp(type, "feeding.start") == 0) {
        char petId[16] = {0};
        float portionG = defaultPortion;
        const char *p = strstr(payload, "\"petId\"");
        if (p) sscanf(p, "\"petId\":\"%15[^\"]\"", petId);
        const char *g = strstr(payload, "\"portionG\"");
        if (g) sscanf(g, "\"portionG\":%f", &portionG);
        runCycle(petId, portionG);
        return;
    }
    if (strcmp(type, "feeding.stop") == 0) {
        stopRequested = true;
        drum.closeNow();
        return;
    }
    if (strcmp(type, "portion.update") == 0 || strcmp(type, "schedule.update") == 0) {
        // Both live server-side; pull the authoritative copy rather than
        // trusting the payload, then cache it so a network drop keeps working.
        ScheduleEntry fresh[MAX_SCHEDULES];
        int n = 0;
        if (rtdb.readSchedules(fresh, MAX_SCHEDULES, n) && n > 0) {
            scheduler.setEntries(fresh, n);
            store.saveSchedules(fresh, n);
            if (clockSync.synced()) scheduler.markPastAsFired(clockSync.now());
        }
        return;
    }
    if (strcmp(type, "device.config") == 0) {
        if (strstr(payload, "\"tare\"")) {
            scale.tareBowl();
            store.saveCalibration(1.0f, 1.0f, scale.bowlOffset(), scale.hopperOffset());
        } else if (strstr(payload, "\"restart\"")) {
            // Close first. The reset is immediate and the servo holds its last
            // commanded position, so restarting mid-pour would empty the hopper.
            drum.closeNow();
            delay(200);
            ESP.restart();
        }
        // "ping" needs no action beyond the ack the caller writes.
    }
}

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

    int tz = 0;
    store.loadConfig(defaultPortion, maxDaily, tz);

    ScheduleEntry cached[MAX_SCHEDULES];
    int n = store.loadSchedules(cached, MAX_SCHEDULES);
    if (n > 0) scheduler.setEntries(cached, n);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
        delay(250);
        esp_task_wdt_reset();
    }

    clockSync.begin(tz);
    if (clockSync.synced()) {
        scheduler.markPastAsFired(clockSync.now());
        dailyTotalDay = dayKeyOf(clockSync.now());
    }
    rtdb.begin();
}

void loop() {
    esp_task_wdt_reset();
    clockSync.maybeResync();
    rollDailyTotal();

    // --- commands -----------------------------------------------------------
    char id[40] = {0}, type[32] = {0}, payload[192] = {0};
    if (rtdb.readCommand(id, type, payload, sizeof(payload))) {
        if (!cmdLog.seen(id)) {
            cmdLog.remember(id);
            handleCommand(type, payload);
            rtdb.ackCommand(id, true, "accepted");
        }
        rtdb.clearCommand();
    }

    // --- schedules ----------------------------------------------------------
    // Wi-Fi may be down; the cached schedule and the local clock are enough,
    // because a pet must not miss a meal because a router rebooted.
    if (clockSync.synced()) {
        LocalTime now = clockSync.now();
        int due = scheduler.dueIndex(now, true);
        if (due >= 0) {
            const ScheduleEntry &e = scheduler.entry(due);
            scheduler.markFired(due, now);
            runCycle(e.petId, e.portionG);
        }
    }

    // --- telemetry ----------------------------------------------------------
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
        snprintf(t.servo, sizeof(t.servo), "%s", portioner.active() ? "DISPENSING" : "READY");
        snprintf(t.detectionState, sizeof(t.detectionState), "%s",
                 (t.distanceCm > 0 && t.distanceCm < 60) ? "detected" : "idle");
        t.rssi = WiFi.RSSI();
        snprintf(t.ip, sizeof(t.ip), "%s", WiFi.localIP().toString().c_str());
        t.uptimeS = millis() / 1000;
        t.timeSynced = clockSync.synced();

        char json[512];
        if (buildTelemetryJson(t, json, sizeof(json)) > 0) rtdb.publishTelemetry(json);
    }
}
