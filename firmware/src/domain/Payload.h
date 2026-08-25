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
