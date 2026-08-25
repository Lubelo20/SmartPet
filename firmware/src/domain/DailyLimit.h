#pragma once

/**
 * Mirrors lib/limits.ts in the dashboard. Per the firmware spec §4 this copy is
 * authoritative: the device enforces the maximum regardless of what the
 * dashboard believes, and the dashboard's copy only refuses early so the user
 * gets an explanation instead of silence.
 *
 * No Arduino header here, on purpose — that is what keeps it testable natively.
 */
struct DailyLimitCheck {
    bool  allowed;
    float alreadyToday;
    float limit;
    float remaining;   // never negative
};

DailyLimitCheck checkDailyLimit(float alreadyToday, float portionG, float limit);
