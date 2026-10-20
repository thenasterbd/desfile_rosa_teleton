import { manageOperator, subscribe } from './supabase-config.js';

export function setupUsers(toast) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#manage-dialog'), form = $('#manage-form');
  let owner = false, page = 1, target, action, busy = false, loadRevision = 0;
  function message(selector, text, error = false) { $(selector).textContent = text; $(selector).classList.toggle('error', error); }
  function cancelAction() { form.reset(); form.hidden = true; target = action = null; }
  function disableControls(disabled) {
    dialog.querySelectorAll('button, input').forEach(el => { el.disabled = disabled; });
    if (!disabled) {
      $('#users-prev').disabled = page <= 1;
      $('#users-next').disabled = $('#users-next').dataset.more !== 'true';
    }
  }
  async function load() {
    const revision = ++loadRevision;
    message('#manage-feedback', 'Cargando operadores…'); $('#managed-users').replaceChildren();
    disableControls(true);
    try {
      const data = await manageOperator('list', { page });
      if (revision !== loadRevision || !owner || !dialog.open) return;
      $('#users-page').textContent = `Página ${page}`;
      $('#users-next').dataset.more = String(data.hasMore);
      message('#manage-feedback', data.users.length ? '' : 'No hay operadores en esta página.');
      for (const user of data.users) {
        const card = document.createElement('article'), email = document.createElement('strong'), status = document.createElement('p'), actions = document.createElement('div');
        card.className = 'managed-user'; email.textContent = user.email;
        status.textContent = user.isPrincipal ? 'Cuenta principal' : user.active ? 'Operador habilitado' : 'Operador deshabilitado';
        card.append(email, status); actions.className = 'managed-user-actions';
        if (!user.isPrincipal) {
          for (const [type, label] of [[user.active ? 'disable' : 'enable', user.active ? 'Deshabilitar' : 'Habilitar'], ['password', 'Cambiar contraseña']]) {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'button ghost'; button.textContent = label;
            button.addEventListener('click', () => {
              cancelAction(); target = user; action = type;
              $('#manage-action-title').textContent = type === 'password' ? 'Cambiar contraseña' : type === 'disable' ? '¿Deshabilitar operador?' : '¿Habilitar operador?';
              $('#manage-target').textContent = user.email;
              $('#manage-action-description').textContent = type === 'disable' ? 'Este usuario perderá el permiso para registrar aportes y administrar el evento. Sus aportes se conservarán.' : type === 'enable' ? 'Este usuario recuperará el acceso como operador.' : 'La nueva contraseña reemplazará la actual. Compártela de forma privada con el operador.';
              $('#manage-password-fields').hidden = type !== 'password';
              for (const id of ['#manage-password', '#manage-confirm']) $(id).required = type === 'password';
              message('#manage-action-feedback', ''); form.hidden = false;
              (type === 'password' ? $('#manage-password') : $('#cancel-user-action')).focus();
              form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }); actions.append(button);
          }
        }
        card.append(actions); $('#managed-users').append(card);
      }
    } catch (error) { if (revision === loadRevision && owner) message('#manage-feedback', error.message, true); }
    finally { if (revision === loadRevision) disableControls(false); }
  }
  $('#open-user-management').addEventListener('click', () => {
    if (!owner) return; page = 1; cancelAction(); dialog.showModal(); load();
  });
  $('#cancel-manage').addEventListener('click', () => dialog.close());
  $('#cancel-user-action').addEventListener('click', cancelAction);
  dialog.addEventListener('cancel', e => { if (busy) e.preventDefault(); });
  dialog.addEventListener('close', () => { ++loadRevision; cancelAction(); });
  $('#users-prev').addEventListener('click', () => { if (page > 1 && !busy) { page--; cancelAction(); load(); } });
  $('#users-next').addEventListener('click', () => { if (!busy) { page++; cancelAction(); load(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (busy || !owner || !target) return;
    if (action === 'password' && $('#manage-password').value !== $('#manage-confirm').value) { message('#manage-action-feedback', 'Las contraseñas no coinciden.', true); return; }
    busy = true; disableControls(true); message('#manage-action-feedback', 'Guardando cambios…');
    try {
      const details = { userId: target.id };
      if (action === 'password') details.password = $('#manage-password').value;
      const result = await manageOperator(action, details);
      cancelAction(); toast(result.message); if (owner && dialog.open) await load();
    } catch (error) { message('#manage-action-feedback', error.message, true); }
    finally { busy = false; disableControls(false); }
  });
  subscribe(({ isOwner }) => {
    owner = !!isOwner; $('#open-user-management').hidden = !owner;
    if (!owner && dialog.open) dialog.close();
  });
}
