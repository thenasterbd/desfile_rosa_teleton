import { addDonation, editDonation, subscribe, money } from './supabase-config.js';
import { errorMessage, toast } from './app.js';
export function setupOperator() {
  const form = document.querySelector('#donation-form'), amount = document.querySelector('#amount'), button = document.querySelector('#donate'), feedback = document.querySelector('#donation-feedback');
  let busy = false, pendingId, pendingPayload;
  document.querySelectorAll('[data-add]').forEach(el => el.addEventListener('click', () => { amount.value = ((Math.round((Number(amount.value) || 0) * 100) + Number(el.dataset.add) * 100) / 100).toFixed(2); amount.focus(); }));
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const data = { amount: amount.value, name: form.elements.donor.value, message: form.elements.message.value };
    const payload = JSON.stringify(data);
    if (payload !== pendingPayload) { pendingId = crypto.randomUUID(); pendingPayload = payload; }
    busy = true;
    form.querySelectorAll('input, textarea').forEach(el => { el.readOnly = true; });
    form.querySelectorAll('[data-add]').forEach(el => { el.disabled = true; });
    button.disabled = true; button.textContent = 'Registrando…'; feedback.textContent = ''; feedback.classList.remove('error');
    try {
      await addDonation(data, pendingId);
      form.reset(); pendingId = pendingPayload = null; feedback.textContent = '¡Aporte registrado! Gracias por sumar.'; amount.focus();
    } catch (error) { feedback.textContent = errorMessage(error); feedback.classList.add('error'); }
    finally {
      form.querySelectorAll('input, textarea').forEach(el => { el.readOnly = false; });
      form.querySelectorAll('[data-add]').forEach(el => { el.disabled = false; });
      busy = false; button.disabled = false; button.textContent = '♡ Registrar donación'; }
  });
  const dialog = document.querySelector('#edit-dialog'), editForm = document.querySelector('#edit-form'), editFeedback = document.querySelector('#edit-feedback');
  let editing, editEvent, editingBusy = false, currentEvent, canEdit = false;
  document.querySelector('#cancel-edit').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', e => { if (editingBusy) e.preventDefault(); });
  editForm.addEventListener('submit', async e => {
    e.preventDefault(); if (editingBusy || !editing || !canEdit) return;
    editingBusy = true; editFeedback.textContent = ''; editFeedback.classList.remove('error');
    const data = { amount: document.querySelector('#edit-amount').value, name: document.querySelector('#edit-donor').value, message: document.querySelector('#edit-message').value };
    editForm.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = true; });
    try { await editDonation(editing, data, editEvent); dialog.close(); toast('Aporte actualizado.'); }
    catch (error) { editFeedback.textContent = errorMessage(error); editFeedback.classList.add('error'); }
    finally { editingBusy = false; editForm.querySelectorAll('input, textarea, button').forEach(el => { el.disabled = false; }); }
  });
  let lastHistory = '';
  subscribe(({ history, mode, isAdmin, state }) => {
    canEdit = mode === 'demo' || isAdmin;
    currentEvent = state.generation;
    if (dialog.open && (!canEdit || currentEvent !== editEvent)) dialog.close();
    const signature = JSON.stringify([history, canEdit]);
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
      const actions = document.createElement('td'), edit = document.createElement('button');
      edit.type = 'button'; edit.className = 'text-button edit-donation'; edit.textContent = 'Editar'; edit.disabled = !canEdit;
      edit.setAttribute('aria-label', `Editar aporte de ${d.name}`);
      edit.addEventListener('click', () => {
        editing = { ...d }; editEvent = currentEvent;
        document.querySelector('#edit-amount').value = (d.amountCents / 100).toFixed(2);
        document.querySelector('#edit-donor').value = d.name;
        document.querySelector('#edit-message').value = d.message;
        editFeedback.textContent = ''; editFeedback.classList.remove('error'); dialog.showModal();
      });
      actions.append(edit); row.append(donor, value, time, actions); body.append(row);
    }
  });
}
