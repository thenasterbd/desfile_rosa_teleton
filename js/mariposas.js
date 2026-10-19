const butterflyURL = new URL('../assets/butterfly.svg', import.meta.url).href;
const MAX_BUTTERFLIES = 24;

// Decoration only: no input handling, data writes or external dependencies.
export function setupButterflies() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const layer = document.createElement('div');
  layer.className = 'butterfly-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  const active = new Map();
  const preload = new Image();
  preload.src = butterflyURL;

  function remove(particle) {
    active.get(particle)?.cancel();
    active.delete(particle);
    particle.remove();
  }

  function clear() {
    for (const particle of active.keys()) remove(particle);
  }

  function play() {
    if (reduced.matches || document.hidden || typeof layer.animate !== 'function') return;
    const width = innerWidth, height = innerHeight;
    const count = width < 700 ? 5 : 8;
    const baseSize = Math.max(42, Math.min(100, width * .045));

    for (let i = 0; i < count; i++) {
      // A busy event must not accumulate an unbounded number of effects.
      if (active.size >= MAX_BUTTERFLIES) remove(active.keys().next().value);
      const size = baseSize * (.75 + Math.random() * .5);
      const particle = document.createElement('div');
      particle.className = 'donation-butterfly';
      particle.style.setProperty('--butterfly-size', `${size}px`);
      const image = document.createElement('img');
      image.src = butterflyURL;
      image.alt = '';
      image.draggable = false;
      particle.append(image);
      layer.append(particle);

      const start = { x: width + size, y: height + size * .5 + Math.random() * 30 };
      const control1 = { x: width * (.65 + Math.random() * .25), y: height * (.45 + Math.random() * .25) };
      const control2 = { x: width * (.1 + Math.random() * .25), y: height * (.08 + Math.random() * .25) };
      const end = { x: -size * 2, y: -size * 2 };
      const phase = Math.random() * Math.PI * 2;
      const frames = [];
      for (let step = 0; step <= 24; step++) {
        const t = step / 24, u = 1 - t;
        const flutter = Math.sin(t * Math.PI * 5 + phase) * 18 * Math.sin(t * Math.PI);
        const x = u ** 3 * start.x + 3 * u ** 2 * t * control1.x + 3 * u * t ** 2 * control2.x + t ** 3 * end.x + flutter;
        const y = u ** 3 * start.y + 3 * u ** 2 * t * control1.y + 3 * u * t ** 2 * control2.y + t ** 3 * end.y - flutter;
        const tilt = -40 + Math.sin(t * Math.PI * 4 + phase) * 12;
        frames.push({
          offset: t,
          transform: `translate3d(${x}px, ${y}px, 0) rotate(${tilt}deg)`,
          opacity: Math.min(1, t * 9, (1 - t) * 9) * .9
        });
      }
      const flight = particle.animate(frames, {
        duration: 4800 + Math.random() * 1400,
        delay: i * 130 + Math.random() * 180,
        easing: 'linear',
        fill: 'both'
      });
      active.set(particle, flight);
      // Cancellation also settles this promise; never leave rejected animations.
      flight.finished.then(() => remove(particle), () => remove(particle));
    }
  }

  reduced.addEventListener('change', () => { if (reduced.matches) clear(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  return { play, clear };
}
