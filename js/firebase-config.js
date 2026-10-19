// Configuración pública de una app Firebase, nunca credenciales de administrador.
// Para compartir una conexión entre todos los visitantes, asigna aquí el objeto
// público real que entrega Firebase. null activa una demostración local explícita.
export const firebaseConfig = null;

const STATE_KEY = 'desfile-rosa-demo-v1';
const CONFIG_KEY = 'desfile-rosa-firebase-v1';
const initial = () => ({ totalCents: 0, goalCents: 10000000, count: 0, generation: 'initial', last: null });
export const money = cents => new Intl.NumberFormat('es-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export function cents(value) {
  const text = String(value).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Usa un monto positivo con hasta dos decimales.');
  const amount = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000000) throw new Error('El monto debe estar entre $0.01 y $100,000,000.');
  return amount;
}
export function saveConfig(text) {
  const c = JSON.parse(text);
  if (!c || typeof c !== 'object' || !['apiKey', 'authDomain', 'projectId', 'appId'].every(k => typeof c[k] === 'string' && c[k].trim())) throw new Error('Faltan apiKey, authDomain, projectId o appId en el JSON.');
  if ('private_key' in c || 'private_key_id' in c || c.type === 'service_account') throw new Error('No uses cuentas de servicio. Solo la configuración pública web.');
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}
function readConfig() {
  const saved = localStorage.getItem(CONFIG_KEY);
  return firebaseConfig || (saved ? JSON.parse(saved) : null);
}
const listeners = new Set();
let history = [], state = initial(), mode = 'demo', connection = 'Iniciando…', ready = false, user = null, isAdmin = false, remote;
export function subscribe(fn) { listeners.add(fn); fn({ state, history, mode, connection, ready, user, isAdmin }); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn({ state, history, mode, connection, ready, user, isAdmin }); }
function readLocal() {
  const raw = localStorage.getItem(STATE_KEY);
  const data = raw ? JSON.parse(raw) : { state: initial(), history: [] };
  if (!data.state || !Array.isArray(data.history)) throw new Error('Los datos locales no son válidos.');
  state = data.state; history = data.history;
}
function localChange(fn) {
  // Web Locks impide que dos pestañas pierdan aportes al escribir simultáneamente.
  if (!navigator.locks) return Promise.reject(new Error('Este navegador no permite escrituras seguras entre pestañas. Usa Chrome, Edge o Firefox actualizados.'));
  return navigator.locks.request(STATE_KEY, () => {
    readLocal();
    const result = fn();
    localStorage.setItem(STATE_KEY, JSON.stringify({ state, history }));
    emit(); return result;
  });
}
function writable() {
  if (!ready) throw new Error('Espera a que la conexión esté lista.');
  if (mode === 'firebase' && !isAdmin) throw new Error('Inicia sesión con una cuenta de operador autorizada en Meta y ajustes.');
}
export async function addDonation(data, id) {
  writable();
  const donation = { id, amountCents: cents(data.amount), name: data.name.trim().slice(0, 80) || 'Anónimo', message: data.message.trim().slice(0, 240), createdAt: Date.now() };
  if (mode === 'demo') return localChange(() => {
    if (history.some(d => d.id === id)) return;
    if (!Number.isSafeInteger(state.totalCents + donation.amountCents)) throw new Error('El total supera el límite admitido.');
    state = { ...state, totalCents: state.totalCents + donation.amountCents, count: state.count + 1, last: donation };
    history = [donation, ...history].slice(0, 30);
  });
  const { f, db, meta } = remote;
  await f.runTransaction(db, async tx => {
    const snapshot = await tx.get(meta);
    if (!snapshot.exists()) throw new Error('Guarda primero la meta para inicializar el evento.');
    const s = snapshot.data();
    const ref = f.doc(db, 'events', s.generation, 'donations', id);
    if ((await tx.get(ref)).exists()) return;
    if (!Number.isSafeInteger(s.totalCents + donation.amountCents)) throw new Error('El total supera el límite admitido.');
    const item = { ...donation, createdAt: f.serverTimestamp() };
    tx.set(ref, item);
    tx.update(meta, { totalCents: s.totalCents + donation.amountCents, count: s.count + 1, last: item });
  });
}
export async function setGoal(value) {
  writable(); const goalCents = cents(value);
  if (mode === 'demo') return localChange(() => { state = { ...state, goalCents }; });
  const { f, db, meta } = remote;
  await f.runTransaction(db, async tx => {
    const snap = await tx.get(meta);
    tx.set(meta, snap.exists() ? { ...snap.data(), goalCents } : { ...initial(), generation: crypto.randomUUID(), goalCents });
  });
}
export async function resetEvent() {
  writable();
  const generation = crypto.randomUUID();
  if (mode === 'demo') return localChange(() => { state = { ...initial(), goalCents: state.goalCents, generation }; history = []; });
  const { f, db, meta } = remote;
  await f.runTransaction(db, async tx => {
    const snap = await tx.get(meta);
    tx.set(meta, { ...initial(), goalCents: snap.exists() ? snap.data().goalCents : initial().goalCents, generation });
  });
}
export async function login(email, password) {
  if (!remote) throw new Error('Conecta primero Firebase. La demostración no necesita iniciar sesión.');
  const result = await remote.a.signInWithEmailAndPassword(remote.auth, email, password);
  const admin = await remote.f.getDoc(remote.f.doc(remote.db, 'admins', result.user.uid));
  if (!admin.exists()) throw new Error('La cuenta no está autorizada. Añade su UID a admins en Firebase.');
}
export async function logout() { if (remote) await remote.a.signOut(remote.auth); }
export async function initialize() {
  try {
    const config = readConfig();
    if (!config) {
      readLocal(); connection = 'Demostración local'; ready = true;
      addEventListener('storage', e => { if (e.key === STATE_KEY) { try { readLocal(); emit(); } catch { connection = 'Error de almacenamiento'; ready = false; emit(); } } });
      emit(); return;
    }
    mode = 'firebase'; connection = 'Conectando a Firebase…'; emit();
    const [core, f, a] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
    ]);
    const app = core.initializeApp(config), db = f.getFirestore(app), auth = a.getAuth(app), meta = f.doc(db, 'meta', 'event');
    remote = { f, a, db, auth, meta };
    a.onAuthStateChanged(auth, async current => {
      user = current; isAdmin = false; emit();
      if (current) {
        try { const snap = await f.getDoc(f.doc(db, 'admins', current.uid)); if (auth.currentUser?.uid === current.uid) isAdmin = snap.exists(); }
        catch { isAdmin = false; }
        emit();
      }
    });
    let generation, stopHistory;
    f.onSnapshot(meta, { includeMetadataChanges: true }, snapshot => {
      ready = !snapshot.metadata.fromCache;
      connection = ready ? 'Conectado en vivo' : 'Reconectando · datos en caché';
      state = snapshot.exists() ? snapshot.data() : initial();
      if (generation !== state.generation) {
        generation = state.generation; history = []; stopHistory?.();
        const q = f.query(f.collection(db, 'events', generation, 'donations'), f.orderBy('createdAt', 'desc'), f.limit(30));
        stopHistory = f.onSnapshot(q, snap => { history = snap.docs.map(d => d.data({ serverTimestamps: 'estimate' })); emit(); }, () => { connection = 'No se pudo leer el historial'; emit(); });
      }
      emit();
    }, error => { ready = false; connection = error.code === 'permission-denied' ? 'Acceso denegado: revisa las reglas de Firebase' : 'Error de conexión con Firebase'; emit(); });
  } catch { ready = false; connection = 'No se pudo iniciar. Revisa la configuración y tu conexión.'; emit(); }
}
