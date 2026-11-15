/*
 * The Bloops' speakers (docs/BLOOP.md): one WebAudio voice per Bloop, following what its
 * speaker plays (Blink.voice()) once a frame. A voice is a pulse wave oscillator, or for
 * WAVE_NOISE a loop of one-bit noise whose rate follows the note, through a shared compressor.
 *
 * Browsers only play sound after the person clicks or types, so the context starts on the first
 * pointerdown or keydown on the page.
 */

import { noteHz } from '../compiler/rt.js';

const LEVEL = 0.14;               // one voice's gain; the compressor keeps a big group in check
const DUTY = [0.5, 0.25, 0.125];  // WAVE_ROUND, WAVE_REEDY, WAVE_THIN
const NOISE = 3;
const NOISE_HOLD = 4;             // samples each noise bit lasts at playback rate 1
const NOISE_STEPS = 16;           // noise bits per period of the note
const RAMP = 0.004;               // s: fades in and out, so notes don't click
const IDLE_S = 1;                 // a voice quiet this long lets go of its source

export class Speakers {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.voices = new Map();      // Blink -> { gain, src, noise, wave, on, quietAt }
    this.seqs = new WeakMap();    // Blink -> its noteSeq last frame
    if (typeof window === 'undefined') return;
    const start = () => this.start();
    window.addEventListener('pointerdown', start, true);
    window.addEventListener('keydown', start, true);
  }

  // Can it be heard? (false until the first click, and while the browser holds it back)
  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  start() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(comp).connect(ctx.destination);
      this.waves = DUTY.map(d => pulseWave(ctx, d));
      this.noise = noiseBuffer(ctx);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.01);
  }

  // Once a frame. speed: simulated ms per real ms, 0 while paused (quiet)
  update(world, speed) {
    const ctx = this.ctx;
    const live = new Set(world.blinks);
    for (const [b, v] of this.voices) if (!live.has(b)) { this.release(v); this.voices.delete(b); }
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    for (const b of world.blinks) {
      if (!b.voice) continue;
      const s = speed ? b.voice() : null;
      let v = this.voices.get(b);
      // a playNote() that started and ended between two frames still sounds, for its own length
      const seq = this.seqs.get(b);
      this.seqs.set(b, b.noteSeq);
      const blip = !s && speed && seq !== undefined && seq !== b.noteSeq && b.lastPlay && b.lastPlay.note ? b.lastPlay : null;
      if (!s && !blip) {
        if (v && v.src) {
          if (v.on) { v.gain.gain.setTargetAtTime(0, t, RAMP); v.on = false; v.quietAt = t; }
          else if (t - v.quietAt > IDLE_S) this.stopSource(v);
        }
        continue;
      }
      if (!v) { v = this.voice(); this.voices.set(b, v); }
      const wave = s ? s.wave : blip.wave;
      // each Bloop makes its pitch from its own clock, which runs a little fast or slow
      const hz = (s ? s.hz : noteHz(blip.note)) * (world.clockRate ? world.clockRate(b) : 1);
      this.tune(v, wave, hz, t);
      if (blip) {
        const len = Math.max(0.012, blip.ms / speed / 1000);
        v.gain.gain.setTargetAtTime(LEVEL, t, RAMP / 2);
        v.gain.gain.setTargetAtTime(0, t + len, RAMP);
        v.on = false; v.quietAt = t + len;
      } else if (!v.on) {
        v.gain.gain.setTargetAtTime(LEVEL, t, RAMP / 2);
        v.on = true;
      }
    }
  }

  voice() {
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master);
    return { gain, src: null, noise: false, wave: -1, on: false, quietAt: 0 };
  }

  // Point the voice at a wave and a pitch, making its source if it needs a new one
  tune(v, wave, hz, t) {
    const noise = wave === NOISE;
    if (v.src && v.noise !== noise) this.stopSource(v);
    if (!v.src) {
      v.noise = noise;
      if (noise) {
        v.src = this.ctx.createBufferSource();
        v.src.buffer = this.noise;
        v.src.loop = true;
      } else v.src = this.ctx.createOscillator();
      v.src.connect(v.gain);
      v.src.start(t);
      v.wave = -1;
    }
    if (noise) v.src.playbackRate.setValueAtTime(hz * NOISE_STEPS * NOISE_HOLD / this.ctx.sampleRate, t);
    else {
      if (v.wave !== wave) v.src.setPeriodicWave(this.waves[wave]);
      v.src.frequency.setValueAtTime(Math.min(hz, this.ctx.sampleRate / 2), t);
    }
    v.wave = wave;
  }

  stopSource(v) {
    if (!v.src) return;
    try { v.src.stop(); } catch (e) { /* not started */ }
    v.src.disconnect();
    v.src = null;
  }

  release(v) {
    this.stopSource(v);
    v.gain.disconnect();
  }
}

// A pulse wave that's high for `duty` of each period, as cosine harmonics
function pulseWave(ctx, duty) {
  const n = 64;
  const real = new Float32Array(n), imag = new Float32Array(n);
  for (let k = 1; k < n; k++) real[k] = (2 / (k * Math.PI)) * Math.sin(Math.PI * k * duty);
  return ctx.createPeriodicWave(real, imag);
}

// One second of one-bit noise from a 15-bit LFSR, each bit held for NOISE_HOLD samples
function noiseBuffer(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let lfsr = 1, bit = 1;
  for (let i = 0; i < d.length; i++) {
    if (i % NOISE_HOLD === 0) {
      const fb = (lfsr ^ (lfsr >> 1)) & 1;
      lfsr = (lfsr >> 1) | (fb << 14);
      bit = lfsr & 1;
    }
    d[i] = bit ? 0.6 : -0.6;
  }
  return buf;
}
