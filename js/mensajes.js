const messages = [
  { first: 'Hoy desfilamos', second: 'por la ', accent: 'esperanza.', title: 'La solidaridad nos une', detail: 'Juntos, por una vida color de rosa.' },
  { first: 'Cada aporte', second: 'enciende la ', accent: 'esperanza.', title: 'Cada gesto cuenta', detail: 'Tu generosidad hace la diferencia.' },
  { first: 'Juntos hacemos', second: 'crecer la ', accent: 'esperanza.', title: 'Unidos llegamos más lejos', detail: 'Muchas manos, una misma causa.' },
  { first: 'Desfilamos', second: 'con el ', accent: 'corazón.', title: 'La esperanza se comparte', detail: 'Un pequeño aporte puede significar mucho.' },
  { first: 'Cada paso', second: 'nos acerca a ', accent: 'la meta.', title: 'Sumamos por la vida', detail: 'Gracias por caminar junto a esta causa.' },
  { first: 'Tu generosidad', second: 'se convierte en ', accent: 'esperanza.', title: 'Ayudar nos transforma', detail: 'Hoy podemos hacer algo por los demás.' },
  { first: 'Unidos damos', second: 'más fuerza a ', accent: 'la vida.', title: 'Un corazón solidario', detail: 'El apoyo de todos abre nuevos caminos.' },
  { first: 'Hoy caminamos', second: 'por un ', accent: 'mañana mejor.', title: 'La unión hace posible más', detail: 'Sigamos construyendo esperanza juntos.' }
];

export function setupMessages(projector) {
  const heading = projector.querySelector('.campaign-message');
  const title = projector.querySelector('.message-stat strong');
  const detail = projector.querySelector('.message-stat p');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let index = 0, timer;
  function change() {
    index = (index + 1) % messages.length;
    const message = messages[index], accent = document.createElement('span');
    accent.textContent = message.accent;
    heading.replaceChildren(document.createTextNode(message.first), document.createElement('br'), document.createTextNode(message.second), accent);
    title.textContent = message.title; detail.textContent = message.detail;
    if (!reduced.matches) {
      for (const element of [heading, title.parentElement]) {
        element.animate([{ opacity: .15 }, { opacity: 1 }], { duration: 650, easing: 'ease-out' });
      }
    }
  }
  function schedule() {
    clearInterval(timer);
    if (!projector.hidden && !document.hidden) timer = setInterval(change, 10000);
  }
  new MutationObserver(schedule).observe(projector, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', schedule);
  schedule();
}
