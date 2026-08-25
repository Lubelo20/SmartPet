#include "drivers/Drum.h"
#include "config.h"
#include <Arduino.h>
#include <ESP32Servo.h>

static Servo servo;

void Drum::begin() {
    servo.setPeriodHertz(50);
    servo.attach(PIN_SERVO, 500, 2400);
    closeNow();
}

void Drum::closeNow() {
    servo.write(SERVO_CLOSED_DEG);
}

void Drum::sweep() {
    servo.write(SERVO_OPEN_DEG);
    delay(SWEEP_TRAVEL_MS);
    servo.write(SERVO_CLOSED_DEG);
    delay(SWEEP_TRAVEL_MS);
}
