#include "net/Rtdb.h"
#include "config.h"
#include "secrets.h"
#include <Arduino.h>
#include <Firebase_ESP_Client.h>

static FirebaseData   fbdo;
static FirebaseAuth   fauth;
static FirebaseConfig fcfg;

static String basePath() { return String("devices/") + DEVICE_ID; }

bool Rtdb::begin() {
    fcfg.api_key = FIREBASE_API_KEY;
    fcfg.database_url = FIREBASE_DATABASE_URL;
    // The device signs in as ITS OWN user. Rules grant that uid write access to
    // devices/<its id> and nothing else; it never holds a member's credentials.
    fauth.user.email = DEVICE_EMAIL;
    fauth.user.password = DEVICE_PASSWORD;
    Firebase.begin(&fcfg, &fauth);
    Firebase.reconnectWiFi(true);
    return Firebase.ready();
}

bool Rtdb::ready() const { return Firebase.ready(); }

void Rtdb::publishTelemetry(const char *json) {
    // Telemetry is lossy on purpose: missed telemetry is not missed food, and
    // blocking the loop to retry would delay the feeding that matters.
    if (!Firebase.ready()) return;
    FirebaseJson payload;
    payload.setJsonData(json);
    Firebase.RTDB.setJSON(&fbdo, (basePath() + "/telemetry").c_str(), &payload);
}

bool Rtdb::readCommand(char *idOut, char *typeOut, char *payloadOut, int cap) {
    if (!Firebase.ready()) return false;
    if (!Firebase.RTDB.getJSON(&fbdo, (basePath() + "/command").c_str())) return false;

    FirebaseJson *j = fbdo.to<FirebaseJson *>();
    if (!j) return false;
    FirebaseJsonData d;

    if (!j->get(d, "id") || d.stringValue.length() == 0) return false;
    snprintf(idOut, cap, "%s", d.stringValue.c_str());
    if (j->get(d, "type"))    snprintf(typeOut, cap, "%s", d.stringValue.c_str());
    if (j->get(d, "payload")) snprintf(payloadOut, cap, "%s", d.stringValue.c_str());
    return true;
}

void Rtdb::ackCommand(const char *id, bool ok, const char *message) {
    if (!Firebase.ready()) return;
    FirebaseJson ack;
    ack.set("ok", ok);
    ack.set("message", message);
    Firebase.RTDB.setJSON(&fbdo, (basePath() + "/ack/" + id).c_str(), &ack);
}

void Rtdb::clearCommand() {
    if (!Firebase.ready()) return;
    Firebase.RTDB.deleteNode(&fbdo, (basePath() + "/command").c_str());
}

bool Rtdb::readSchedules(ScheduleEntry *out, int cap, int &countOut) {
    countOut = 0;
    if (!Firebase.ready()) return false;
    if (!Firebase.RTDB.getArray(&fbdo, (basePath() + "/schedule").c_str())) return false;

    FirebaseJsonArray *arr = fbdo.to<FirebaseJsonArray *>();
    if (!arr) return false;

    int n = arr->size();
    if (n > cap) n = cap;
    for (int i = 0; i < n; i++) {
        FirebaseJsonData item;
        if (!arr->get(item, i)) continue;
        FirebaseJson entry;
        entry.setJsonData(item.to<String>());

        ScheduleEntry e{};
        FirebaseJsonData d;
        if (entry.get(d, "id"))    snprintf(e.id, sizeof(e.id), "%s", d.stringValue.c_str());
        if (entry.get(d, "petId")) snprintf(e.petId, sizeof(e.petId), "%s", d.stringValue.c_str());
        // "HH:MM" -> minutes. A time that does not parse stays negative and
        // never fires, rather than reading as midnight.
        e.minuteOfDay = -1;
        if (entry.get(d, "time")) {
            int hh = 0, mm = 0;
            if (sscanf(d.stringValue.c_str(), "%2d:%2d", &hh, &mm) == 2 &&
                hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
                e.minuteOfDay = hh * 60 + mm;
            }
        }
        if (entry.get(d, "portionG")) e.portionG = d.to<float>();
        if (entry.get(d, "enabled"))  e.enabled = d.to<bool>();
        e.days = ScheduleDays::Daily;
        if (entry.get(d, "days")) {
            String v = d.stringValue;
            if (v == "Weekdays") e.days = ScheduleDays::Weekdays;
            else if (v == "Weekends") e.days = ScheduleDays::Weekends;
        }
        out[countOut++] = e;
    }
    return true;
}
