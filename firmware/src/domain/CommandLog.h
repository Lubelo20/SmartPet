#pragma once
#include "config.h"

/**
 * Remembers recently-acted command ids. RTDB delivery is at-least-once and a
 * reconnect can re-present a command already handled; acting twice on
 * feeding.start feeds the animal twice.
 */
class CommandLog {
public:
    bool seen(const char *id) const;
    void remember(const char *id);

private:
    char ids_[COMMAND_MEMORY][40]{};
    int  next_ = 0;
};
