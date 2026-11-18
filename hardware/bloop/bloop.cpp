/*
 * Blink Bloop sound (bloop.h, docs/BLOOP.md in the Blinks Playground).
 *
 * The piezo sits across the service port's two serial pins. On the ATmega328PB those are timer
 * outputs: PD0 (the port's R) is OC3A and PD1 (its T) is OC4A. The BIOS doesn't use timers 3 and
 * 4, so they're ours. Both run the same fast PWM, timer 4's inverted, so the piezo sees the
 * battery's voltage one way and then the other: twice the swing of one pin, and louder.
 *
 * The BIOS keeps every interrupt vector, so a game can't have an interrupt. The timers make the
 * sound on their own, and nothing here runs between passes of loop().
 */

#include "blinklib.h"

#include <avr/io.h>
#include <avr/interrupt.h>
#include <avr/pgmspace.h>

// Each half step's frequency: round(440 * 2^((n - 33) / 12)) for n = 1 to 63, as the playground has it
static const uint16_t STEP_HZ[63] PROGMEM = {
    69, 73, 78, 82, 87, 92, 98, 104, 110, 117, 123, 131,
    139, 147, 156, 165, 175, 185, 196, 208, 220, 233, 247, 262,
    277, 294, 311, 330, 349, 370, 392, 415, 440, 466, 494, 523,
    554, 587, 622, 659, 698, 740, 784, 831, 880, 932, 988, 1047,
    1109, 1175, 1245, 1319, 1397, 1480, 1568, 1661, 1760, 1865, 1976, 2093,
    2217, 2349, 2489,
};

// 2^(k/12) out of 32768, for moving a frequency by half steps
static const uint16_t STEP_RATIO[12] PROGMEM = { 32768, 34716, 36781, 38968, 41285, 43740, 46341, 49097, 52016, 55109, 58386, 61858 };

// The pulse width of each wave, out of 256 (noise uses a square)
static const uint8_t DUTY[4] = { 128, 64, 32, 128 };

static Note note = QUIET;           // what the sketch asked for
static uint8_t wave = WAVE_ROUND;
static uint8_t timed;               // a playNote(): it ends at endTime
static uint32_t endTime;
static uint8_t paused;

static uint16_t soundingHz;         // what the timers play now (0: quiet)
static uint8_t soundingWave;

uint8_t isBloopBlink() { return 1; }

uint16_t noteHz(Note n) {
    if (n == 0 || n >= 64) return n;
    return pgm_read_word(&STEP_HZ[n - 1]);
}

Note makeToneHz(uint16_t hz) {
    return hz == 0 ? 0 : hz < 64 ? 64 : hz;
}

Note noteUp(Note n, uint8_t steps) {
    if (n == 0) return 0;
    if (n < 64) return n + steps > 63 ? 63 : n + steps;
    uint32_t v = ((uint32_t) n * pgm_read_word(&STEP_RATIO[steps % 12])) >> 15;
    for (uint8_t o = steps / 12; o; o--) {
        if (v > 0x7fff) return 0xffff;
        v <<= 1;
    }
    return v;
}

Note noteDown(Note n, uint8_t steps) {
    if (n == 0) return 0;
    if (n < 64) return n <= steps ? 1 : n - steps;
    uint32_t v = ((uint32_t) n << 15) / pgm_read_word(&STEP_RATIO[steps % 12]);
    uint8_t o = steps / 12;
    v = o >= 16 ? 0 : v >> o;
    return v < 64 ? 64 : v;
}

// Is Serial using the pins? Then they aren't ours
static uint8_t serialOn() {
    return UCSR0B & (_BV(TXEN0) | _BV(RXEN0));
}

static void silence() {
    TCCR3B = 0; TCCR4B = 0;
    TCCR3A = 0; TCCR4A = 0;                     // let go of the pins
    if (!serialOn()) DDRD &= ~(_BV(PD0) | _BV(PD1));   // inputs, with the BIOS's pull-ups: both high, nothing across the piezo
    soundingHz = 0;
}

// Run the timers with this period. top + 1 counts of the timer clock make one period.
static void drive(uint16_t top, uint8_t clockSelect, uint8_t duty) {
    uint16_t high = ((uint32_t) top + 1) * duty >> 8;
    // The 16-bit registers share one temporary byte with timer 1, which the BIOS writes from an
    // interrupt, so they're written with interrupts off
    uint8_t sreg = SREG;
    cli();
    TCCR3B = 0; TCCR4B = 0;
    TCNT3 = 0; TCNT4 = 0;
    ICR3 = top; ICR4 = top;
    OCR3A = high; OCR4A = high;
    TCCR3A = _BV(COM3A1) | _BV(WGM31);                  // PD0 high from the start of each period to the match
    TCCR4A = _BV(COM4A1) | _BV(COM4A0) | _BV(WGM41);    // PD1 the other way round
    DDRD |= _BV(PD0) | _BV(PD1);
    TCCR3B = _BV(WGM33) | _BV(WGM32) | clockSelect;     // fast PWM, the period from ICR3
    TCCR4B = _BV(WGM43) | _BV(WGM42) | clockSelect;     // started together, so they stay in step
    SREG = sreg;
}

// The timer period for a frequency: at the CPU clock from 123 Hz up, or an eighth of it below
static void period(uint16_t hz, uint16_t *top, uint8_t *clockSelect) {
    uint32_t clock = hz >= 123 ? F_CPU : F_CPU / 8;
    *clockSelect = hz >= 123 ? 1 : 2;
    *top = (clock + hz / 2) / hz - 1;
}

static void sound(uint16_t hz, uint8_t w) {
    if (paused || serialOn()) return;
    if (hz == soundingHz && w == soundingWave) return;   // still playing it: no restart, no click
    if (!hz) { silence(); return; }
    uint16_t top;
    uint8_t clockSelect;
    period(hz, &top, &clockSelect);
    drive(top, clockSelect, DUTY[w]);
    soundingHz = hz;
    soundingWave = w;
}

static uint8_t playing() {
    return note && !(timed && millis() >= endTime);
}

static void update() {
    sound(playing() ? noteHz(note) : 0, wave);
}

void setNote(Note n) {
    note = n;
    timed = 0;
    update();
}

void playNote(Note n, uint16_t ms) {
    note = n;
    timed = 1;
    endTime = millis() + ms;
    soundingHz = 0;         // start it again, even if it's the note playing now
    update();
}

bool isNotePlaying() {
    return playing();
}

void setWave(uint8_t w) {
    wave = w & 3;
    update();
}

void bloop_pass() {
    if (!playing()) { if (soundingHz) silence(); return; }
    if (wave == WAVE_NOISE && soundingHz && !paused && !serialOn()) {
        // a new pitch, from half to one and a half times the note's, every pass
        uint16_t top;
        uint8_t clockSelect;
        period(noteHz(note), &top, &clockSelect);
        uint32_t t = top / 2 + random(top);
        drive(t > 0xffff ? 0xffff : t, clockSelect, DUTY[WAVE_NOISE]);
    }
}

void bloop_init() {
    silence();      // a game that arrives over IR starts without a reset, so the timers may still be playing
}

void bloop_pause() {
    paused = 1;
    silence();
}

void bloop_resume() {
    paused = 0;
    update();
}
