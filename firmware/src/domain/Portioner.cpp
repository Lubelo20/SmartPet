#include "domain/Portioner.h"
#include "domain/DailyLimit.h"
#include "config.h"

static int sweepCeiling(float targetG) {
    // Generous, because kibble density varies — but finite, because a drum
    // that turns without delivering has to stop rather than grind.
    int nominal = (int)((targetG / GRAMS_PER_SWEEP) + 0.999f);
    return nominal * 2 + 3;
}

bool Portioner::begin(float targetG, float alreadyToday, float maxDaily, float bowlG) {
    if (active_) { outcome_ = PortionOutcome::RefusedBusy; return false; }

    DailyLimitCheck limit = checkDailyLimit(alreadyToday, targetG, maxDaily);
    if (!limit.allowed) { outcome_ = PortionOutcome::RefusedLimit; return false; }

    active_  = true;
    target_  = targetG;
    sweeps_  = 0;
    ceiling_ = sweepCeiling(targetG);
    outcome_ = PortionOutcome::None;
    stall_.reset(bowlG);
    return true;
}

PortionStep Portioner::next(float settledBowlG) {
    if (!active_) return PortionStep{ PortionAction::Complete, outcome_, settledBowlG };

    if (settledBowlG >= target_ - TOLERANCE_G) {
        active_ = false;
        outcome_ = PortionOutcome::Reached;
        return PortionStep{ PortionAction::Complete, outcome_, settledBowlG };
    }

    if (sweeps_ > 0) {
        stall_.observe(settledBowlG);
        if (stall_.stalled()) {
            active_ = false;
            outcome_ = PortionOutcome::Stalled;
            return PortionStep{ PortionAction::Abort, outcome_, settledBowlG };
        }
    }

    if (sweeps_ >= ceiling_) {
        active_ = false;
        outcome_ = PortionOutcome::Short;
        return PortionStep{ PortionAction::Complete, outcome_, settledBowlG };
    }

    sweeps_++;
    return PortionStep{ PortionAction::Sweep, PortionOutcome::None, settledBowlG };
}

void Portioner::abort() {
    active_ = false;
    outcome_ = PortionOutcome::Short;
}
