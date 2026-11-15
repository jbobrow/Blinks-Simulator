/*
 * Hello, Bloop
 *
 * A Bloop is a Blink with a speaker. Click to play a scale,
 * one note at a time, with a color for each.
 *
 * Sound works like light: setNote() keeps a note playing until
 * you change it, and playNote() plays one for a while, then stops.
 * Neither one waits, so loop() keeps running.
 */

const Note scale[] = { NOTE_C, NOTE_D, NOTE_E, NOTE_F, NOTE_G, NOTE_A, NOTE_B, NOTE_HIGH_C };
const Color colors[] = { RED, ORANGE, YELLOW, GREEN, CYAN, BLUE, MAGENTA, WHITE };

Timer beat;
byte step = 8;   // 8 means the scale is done

void setup() {
}

void loop() {
  if (buttonSingleClicked()) {
    step = 0;
  }

  if (step < 8 && beat.isExpired()) {
    playNote(scale[step], 180);   // play it for 180 ms
    setColor(colors[step]);
    step++;
    beat.set(220);
  }

  if (step == 8 && !isNotePlaying()) {
    setColor(OFF);
  }
}
