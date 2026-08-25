#include "domain/DailyLimit.h"

DailyLimitCheck checkDailyLimit(float alreadyToday, float portionG, float limit) {
    float remaining = limit - alreadyToday;
    if (remaining < 0.0f) remaining = 0.0f;

    // A non-positive limit means "not configured", not "allow nothing". A blank
    // field must never leave an animal unfed.
    if (limit <= 0.0f) {
        return DailyLimitCheck{ true, alreadyToday, limit, remaining };
    }
    return DailyLimitCheck{ alreadyToday + portionG <= limit, alreadyToday, limit, remaining };
}
