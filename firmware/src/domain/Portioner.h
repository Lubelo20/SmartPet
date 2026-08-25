#pragma once
#include "domain/StallDetector.h"

enum class PortionAction  { Sweep, Complete, Abort };
enum class PortionOutcome { None, Reached, Short, Stalled, RefusedLimit, RefusedBusy };

struct PortionStep {
    PortionAction  action;
    PortionOutcome outcome;
    float          actualG;   // the settled weight, never the target
};

/**
 * A pure state machine. It never touches a servo or a scale: it is told the
 * settled bowl weight and answers with what to do next. That is what lets a
 * whole feeding cycle be exercised on a laptop.
 */
class Portioner {
public:
    bool begin(float targetG, float alreadyToday, float maxDaily, float bowlG);
    PortionStep next(float settledBowlG);
    void abort();
    bool active() const { return active_; }
    int sweeps() const { return sweeps_; }
    PortionOutcome outcome() const { return outcome_; }

private:
    bool  active_ = false;
    float target_ = 0.0f;
    int   sweeps_ = 0;
    int   ceiling_ = 0;
    PortionOutcome outcome_ = PortionOutcome::None;
    StallDetector stall_;
};
