/*
 * Blink Bloop: a Blink with a piezo speaker (docs/BLOOP.md in the Blinks Playground).
 *
 * Sound works like light. setNote() plays a note until something else is played, as setColor()
 * keeps a color, and setNote(QUIET) stops it. playNote() plays one for a while and then stops,
 * without waiting. blinklib.h includes this file on the Blink Bloop board.
 */

#ifndef BLOOP_H_
#define BLOOP_H_

#include <stdint.h>

// A note: 0 is QUIET, 1 to 63 are half steps (the MIDI note number minus 36, so 33 is A4 at
// 440 Hz), and 64 and up a frequency in Hz. A named note fits in a face value.
typedef uint16_t Note;

#define QUIET       0
#define NOTE_C      36      // C5, 523 Hz
#define NOTE_D      38
#define NOTE_E      40
#define NOTE_F      41
#define NOTE_G      43
#define NOTE_A      45      // A5, 880 Hz
#define NOTE_B      47
#define NOTE_HIGH_C 48      // C6, 1047 Hz

// How notes sound: the width of the pulse
#define WAVE_ROUND  0       // 50%, a square wave
#define WAVE_REEDY  1       // 25%
#define WAVE_THIN   2       // 12.5%
#define WAVE_NOISE  3       // a rough rattle around the note: the pitch jumps at random each loop()

void setNote(Note n);                   // play until something else is played
void playNote(Note n, uint16_t ms);     // play for ms milliseconds, then stop
bool isNotePlaying();
void setWave(uint8_t wave);

Note makeToneHz(uint16_t hz);           // any frequency, 64 Hz and up
Note noteUp(Note n, uint8_t steps);     // half steps; 12 is an octave
Note noteDown(Note n, uint8_t steps);
uint16_t noteHz(Note n);

uint8_t isBloopBlink();                 // 1: this is a Bloop

// For blinklib's run loop
void bloop_init();          // before setup()
void bloop_pass();          // after each loop(): end a playNote() whose time is up
void bloop_pause();         // quiet for sleep, game sharing and errors
void bloop_resume();        // after waking: the note again, if it's still playing

#endif /* BLOOP_H_ */
