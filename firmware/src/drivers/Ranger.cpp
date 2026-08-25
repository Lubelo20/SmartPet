#include "drivers/Ranger.h"
#include "config.h"
#include <Arduino.h>

void Ranger::begin() {
    pinMode(PIN_SR04_TRIG, OUTPUT);
    digitalWrite(PIN_SR04_TRIG, LOW);   // strapping pin: must be LOW at boot
    pinMode(PIN_SR04_ECHO, INPUT);      // 5V echo arrives through a 1k/2k divider
}

static float onePing() {
    digitalWrite(PIN_SR04_TRIG, LOW);  delayMicroseconds(2);
    digitalWrite(PIN_SR04_TRIG, HIGH); delayMicroseconds(10);
    digitalWrite(PIN_SR04_TRIG, LOW);
    unsigned long us = pulseIn(PIN_SR04_ECHO, HIGH, 30000UL);
    if (us == 0) return -1.0f;
    return (float)us / 58.0f;
}

float Ranger::readCm() {
    float a = onePing(), b = onePing(), c = onePing();
    // Median of three: a single ping off a curved bowl is unreliable.
    if (a > b) { float t = a; a = b; b = t; }
    if (b > c) { float t = b; b = c; c = t; }
    if (a > b) { float t = a; a = b; b = t; }
    return b;
}
