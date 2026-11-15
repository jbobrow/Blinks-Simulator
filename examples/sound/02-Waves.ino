/*
 * Waves
 *
 * Hold the button to play a note.
 *   click         one note higher
 *   double-click  one note lower
 *   long press    the next wave: round, reedy, thin, then noise
 *
 * The lit face walks around as the note goes up, and the color
 * shows the wave.
 */

Note note = NOTE_C;
byte wave = WAVE_ROUND;
const Color waveColors[] = { CYAN, GREEN, YELLOW, WHITE };

void setup() {
}

void loop() {
  if (buttonSingleClicked()) note = noteUp(note, 1);     // a half step: the next piano key
  if (buttonDoubleClicked()) note = noteDown(note, 1);
  if (buttonLongPressed()) {
    wave = (wave + 1) % 4;
    setWave(wave);
  }

  if (buttonDown()) {
    setNote(note);
  } else {
    setNote(QUIET);
  }

  setColor(dim(waveColors[wave], buttonDown() ? 255 : 60));
  setColorOnFace(WHITE, note % 6);
}
