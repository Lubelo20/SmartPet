#include "domain/CommandLog.h"
#include <cstring>

bool CommandLog::seen(const char *id) const {
    for (int i = 0; i < COMMAND_MEMORY; i++) {
        if (ids_[i][0] && std::strncmp(ids_[i], id, sizeof(ids_[0]) - 1) == 0) return true;
    }
    return false;
}

void CommandLog::remember(const char *id) {
    std::strncpy(ids_[next_], id, sizeof(ids_[0]) - 1);
    ids_[next_][sizeof(ids_[0]) - 1] = '\0';
    next_ = (next_ + 1) % COMMAND_MEMORY;   // ring buffer: oldest is overwritten
}
