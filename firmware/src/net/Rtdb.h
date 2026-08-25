#pragma once
#include "domain/Scheduler.h"

/**
 * Firebase RTDB transport. Paths are exactly those in the firmware spec §5:
 *   devices/{id}/telemetry   device writes
 *   devices/{id}/command     dashboard writes, device clears once acted on
 *   devices/{id}/ack/{cmdId} device writes the outcome
 *   devices/{id}/schedule    dashboard writes, device caches to NVS
 */
class Rtdb {
public:
    bool begin();
    bool ready() const;
    void publishTelemetry(const char *json);
    /** True when a command is waiting. Buffers are filled with its fields. */
    bool readCommand(char *idOut, char *typeOut, char *payloadOut, int cap);
    void ackCommand(const char *id, bool ok, const char *message);
    void clearCommand();
    /** Reads devices/{id}/schedule. False when the node is absent. */
    bool readSchedules(ScheduleEntry *out, int cap, int &countOut);
};
