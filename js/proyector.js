import { setupFireworks } from './fuegos.js';
import { subscribe, money } from './supabase-config.js';
import { setupMessages } from './mensajes.js';
import { setupButterflies } from './mariposas.js';
export function setupProjector(eventAudio) {
  const $ = selector => document.querySelector(selector);
  let previous, shown = 0, animation, goalCelebrated = false, pendingCelebration = false;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const fireworks = setupFireworks($('#proyector'));
  const visible = () => !$('#proyector').hidden && !document.hidden;
  function startCelebration() {
    if (!pendingCelebration) return;
    pendingCelebration = false;
    if (!visible()) return;
    fireworks.start(); eventAudio.celebrate();
  }
  function cancelCelebration() { pendingCelebration = false; fireworks.stop(); eventAudio.stop(); }
  const butterflies = setupButterflies($('#proyector'), () => {
    eventAudio.stopFlutter(); startCelebration();
  });
  new MutationObserver(() => { if (!visible()) cancelCelebration(); })
    .observe($('#proyector'), { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { if (!visible()) cancelCelebration(); });
  setupMessages($('#proyector'));
  let fitFrame;
  function fitLatest() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(() => {
      const card = $('.latest-card');
      card.style.removeProperty('--latest-fit');
      if (!document.documentElement.classList.contains('projection-mode')) return;
      // Preserve complete names/messages instead of truncating them on short screens.
      for (let scale = .95; card.scrollHeight > card.clientHeight + 1 && scale >= .35; scale -= .05) {
        card.style.setProperty('--latest-fit', scale.toFixed(2));
      }
    });
  }
  new ResizeObserver(fitLatest).observe($('.latest-card'));
  document.addEventListener('fullscreenchange', fitLatest);
  document.fonts.ready.then(fitLatest);
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
  subscribe(({ state: s, ready }) => {
    // The first confirmed snapshot establishes a baseline, never a celebration.
    if (!previous && !ready) return;
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
    $('#last-time').textContent = d ? 'Un nuevo gesto de solidaridad' : 'Esperando el primer aporte';
    const sameEvent = previous && previous.generation === s.generation;
    if (!previous || !sameEvent) {
      goalCelebrated = s.totalCents >= s.goalCents;
      if (previous) { cancelCelebration(); butterflies.clear(); }
    }
    if (pendingCelebration && s.totalCents < s.goalCents) { pendingCelebration = false; goalCelebrated = false; }
    if (sameEvent && s.count > previous.count && d && d.id !== previous.last?.id) {
      const card = $('.total-card'); card.classList.remove('glow'); void card.offsetWidth; card.classList.add('glow');
      const flightDuration = butterflies.play();
      eventAudio.flutter(flightDuration);
    }
    const reachedGoal = sameEvent && !goalCelebrated && s.totalCents > previous.totalCents && previous.totalCents < s.goalCents && s.totalCents >= s.goalCents;
    if (reachedGoal) {
      goalCelebrated = true;
      pendingCelebration = true;
      if (!butterflies.isFlying()) startCelebration();
    }
    previous = { ...s };
    fitLatest();
  });
}
