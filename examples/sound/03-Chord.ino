/*
 * Chord
 *
 * Each Bloop plays one note, but only while it's touching
 * another Blink. Put three together and you hear a chord.
 * Pull one away and it goes quiet.
 *
 * Click a Bloop to change its note: C, E, G, then high C.
 */

const Note notes[] = { NOTE_C, NOTE_E, NOTE_G, NOTE_HIGH_C };
const Color colors[] = { RED, YELLOW, GREEN, BLUE };
byte pick = 0;

void setup() {
  randomize();
  pick = random(3);
}

void loop() {
  if (buttonSingleClicked()) {
    pick = (pick + 1) % 4;
  }

  if (isAlone()) {
    setNote(QUIET);
    setColor(dim(colors[pick], 50));
  } else {
    setNote(notes[pick]);
    setColor(colors[pick]);
  }
}
