// The Blink Bloop's blinklib: Move38's (SDK 1.3.0) with bloop.cpp added, bloop.h included from
// blinklib.h, and a few calls into it from blinklib's run loop. The Move38 files are changed
// here, as the toolchain is built, rather than copied, so the rest of blinklib stays theirs.
//
// bloopCore(dir) takes the SDK's cores/blinklib folder and returns the files that differ, by name.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;

// [what to find, what to put there]. Each must be found exactly once.
const HOOKS = [
  // before setup(): a game downloaded over IR starts without a reset
  ['    setup();\n', '    bloop_init();\n\n    setup();\n'],
  // after each loop(): end a playNote() whose time is up
  ['        loop();\n', '        loop();\n\n        bloop_pass();\n'],
  // quiet while asleep, and the note again on waking
  ['static void warm_sleep_cycle() {\n', 'static void warm_sleep_cycle() {\n\n    bloop_pause();\n'],
  ['    // restore game pixels\n    \n    restorePixels();\n', '    // restore game pixels\n    \n    restorePixels();\n\n    bloop_resume();\n'],
  // quiet while sharing the game, and when the stack overflows
  ['                BLINKBIOS_BOOTLOADER_SEED_VECTOR();\n', '                bloop_pause();\n                BLINKBIOS_BOOTLOADER_SEED_VECTOR();\n'],
  ['            BLINKBIOS_ABEND_VECTOR(4);\n', '            bloop_pause();\n            BLINKBIOS_ABEND_VECTOR(4);\n'],
];

function patch(text, edits, file) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';   // Move38's files end their lines with CRLF
  for (let [find, put] of edits) {
    find = find.replaceAll('\n', eol);
    put = put.replaceAll('\n', eol);
    const n = text.split(find).length - 1;
    if (n !== 1) throw new Error(`Bloop: expected ${JSON.stringify(find)} once in ${file}, found it ${n} times`);
    text = text.replace(find, put);
  }
  return text;
}

export function bloopCore(dir) {
  const h = readFileSync(join(dir, 'blinklib.h'), 'utf8');
  const end = h.lastIndexOf('#endif');
  if (end < 0) throw new Error('Bloop: no #endif at the end of blinklib.h');
  return new Map([
    ['blinklib.h', h.slice(0, end) + '// Blink Bloop: sound\n#include "bloop.h"\n\n' + h.slice(end)],
    ['blinklib.cpp', patch(readFileSync(join(dir, 'blinklib.cpp'), 'utf8'), HOOKS, 'blinklib.cpp')],
    ['bloop.h', readFileSync(join(HERE, 'bloop.h'), 'utf8')],
    ['bloop.cpp', readFileSync(join(HERE, 'bloop.cpp'), 'utf8')],
  ]);
}
