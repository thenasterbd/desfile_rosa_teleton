import test from 'node:test';
import assert from 'node:assert/strict';
import { setupFireworks } from '../js/fuegos.js';

function fixture(t, reducedMotion = false) {
  const keys = ['document', 'matchMedia', 'MutationObserver', 'addEventListener', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'devicePixelRatio', 'innerWidth', 'innerHeight'];
  const previous = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const frames = new Map(), observers = [], colors = new Set(); let nextId = 0, now = 0;
  const media = new EventTarget(); media.matches = reducedMotion;
  const projector = { hidden: false, children: [], append(node) { this.children.push(node); } };
  const drawing = { setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { colors.add(this.strokeStyle); } };
  const doc = new EventTarget(); doc.hidden = false;
  doc.createElement = () => ({ setAttribute() {}, getContext: () => drawing, remove() { projector.children = projector.children.filter(node => node !== this); } });
  const replacements = {
    document: doc, matchMedia: () => media,
    MutationObserver: class { constructor(callback) { observers.push(callback); } observe() {} },
    addEventListener() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    performance: { now: () => now },
    requestAnimationFrame: callback => { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: id => frames.delete(id)
  };
  for (const [key, value] of Object.entries(replacements)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => { for (const key of keys) { const descriptor = previous.get(key); if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fireworks = setupFireworks(projector);
  return { fireworks, projector, media, colors, frames, observers, frame(time) { now = time; const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback(time)); } };
}

test('fireworks run for one minute and a second start does not add another layer', t => {
  const f = fixture(t); f.fireworks.start(); f.fireworks.start();
  assert.equal(f.projector.children.length, 1); t.mock.timers.tick(59999);
  assert.equal(f.projector.children.length, 1); t.mock.timers.tick(1);
  assert.equal(f.projector.children.length, 0); assert.equal(f.frames.size, 0);
});
test('rockets and radial sparks use only the event palette', t => {
  const f = fixture(t); f.fireworks.start();
  for (let time = 0; time < 3000; time += 16) f.frame(time);
  assert(f.colors.size >= 2); assert(f.colors.has('#FFFFFF'));
  for (const color of f.colors) assert(['#FC568D', '#E02D69', '#F93873', '#FFFFFF'].includes(color));
  f.fireworks.stop();
});
test('reduced motion suppresses fireworks and stops an existing effect', t => {
  const f = fixture(t, true); f.fireworks.start(); assert.equal(f.projector.children.length, 0);
  f.media.matches = false; f.fireworks.start(); assert.equal(f.projector.children.length, 1);
  f.media.matches = true; f.media.dispatchEvent(new Event('change'));
  assert.equal(f.projector.children.length, 0);
});
test('leaving projector removes the canvas and cancels future frames', t => {
  const f = fixture(t); f.fireworks.start(); f.projector.hidden = true;
  f.observers.forEach(callback => callback());
  assert.equal(f.projector.children.length, 0); assert.equal(f.frames.size, 0);
});
