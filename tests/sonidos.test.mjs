import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventAudio } from '../js/sonidos.js';

function fixture(t, { enabled = true, visible = true } = {}) {
  const sources = [], connections = [];
  class Parameter { setValueAtTime() {} exponentialRampToValueAtTime() {} }
  class Node {
    constructor() { for (const property of ['gain', 'frequency', 'pan', 'threshold', 'ratio', 'Q']) this[property] = new Parameter(); }
    connect(node) { connections.push(node); }
    disconnect() {}
  }
  class Source extends Node {
    constructor(type) { super(); this.kind = type; this.stops = []; sources.push(this); }
    start(time) { this.startAt = time; }
    stop(time) { this.stops.push(time); }
  }
  let context;
  class Context {
    constructor() { context = this; this.currentTime = 0; this.sampleRate = 1000; this.state = 'suspended'; this.destination = new Node(); }
    async resume() { this.state = 'running'; }
    createDynamicsCompressor() { return new Node(); }
    createGain() { return new Node(); }
    createBiquadFilter() { return new Node(); }
    createStereoPanner() { return new Node(); }
    createBuffer() { return { getChannelData: () => new Float32Array(1000) }; }
    createBufferSource() { return new Source('noise'); }
    createOscillator() { return new Source('tone'); }
  }
  const previous = { window: globalThis.window, document: globalThis.document, addEventListener: globalThis.addEventListener };
  globalThis.window = { AudioContext: Context };
  globalThis.document = new EventTarget(); document.hidden = false;
  globalThis.addEventListener = () => {};
  t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value; });
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const audio = createEventAudio({ enabled, canPlay: () => visible });
  return { audio, sources, get context() { return context; } };
}

test('audio requires enabled sound, browser activation and visible projector', async t => {
  const f = fixture(t, { enabled: false }); f.audio.flutter(); f.audio.celebrate();
  assert.equal(await f.audio.activate(), false); assert.equal(f.sources.length, 0);
  f.audio.setEnabled(true); f.audio.flutter(); assert.equal(f.sources.length, 0);
  await f.audio.activate(); f.audio.flutter(); assert(f.sources.some(s => s.kind === 'noise'));
  f.audio.stop();
});
test('no sound in operator/settings even with an active audio context', async t => {
  const f = fixture(t, { visible: false }); await f.audio.activate(); f.audio.flutter(); f.audio.celebrate(); assert.equal(f.sources.length, 0);
});
test('celebration lasts 60 seconds and a second start does not overlap it', async t => {
  const f = fixture(t); await f.audio.activate(); f.audio.celebrate();
  assert(f.sources.some(s => s.kind === 'noise')); assert(f.sources.some(s => s.kind === 'tone'));
  const originalCount = f.sources.length; f.audio.celebrate(); assert.equal(f.sources.length, originalCount);
  t.mock.timers.tick(59999); assert(f.sources.every(s => !s.stops.includes(undefined)));
  t.mock.timers.tick(1); assert(f.sources.every(s => s.stops.includes(undefined)));
});
test('scheduled applause and fanfare never extend beyond the one-minute boundary', async t => {
  const f = fixture(t); await f.audio.activate(); f.audio.celebrate();
  f.context.currentTime = 59.8; t.mock.timers.tick(250);
  for (const source of f.sources) for (const stop of source.stops) if (stop !== undefined) assert(stop <= 60);
  f.audio.stop();
});
test('mute stops active sounds and cancels future scheduling', async t => {
  const f = fixture(t); await f.audio.activate(); f.audio.celebrate(); f.audio.setEnabled(false);
  const count = f.sources.length; t.mock.timers.tick(60000); assert.equal(f.sources.length, count);
  assert(f.sources.every(s => s.stops.includes(undefined)));
});
test('backgrounding the page stops the celebration immediately', async t => {
  const f = fixture(t); await f.audio.activate(); f.audio.celebrate();
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange'));
  assert(f.sources.every(s => s.stops.includes(undefined)));
});
