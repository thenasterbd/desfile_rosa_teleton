import { initialize, subscribe, login, logout, setGoal, resetEvent } from './supabase-config.js';
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
function navigate() {
  const view = ['proyector', 'operador', 'ajustes'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'proyector';
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== view; });
  document.querySelectorAll('[data-view]').forEach(el => { const active = el.dataset.view === view; el.classList.toggle('active', active); if (active) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
}
addEventListener('hashchange', navigate); navigate();
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
$('#login-form').addEventListener('submit', async e => { e.preventDefault(); const button = e.target.querySelector('[type=submit]'); button.disabled = true; try { await login($('#email').value.trim(), $('#password').value); $('#password').value = ''; feedback('#login-feedback', 'Sesión de operador iniciada.'); } catch (error) { feedback('#login-feedback', errorMessage(error), true); } finally { button.disabled = false; } });
$('#logout').addEventListener('click', async () => { try { await logout(); $('#password').value = ''; feedback('#login-feedback', 'Sesión cerrada.'); } catch (error) { feedback('#login-feedback', errorMessage(error), true); } });
$('#goal-form').addEventListener('submit', async e => { e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true; try { await setGoal($('#goal-input').value); feedback('#goal-feedback', 'Meta guardada.'); } catch (error) { feedback('#goal-feedback', errorMessage(error), true); } finally { button.disabled = false; } });
$('#reset').addEventListener('click', () => { $('#reset-form').reset(); feedback('#reset-feedback', ''); $('#reset-dialog').showModal(); });
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
subscribe(({ mode, connection, ready, user, isAdmin, state }) => {
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
  $('#logout').hidden = !user;
  $('#account-status').textContent = user ? `${isAdmin ? 'Operador autorizado' : 'Cuenta sin acceso al panel'} · ${user.email}` : 'Sin sesión de operador';
  if (document.activeElement !== $('#goal-input')) $('#goal-input').value = state.goalCents / 100;
});
setupOperator(); setupProjector(chime); initialize();
