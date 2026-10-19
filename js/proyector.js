import { subscribe, money } from './supabase-config.js';
export function setupProjector(chime) {
  const $ = selector => document.querySelector(selector);
  let previous, shown = 0, animation;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function animate(target) {
    cancelAnimationFrame(animation);
    $('#total').classList.toggle('long-total', money(target).length > 13);
    const from = shown, start = performance.now(), duration = reduced.matches ? 0 : 1200;
    function frame(now) {
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      shown = Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      const text = money(shown), dot = text.lastIndexOf('.');
      $('#total').replaceChildren(document.createTextNode(text.slice(0, dot)));
      const decimals = document.createElement('small'); decimals.textContent = text.slice(dot); $('#total').append(decimals);
      if (t < 1) animation = requestAnimationFrame(frame);
    }
    animation = requestAnimationFrame(frame);
  }
  subscribe(({ state: s }) => {
    if (!previous || s.totalCents !== previous.totalCents) animate(s.totalCents);
    const percentage = s.goalCents > 0 ? s.totalCents / s.goalCents * 100 : 0;
    $('#percent').textContent = new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(percentage) + '%';
    $('#progress-fill').style.transform = `scaleX(${Math.min(100, percentage) / 100})`;
    $('#progress').setAttribute('aria-valuenow', String(Math.min(100, percentage)));
    $('#progress').setAttribute('aria-valuetext', `${percentage.toFixed(1)}% de la meta`);
    $('#goal').textContent = money(s.goalCents); $('#remaining').textContent = money(Math.max(0, s.goalCents - s.totalCents)); $('#count').textContent = s.count.toLocaleString('es');
    const d = s.last;
    $('.latest-caption').textContent = d ? 'Gracias de corazón a' : 'La primera historia está por comenzar';
    $('#last-name').textContent = d?.name || 'Tu aporte puede abrir el camino.';
    $('#last-amount').hidden = !d;
    $('#last-amount').textContent = money(d?.amountCents || 0);
    $('#last-message').textContent = d?.message || (d ? 'Gracias por ser parte de este gran cambio.' : 'Cada gesto cuenta. El primer aporte marca el comienzo de esta causa.');
    $('#donor-avatar').textContent = d ? d.name.split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase() : '♡';
    $('#last-time').textContent = d ? 'Un nuevo gesto de solidaridad' : 'Esperando el primer aporte';
    const sameEvent = previous && previous.generation === s.generation;
    if (sameEvent && d && d.id !== previous.last?.id) {
      const card = $('.total-card'); card.classList.remove('glow'); void card.offsetWidth; card.classList.add('glow'); chime();
    }
    if (sameEvent && previous.totalCents < previous.goalCents && s.totalCents >= s.goalCents && !reduced.matches && typeof window.confetti === 'function') {
      window.confetti({ particleCount: 160, spread: 90, origin: { y: .65 }, colors: ['#e4c0d6', '#e0014d', '#ffffff'], disableForReducedMotion: true });
    }
    previous = { ...s };
  });
}
