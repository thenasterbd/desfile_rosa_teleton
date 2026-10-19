import { addDonation, subscribe, money } from './firebase-config.js';
import { errorMessage } from './app.js';
export function setupOperator() {
  const form = document.querySelector('#donation-form'), amount = document.querySelector('#amount'), button = document.querySelector('#donate'), feedback = document.querySelector('#donation-feedback');
  let busy = false, pendingId, pendingPayload;
  document.querySelectorAll('[data-add]').forEach(el => el.addEventListener('click', () => { amount.value = ((Math.round((Number(amount.value) || 0) * 100) + Number(el.dataset.add) * 100) / 100).toFixed(2); amount.focus(); }));
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const data = { amount: amount.value, name: form.elements.donor.value, message: form.elements.message.value };
    const payload = JSON.stringify(data);
    if (payload !== pendingPayload) { pendingId = crypto.randomUUID(); pendingPayload = payload; }
    busy = true; button.disabled = true; button.textContent = 'Registrando…'; feedback.textContent = ''; feedback.classList.remove('error');
    try {
      await addDonation(data, pendingId);
      form.reset(); pendingId = pendingPayload = null; feedback.textContent = '¡Aporte registrado! Gracias por sumar.'; amount.focus();
    } catch (error) { feedback.textContent = errorMessage(error); feedback.classList.add('error'); }
    finally { busy = false; button.disabled = false; button.textContent = '♡ Registrar donación'; }
  });
  let lastHistory = '';
  subscribe(({ history }) => {
    const signature = JSON.stringify(history);
    if (signature === lastHistory) return;
    lastHistory = signature;
    const body = document.querySelector('#history-body'); body.replaceChildren();
    document.querySelector('#empty-history').hidden = history.length > 0;
    for (const d of history) {
      const row = document.createElement('tr'), donor = document.createElement('td'), value = document.createElement('td'), time = document.createElement('td');
      donor.textContent = d.name;
      if (d.message) { const note = document.createElement('small'); note.textContent = d.message; donor.append(note); }
      value.textContent = money(d.amountCents);
      const date = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
      time.textContent = Number.isNaN(date.getTime()) ? 'Ahora' : date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      row.append(donor, value, time); body.append(row);
    }
  });
}
