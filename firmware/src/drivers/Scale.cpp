#include "drivers/Scale.h"
#include "config.h"
#include <HX711.h>

static HX711 hx;
static float bowlScale_ = 1.0f, hopperScale_ = 1.0f;
static long  bowlOffset_ = 0,   hopperOffset_ = 0;

void Scale::begin() { hx.begin(PIN_HX711_DOUT, PIN_HX711_SCK); }

void Scale::setCalibration(float bs, float hs, long bo, long ho) {
    bowlScale_ = (bs == 0.0f) ? 1.0f : bs;
    hopperScale_ = (hs == 0.0f) ? 1.0f : hs;
    bowlOffset_ = bo; hopperOffset_ = ho;
}

long Scale::bowlOffset() const { return bowlOffset_; }
long Scale::hopperOffset() const { return hopperOffset_; }

static long medianOf(int gain, int samples) {
    long v[SAMPLE_COUNT];
    if (samples > SAMPLE_COUNT) samples = SAMPLE_COUNT;
    hx.set_gain(gain);
    hx.read();                       // discarded: the HX711 needs one reading
                                     // after a channel switch before it is valid
    for (int i = 0; i < samples; i++) v[i] = hx.read();
    for (int i = 1; i < samples; i++) {          // insertion sort, tiny n
        long k = v[i]; int j = i - 1;
        while (j >= 0 && v[j] > k) { v[j + 1] = v[j]; j--; }
        v[j + 1] = k;
    }
    return v[samples / 2];
}

float Scale::readBowlSettled() {
    return (float)(medianOf(128, SAMPLE_COUNT) - bowlOffset_) / bowlScale_;
}

float Scale::readHopper() {
    // Channel B. Switching channels costs a discarded reading, so this must NOT
    // be called during a cycle — the bowl reading is what closes the loop and it
    // needs every sample it can get. Call only when idle and settled.
    return (float)(medianOf(32, SAMPLE_COUNT) - hopperOffset_) / hopperScale_;
}

void Scale::tareBowl() { bowlOffset_ = medianOf(128, SAMPLE_COUNT); }
