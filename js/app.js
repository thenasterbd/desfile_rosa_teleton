import { initialize, subscribe, login, logout, createOperator, setGoal, resetEvent } from './supabase-config.js';
import { setupOperator } from './operador.js';
import { setupProjector } from './proyector.js';
const $ = selector => document.querySelector(selector);
let audio, sound = localStorage.getItem('rosa-sound') === 'true';
export function chime() {
  if (!sound || !audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  [659.25, 830.61, 987.77].forEach((frequency, index) => {
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = 'sine'; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + index * .12);
    gain.gain.linearRampToValueAtTime(.10, now + index * .12 + .015);
    gain.gain.exponentialRampToValueAtTime(.001, now + index * .12 + 1.1);
    osc.connect(gain); gain.connect(audio.destination);
    osc.start(now + index * .12); osc.stop(now + index * .12 + 1.2);
  });
}
let canOperate = false, requestedOperator = false, menuAvailable = false;
function setAccountMenu(open) {
  const visible = open && menuAvailable;
  $('#account-menu').hidden = !visible;
  $('[data-view="ajustes"]').setAttribute('aria-expanded', String(visible));
}
function navigate() {
  let view = ['proyector', 'operador', 'ajustes'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'proyector';
  if (view === 'operador' && !canOperate) {
    requestedOperator = true; location.replace('#ajustes'); view = 'ajustes';
  }
  setAccountMenu(view === 'ajustes');
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== view; });
  document.querySelectorAll('[data-view]').forEach(el => { const active = el.dataset.view === view; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
}
addEventListener('hashchange', navigate); navigate();
$('[data-view="ajustes"]').setAttribute('aria-controls', 'account-menu');
$('[data-view="ajustes"]').addEventListener('click', () => {
  setAccountMenu(true);
});
const settingsNav = $('.settings-nav');
let menuCloseTimer;
settingsNav.addEventListener('pointerenter', e => {
  if (e.pointerType === 'mouse') { clearTimeout(menuCloseTimer); setAccountMenu(true); }
});
settingsNav.addEventListener('pointerleave', e => {
  if (e.pointerType === 'mouse') menuCloseTimer = setTimeout(() => setAccountMenu(false), 180);
});
settingsNav.addEventListener('focusin', () => { clearTimeout(menuCloseTimer); setAccountMenu(true); });
settingsNav.addEventListener('focusout', e => { if (!settingsNav.contains(e.relatedTarget)) setAccountMenu(false); });
addEventListener('click', e => { if (!e.target.closest('.settings-nav')) setAccountMenu(false); });
addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#account-menu').hidden) { $('[data-view="ajustes"]').focus(); setAccountMenu(false); }
});
$('[data-view="operador"]').addEventListener('click', () => {
  if (!canOperate) { requestedOperator = true; setTimeout(() => $('#email').focus(), 0); }
});
let toastTimer;
export function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function feedback(id, message, error = false) { $(id).textContent = message; $(id).classList.toggle('error', error); }
export function errorMessage(error) {
  return error.message || 'No se pudo completar la operación.';
}
$('#fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { toast('El navegador no permite pantalla completa. Puedes usar F11.'); } });
$('#sound').checked = sound;
$('#sound-status').textContent = sound ? 'Haz clic en la página para habilitar el audio del navegador.' : 'Sonido desactivado';
async function activateAudio() {
  if (!sound) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); await audio.resume(); $('#sound-status').textContent = 'Sonido activado en este dispositivo'; }
  catch { $('#sound-status').textContent = 'El navegador no pudo activar el sonido.'; }
}
addEventListener('pointerdown', activateAudio);
addEventListener('keydown', activateAudio);
$('#sound').addEventListener('change', async e => { sound = e.target.checked; localStorage.setItem('rosa-sound', String(sound)); if (sound) { await activateAudio(); chime(); } else $('#sound-status').textContent = 'Sonido desactivado'; });
$('#login-form').addEventListener('submit', async e => { e.preventDefault(); const button = e.target.querySelector('[type=submit]'); button.disabled = true; try { await login($('#email').value.trim(), $('#password').value); $('#password').value = ''; feedback('#login-feedback', ''); if (requestedOperator) { requestedOperator = false; location.hash = 'operador'; } else $('#goal-input').focus(); } catch (error) { feedback('#login-feedback', errorMessage(error), true); } finally { button.disabled = false; } });
document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', async () => {
  document.querySelectorAll('[data-logout]').forEach(el => { el.disabled = true; });
  try { await logout(); $('#password').value = ''; feedback('#login-feedback', 'Sesión cerrada.'); location.hash = 'ajustes'; $('#email').focus(); }
  catch (error) { setAccountMenu(false); toast(errorMessage(error)); }
  finally { document.querySelectorAll('[data-logout]').forEach(el => { el.disabled = false; }); }
}));
let creatingUser = false;
$('#open-user-registration').addEventListener('click', () => {
  setAccountMenu(false); $('#user-form').reset(); feedback('#user-feedback', ''); $('#user-dialog').showModal(); $('#user-email').focus();
});
$('#cancel-user').addEventListener('click', () => { $('#user-form').reset(); $('#user-dialog').close(); });
$('#user-dialog').addEventListener('cancel', e => { if (creatingUser) e.preventDefault(); });
$('#user-dialog').addEventListener('close', () => { $('#user-form').reset(); });
$('#user-form').addEventListener('submit', async e => {
  e.preventDefault(); if (creatingUser) return;
  if ($('#user-password').value !== $('#user-password-confirm').value) { feedback('#user-feedback', 'Las contraseñas no coinciden.', true); $('#user-password-confirm').focus(); return; }
  creatingUser = true; feedback('#user-feedback', 'Creando usuario…');
  const email = $('#user-email').value.trim(), password = $('#user-password').value;
  $('#user-form').querySelectorAll('input, button').forEach(el => { el.disabled = true; });
  try { const message = await createOperator(email, password); $('#user-form').reset(); $('#user-dialog').close(); toast(message); }
  catch (error) { feedback('#user-feedback', errorMessage(error), true); }
  finally { creatingUser = false; $('#user-form').querySelectorAll('input, button').forEach(el => { el.disabled = false; }); }
});
$('#goal-form').addEventListener('submit', async e => { e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true; try { await setGoal($('#goal-input').value); feedback('#goal-feedback', 'Meta guardada.'); } catch (error) { feedback('#goal-feedback', errorMessage(error), true); } finally { button.disabled = false; } });
$('#reset').addEventListener('click', () => { $('#reset-form').reset(); feedback('#reset-feedback', ''); $('#reset-dialog').showModal(); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
  const cancel = $(`#cancel-${button.dataset.close}`);
  if (!cancel.disabled) cancel.click();
}));
$('#cancel-reset').addEventListener('click', () => $('#reset-dialog').close());
$('#reset-form').addEventListener('submit', async e => { e.preventDefault(); if ($('#reset-confirm').value !== 'REINICIAR') return; const button = e.target.querySelector('[type=submit]'); button.disabled = true; try { await resetEvent(); $('#reset-dialog').close(); toast('Nuevo evento iniciado. El contador está en cero.'); } catch (error) { feedback('#reset-feedback', errorMessage(error), true); } finally { button.disabled = false; } });
let hasEventData = false;
const connectionDelay = setTimeout(() => {
  if (!hasEventData && /Iniciando|Conectando/.test($('#database-status').textContent)) {
    $('#database-status').textContent = 'La conexión está tardando más de lo habitual. Comprueba la red o vuelve a conectar.';
  }
}, 15000);
$('#retry-connection').addEventListener('click', () => location.reload());
$('#empty-start').addEventListener('click', () => $('#amount').focus());
subscribe(({ mode, connection, ready, user, isAdmin, isOwner, state }) => {
  if (ready) { hasEventData = true; clearTimeout(connectionDelay); }
  document.body.classList.toggle('pending-data', !hasEventData);
  $('.live-layout').setAttribute('aria-busy', String(!hasEventData));
  for (const id of ['#total', '#goal', '#remaining', '#count', '#percent']) {
    $(id).setAttribute('aria-hidden', String(!hasEventData));
  }
  $('#connection-notice').hidden = ready;
  $('#retry-connection').hidden = ready;
  $('#first-donation').hidden = state.count > 0;
  $('#connection').textContent = connection;
  $('#database-status').textContent = connection;
  $('#database-status').hidden = ready;
  $('.header-status').dataset.state = ready ? 'ready' : 'error';
  $('#footer-mode').textContent = mode === 'demo' ? 'MODO DE PRUEBA · USD' : 'DESFILE ROSA 2026 · USD';
  $('#operator-mode').textContent = mode === 'demo' ? 'Modo de prueba' : isAdmin ? 'Operador autorizado' : 'Inicia sesión para registrar aportes';
  const accessChanged = canOperate !== (mode === 'demo' || isAdmin);
  canOperate = mode === 'demo' || isAdmin;
  $('#open-user-registration').hidden = !isOwner;
  if (!isOwner && $('#user-dialog').open) $('#user-dialog').close();
  $('#login-panel').hidden = canOperate;
  $('#settings-controls').hidden = !canOperate;
  $('#settings-controls').inert = !canOperate;
  $('#operador').inert = !canOperate;
  menuAvailable = !!user && isAdmin;
  $('.settings-chevron').hidden = !menuAvailable;
  if (!menuAvailable) setAccountMenu(false);
  document.querySelectorAll('[data-logout]').forEach(el => { el.hidden = !user; });
  const operatorLink = $('[data-view="operador"]');
  operatorLink.classList.toggle('requires-login', !canOperate);
  operatorLink.setAttribute('aria-label', canOperate ? 'Panel operador' : 'Panel operador: inicia sesión para acceder');
  operatorLink.title = canOperate ? 'Panel operador' : 'Inicia sesión para acceder';
  $('#settings-title').innerHTML = canOperate ? 'Una meta <span>que nos mueve.</span>' : 'Bienvenido <span>al equipo.</span>';
  $('#settings-description').textContent = canOperate ? 'Prepara la meta y el sonido de tu evento.' : 'Inicia sesión para continuar.';
  if (!canOperate && $('#reset-dialog').open) $('#reset-dialog').close();
  if (accessChanged) navigate();
  if (document.activeElement !== $('#goal-input')) $('#goal-input').value = state.goalCents / 100;
});
setupOperator(); setupProjector(chime); initialize();
