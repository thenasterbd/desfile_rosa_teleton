import { operatorFunctionError } from './operator-function-errors.js';
// Estos datos identifican la API pública. La seguridad reside en RLS y las RPC.
// Nunca se debe poner aquí una clave secret/service_role.
export const supabaseConfig = Object.freeze({
  url: 'https://ijbyhoiwfpdlgviuoedo.supabase.co',
  publishableKey: 'sb_publishable_rmzzOmqk0jM7vYqKqzCj8g_L6YoTlru'
});
const STATE_KEY = 'desfile-rosa-demo-v1';
const initial = () => ({ totalCents: 0, goalCents: 10000000, count: 0, generation: 'initial', last: null });
export const money = value => new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(value / 100);
export function cents(value) {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Usa un monto positivo con hasta dos decimales.');
  const amount = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000000) throw new Error('El monto debe estar entre $0.01 y $100,000,000.');
  return amount;
}
const listeners = new Set();
const mode = new URLSearchParams(location.search).get('demo') === '1' ? 'demo' : 'supabase';
let state = initial(), history = [], connection = 'Iniciando…', ready = false, user = null, isAdmin = false, isOwner = false, client, realtime = false, sessionRevision = 0;
export function subscribe(fn) { listeners.add(fn); fn({ state, history: history.slice(0, 30), mode, connection, ready, user, isAdmin, isOwner }); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn({ state, history: history.slice(0, 30), mode, connection, ready, user, isAdmin, isOwner }); }
function readLocal() {
  const raw = localStorage.getItem(STATE_KEY);
  const data = raw ? JSON.parse(raw) : { state: initial(), history: [] };
  if (!data.state || !Array.isArray(data.history)) throw new Error('No se pudieron recuperar los aportes de prueba.');
  state = data.state; history = data.history;
}
function localChange(fn) {
  if (!navigator.locks) return Promise.reject(new Error('Abre el modo de prueba en un navegador actualizado.'));
  return navigator.locks.request(STATE_KEY, () => {
    readLocal(); fn(); localStorage.setItem(STATE_KEY, JSON.stringify({ state, history })); emit();
  });
}
function writable() {
  if (!ready) throw new Error('Espera a que se actualicen los datos del evento. Revisa tu conexión e inténtalo de nuevo.');
  if (mode !== 'demo' && !isAdmin) throw new Error('Inicia sesión con una cuenta de operador autorizada en Meta y ajustes.');
}
export function databaseError(error) {
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(error?.code)) return 'El evento todavía no está disponible. Contacta a la organización.';
  if (error?.code === '42501') return 'Tu cuenta no tiene permiso para realizar esta acción. Contacta a la organización.';
  if (error?.code === '22023') return error.message;
  if (error?.code === '23514') return 'El importe o el total supera los límites admitidos.';
  if (error?.code === 'invalid_credentials') return 'Correo o contraseña incorrectos.';
  if (error?.code === 'user_banned') return 'Esta cuenta está deshabilitada. Contacta a la organización.';
  if (error?.code === 'email_not_confirmed') return 'Confirma tu correo antes de iniciar sesión.';
  if (error?.status === 429) return 'Espera unos minutos antes de volver a intentarlo.';
  return 'No se pudo completar la operación. Revisa tu conexión e inténtalo de nuevo.';
}
class EventError extends Error {}
async function rpc(name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new EventError(databaseError(error));
  return data;
}
let refreshTask, dirty = false;
// Coalescer: una respuesta antigua nunca puede sobrescribir una consulta posterior.
async function refresh() {
  dirty = true;
  if (refreshTask) return refreshTask;
  refreshTask = (async () => {
    while (dirty) {
      dirty = false;
      try {
        const data = await rpc('get_event_snapshot');
        if (!data?.event) throw new EventError('No hay un evento activo. Contacta a la organización.');
        const e = data.event;
        state = { totalCents: Number(e.total_cents), goalCents: Number(e.goal_cents), count: e.donation_count, generation: e.id, last: e.last_donation };
        history = data.donations.map(d => ({ id: d.id, amountCents: Number(d.amount_cents), name: d.donor_name, message: d.message, createdAt: d.created_at }));
        ready = true; connection = realtime ? 'Conectado en vivo' : 'Actualizando aportes';
      } catch (error) { ready = false; connection = error instanceof EventError ? error.message : databaseError(error); }
      emit();
    }
  })();
  try { await refreshTask; } finally { refreshTask = null; }
}
async function mutation(name, args) {
  await rpc(name, args);
  // La RPC ya confirmó la escritura. No reenviar aunque falle la lectura posterior.
  await refresh();
}
export async function addDonation(data, id) {
  writable();
  const donation = { id, amountCents: cents(data.amount), name: data.name.trim().slice(0, 80) || 'Anónimo', message: data.message.trim().slice(0, 240), createdAt: Date.now() };
  if (mode === 'demo') return localChange(() => {
    if (history.some(d => d.id === id)) return;
    if (!Number.isSafeInteger(state.totalCents + donation.amountCents)) throw new Error('El total supera el límite admitido.');
    state = { ...state, totalCents: state.totalCents + donation.amountCents, count: state.count + 1, last: donation };
    history = [donation, ...history];
  });
  return mutation('register_donation', { p_id: id, p_event_id: state.generation, p_amount_cents: donation.amountCents, p_donor_name: donation.name, p_message: donation.message });
}
export async function editDonation(original, data, eventId) {
  writable();
  const desired = { amountCents: cents(data.amount), name: data.name.trim().slice(0, 80) || 'Anónimo', message: data.message.trim().slice(0, 240) };
  const expected = { amountCents: original.amountCents, name: original.name, message: original.message };
  if (mode === 'demo') return localChange(() => {
    if (state.generation !== eventId) throw new Error('El evento cambió. Vuelve a abrir el aporte.');
    const item = history.find(d => d.id === original.id);
    if (!item) throw new Error('El aporte ya no está disponible.');
    const current = { amountCents: item.amountCents, name: item.name, message: item.message };
    if (JSON.stringify(current) === JSON.stringify(desired)) return;
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('Otro operador modificó este aporte. Ciérralo y vuelve a abrirlo para ver los cambios.');
    const totalCents = state.totalCents + desired.amountCents - item.amountCents;
    if (!Number.isSafeInteger(totalCents) || totalCents < 0) throw new Error('El total supera el límite admitido.');
    const updated = { ...item, ...desired };
    history = history.map(d => d.id === item.id ? updated : d);
    state = { ...state, totalCents, last: state.last?.id === item.id ? updated : state.last };
  });
  return mutation('edit_donation', { p_id: original.id, p_event_id: eventId, p_amount_cents: desired.amountCents, p_donor_name: desired.name, p_message: desired.message, p_expected: expected });
}
export async function deleteDonation(original, eventId) {
  writable();
  const expected = { amountCents: original.amountCents, name: original.name, message: original.message };
  if (mode === 'demo') return localChange(() => {
    if (state.generation !== eventId) throw new Error('El evento cambió. Vuelve a abrir el aporte.');
    const item = history.find(d => d.id === original.id);
    if (!item) return;
    if (JSON.stringify(expected) !== JSON.stringify({ amountCents: item.amountCents, name: item.name, message: item.message })) throw new Error('El aporte fue modificado. Cierra esta ventana y vuelve a abrirlo antes de eliminarlo.');
    history = history.filter(d => d.id !== item.id);
    state = { ...state, totalCents: state.totalCents - item.amountCents, count: state.count - 1, last: state.last?.id === item.id ? history[0] || null : state.last };
  });
  return mutation('delete_donation', { p_id: original.id, p_event_id: eventId, p_expected: expected });
}
export async function setGoal(value) {
  writable(); const goalCents = cents(value);
  if (mode === 'demo') return localChange(() => { state = { ...state, goalCents }; });
  return mutation('set_event_goal', { p_event_id: state.generation, p_goal_cents: goalCents });
}
export async function resetEvent() {
  writable();
  if (mode === 'demo') return localChange(() => { state = { ...initial(), goalCents: state.goalCents, generation: crypto.randomUUID() }; history = []; });
  return mutation('reset_event', { p_event_id: state.generation });
}
async function applySession(session) {
  const revision = ++sessionRevision;
  user = session?.user || null; isAdmin = false; isOwner = false; emit();
  if (user) {
    const { data, error } = await client.from('operators').select('user_id').eq('user_id', user.id).maybeSingle();
    const authorized = !error && !!data;
    if (revision !== sessionRevision) return authorized;
    isAdmin = authorized; emit();
    if (authorized) {
      const { data: principal, error: ownerError } = await client.from('user_administration').select('user_id').eq('user_id', user.id).maybeSingle();
      if (revision !== sessionRevision) return authorized;
      isOwner = !ownerError && !!principal; emit();
    }
    return authorized;
  }
}
export async function login(email, password) {
  if (!client) throw new Error('Vuelve al evento para iniciar sesión con tu cuenta.');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(databaseError(error));
  const authorized = await applySession(data.session);
  if (!authorized) throw new Error('Tu cuenta no tiene acceso al panel. Contacta a la organización.');
}
export async function createOperator(email, password) {
  if (!client || !isOwner) throw new Error('Solo la cuenta principal puede registrar usuarios.');
  const { data, error } = await client.functions.invoke('create-operator', { body: { email, password } });
  if (error) {
    throw new Error(await operatorFunctionError(error, 'No se pudo registrar al usuario. Comprueba la conexión y vuelve a intentarlo.', `${supabaseConfig.url}/functions/v1/create-operator`));
  }
  if (!data?.message) throw new Error('No se pudo confirmar el registro. Comprueba la cuenta antes de volver a intentarlo.');
  return data.message;
}
export async function manageOperator(action, details = {}) {
  if (!client || !isOwner) throw new Error('Solo la cuenta principal puede administrar usuarios.');
  const { data, error } = await client.functions.invoke('manage-operators', { body: { action, ...details } });
  if (error) {
    throw new Error(await operatorFunctionError(error, 'No se pudo completar la operación. Comprueba la conexión e inténtalo de nuevo.', `${supabaseConfig.url}/functions/v1/manage-operators`));
  }
  if (!data || (action === 'list' ? !Array.isArray(data.users) : !data.message)) throw new Error('No se pudo confirmar la operación.');
  return data;
}
export async function logout() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw new Error(databaseError(error));
  await applySession(null);
}
export async function initialize() {
  try {
    if (mode === 'demo') {
      readLocal(); connection = 'Modo de prueba'; ready = true;
      addEventListener('storage', e => { if (e.key === STATE_KEY) { try { readLocal(); emit(); } catch { ready = false; connection = 'No se pudieron recuperar los aportes de prueba'; emit(); } } });
      emit(); return;
    }
    connection = 'Conectando al evento…'; emit();
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
    client = createClient(supabaseConfig.url, supabaseConfig.publishableKey);
    // No esperar llamadas Auth dentro del callback: Supabase mantiene un bloqueo interno.
    client.auth.onAuthStateChange((_event, session) => { setTimeout(() => { applySession(session).catch(() => { isAdmin = false; isOwner = false; emit(); }); }, 0); });
    client.channel('desfile-rosa-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => { refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => { refresh(); })
      .subscribe(status => { realtime = status === 'SUBSCRIBED'; if (status !== 'CLOSED') refresh(); });
    await refresh();
    // Respaldo si WebSocket está bloqueado o se pierde una notificación.
    setInterval(() => { if (!document.hidden) refresh(); }, 10000);
    addEventListener('online', () => { refresh(); });
    addEventListener('offline', () => { ready = false; connection = 'Sin conexión · no se pueden registrar aportes'; emit(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  } catch { ready = false; connection = 'No se pudo conectar al evento. Revisa tu conexión y vuelve a intentarlo.'; emit(); }
}
