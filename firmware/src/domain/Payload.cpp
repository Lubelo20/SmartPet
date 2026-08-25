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
