// Bloop sound (docs/BLOOP.md): the API, the note values, and when a Bloop's speaker plays
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, compileSketch } from '../js/compiler/index.js';
import * as H from '../js/compiler/rt.js';
import { sim, compileErr } from './helpers.mjs';

const bloops = (src, cells = [[0, 0]]) => {
  const s = sim(src, cells);
  for (const b of s.b) b.bloop = true;
  return s;
};
const hz = b => (b.voice() ? b.voice().hz : 0);

test('named notes are the C major scale from C5, and fit in a face value', () => {
  const r = compile(`
    byte names[] = { QUIET, NOTE_C, NOTE_D, NOTE_E, NOTE_F, NOTE_G, NOTE_A, NOTE_B, NOTE_HIGH_C, WAVE_ROUND, WAVE_REEDY, WAVE_THIN, WAVE_NOISE };
    void setup() {} void loop() {}`);
  assert.ok(r.ok, r.errors?.[0]?.message);
  const hzs = [0, 36, 38, 40, 41, 43, 45, 47, 48].map(H.noteHz);
  assert.deepEqual(hzs, [0, 523, 587, 659, 698, 784, 880, 988, 1047]);
  assert.equal(H.noteHz(33), 440);
  assert.equal(H.noteHz(63), 2489);
});

test('notes go up and down by half steps; tones by the same ratios', () => {
  assert.equal(H.noteUp(36, 4), 40);
  assert.equal(H.noteUp(60, 5), 63);       // the top of the scale
  assert.equal(H.noteDown(3, 9), 1);
  assert.equal(H.noteUp(0, 5), 0);         // QUIET stays quiet
  assert.equal(H.noteUp(440, 12), 880);
  assert.equal(H.noteUp(440, 7), 659);
  assert.equal(H.noteDown(880, 12), 440);
  assert.equal(H.noteDown(100, 24), 64);   // a tone never turns into a step
  assert.equal(H.makeToneHz(0), 0);
  assert.equal(H.makeToneHz(20), 64);
  assert.equal(H.makeToneHz(1000), 1000);
});

test('Note is a type, and the note functions fold to constants', () => {
  const r = compile('const Note n = noteUp(NOTE_A, 12); Note tune[] = { NOTE_C, makeToneHz(440) }; void setup() {} void loop() { setNote(n); }');
  assert.ok(r.ok, r.errors?.[0]?.message);
  assert.ok(r.usesSound);
  assert.equal(compile('void setup() {} void loop() { setColor(RED); }').usesSound, false);
});

test('setNote() holds until changed, and QUIET stops it', () => {
  const { w, b } = bloops(`
    void setup() { setNote(NOTE_E); }
    void loop() { if (buttonSingleClicked()) setNote(QUIET); }`);
  w.advance(2000);
  assert.equal(hz(b[0]), 659);
  b[0].press(true); w.advance(60); b[0].press(false); w.advance(600);
  assert.equal(b[0].voice(), null);
});

test('playNote() plays for its time and then stops, without waiting', () => {
  const { w, b, log } = bloops(`
    void setup() { playNote(NOTE_G, 300); }
    word loops = 0;
    void loop() { loops++; if (loops == 5) Serial.println(isNotePlaying()); }`);
  w.advance(100);
  assert.equal(hz(b[0]), 784);
  assert.deepEqual(log, ['1']);
  w.advance(300);
  assert.equal(b[0].voice(), null);
  assert.equal(b[0].isNotePlaying(), 0);
});

test('setWave() changes the sound until changed again', () => {
  const { w, b } = bloops('void setup() { setWave(WAVE_NOISE); setNote(NOTE_C); } void loop() {}');
  w.advance(100);
  assert.equal(b[0].voice().wave, 3);
});

test('a Blink without a speaker stays quiet, and knows it', () => {
  const { w, b, log } = sim('void setup() { setNote(NOTE_C); Serial.println(isBloopBlink()); } void loop() {}');
  w.advance(100);
  assert.equal(b[0].voice(), null);
  assert.deepEqual(log, ['0']);
  const s = bloops('void setup() { Serial.println(isBloopBlink()); } void loop() {}');
  s.w.advance(100);
  assert.deepEqual(s.log, ['1']);
});

test('a Bloop goes quiet asleep, and plays its note again when it wakes', () => {
  const { w, b } = bloops('void setup() { setNote(NOTE_A); } void loop() {}');
  w.advance(100);
  b[0].press(true); w.advance(6300); b[0].press(false); w.advance(800);
  assert.equal(b[0].mode, 'sleep');
  assert.equal(b[0].voice(), null);
  b[0].press(true); w.advance(60); b[0].press(false); w.advance(800);
  assert.equal(hz(b[0]), 880);
});

test('starting over makes a Bloop quiet', () => {
  const { w, b } = bloops('void setup() { if (startState() == START_STATE_POWER_UP) setNote(NOTE_C); } void loop() {}');
  w.advance(100);
  assert.equal(hz(b[0]), 523);
  w.restart();
  assert.equal(b[0].voice(), null);
  assert.ok(b[0].bloop, 'still a Bloop: the speaker is hardware');
});

test('tone() points to the Bloop functions', () => {
  assert.match(compileErr('void setup() {} void loop() { tone(3, 440); }').message, /setNote/);
});

test('Custom Blinklib has no Bloop sound', () => {
  const r = compileSketch({ files: { 'a.ino': '#define BGA_CUSTOM_BLINKLIB\nvoid setup() {} void loop() { setNote(NOTE_C); }' }, main: 'a.ino', sdk: 'bga' });
  assert.equal(r.ok, false);
});
