const butterflyURL = new URL('../assets/butterfly.svg', import.meta.url).href;
const MAX_BUTTERFLIES = 160;

// Decoration only: no input handling, data writes or external dependencies.
export function setupButterflies(projector) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const layer = document.createElement('div');
  layer.className = 'butterfly-layer';
  layer.setAttribute('aria-hidden', 'true');
  projector.append(layer);
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
    if (projector.hidden || reduced.matches || document.hidden || typeof layer.animate !== 'function') return;
    const width = innerWidth, height = innerHeight;
    const count = width < 700 ? 40 : 72;
    const limit = width < 700 ? 80 : MAX_BUTTERFLIES;
    const baseSize = Math.max(42, Math.min(100, width * .045));

    for (let i = 0; i < count; i++) {
      // A busy event must not accumulate an unbounded number of effects.
      if (active.size >= limit) remove(active.keys().next().value);
      const size = baseSize * (.8 + Math.random() * .65);
      const particle = document.createElement('div');
      particle.className = 'donation-butterfly';
      particle.style.setProperty('--butterfly-size', `${size}px`);
      const image = document.createElement('img');
      image.src = butterflyURL;
      image.alt = '';
      image.draggable = false;
      particle.append(image);
      layer.append(particle);

      // Fan out across the whole viewport, retaining the bottom-right origin.
      const lane = (i + Math.random()) / count;
      const start = i % 2
        ? { x: width + size, y: height * (.8 + Math.random() * .2) }
        : { x: width * (.8 + Math.random() * .2), y: height + size };
      const control1 = { x: width * (.1 + lane * .98), y: height * (1.1 - lane * .98) };
      const control2 = { x: width * (-.06 + lane * .8), y: height * (.75 - lane * .8) };
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
        duration: 5400 + Math.random() * 2600,
        delay: (i % 8) * 110 + Math.random() * 400,
        easing: 'linear',
        fill: 'both'
      });
      active.set(particle, flight);
      // Cancellation also settles this promise; never leave rejected animations.
      flight.finished.then(() => remove(particle), () => remove(particle));
    }
  }

  new MutationObserver(() => { if (projector.hidden) clear(); })
    .observe(projector, { attributes: true, attributeFilter: ['hidden'] });

  reduced.addEventListener('change', () => { if (reduced.matches) clear(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); });
  return { play, clear };
}
