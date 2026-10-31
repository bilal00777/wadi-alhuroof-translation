/* ==========================================================
   Backend layer: team sign-in (Firebase Auth) and shared
   storage (Cloud Firestore). The rest of the app only talks
   to the functions exported here.
   ========================================================== */
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';

export const configured =
  !!firebaseConfig.apiKey && !String(firebaseConfig.apiKey).startsWith('YOUR_') &&
  !!firebaseConfig.projectId && !String(firebaseConfig.projectId).startsWith('YOUR_');

let fb = null; // lazily loaded SDK modules + instances

async function load() {
  if (fb) return fb;
  if (!configured) throw new Error('not-configured');
  const [app, auth, store] = await Promise.all([
    import(`${SDK}/firebase-app.js`),
    import(`${SDK}/firebase-auth.js`),
    import(`${SDK}/firebase-firestore.js`)
  ]);
  const a = app.initializeApp(firebaseConfig);
  fb = { app, auth, store, authInst: auth.getAuth(a), db: store.getFirestore(a) };
  return fb;
}

/* ---------- Auth ---------- */
export function onUser(cb) {
  let unsub = () => {};
  let cancelled = false;
  load().then((m) => {
    if (cancelled) return;
    unsub = m.auth.onAuthStateChanged(m.authInst, (u) => cb(u ? { uid: u.uid, email: (u.email || '').toLowerCase() } : null));
  }).catch(() => cb(null));
  return () => { cancelled = true; unsub(); };
}

export async function signIn(email, password) {
  const m = await load();
  return m.auth.signInWithEmailAndPassword(m.authInst, email.trim(), password);
}

export async function logOut() {
  const m = await load();
  return m.auth.signOut(m.authInst);
}

export async function resetPassword(email) {
  const m = await load();
  return m.auth.sendPasswordResetEmail(m.authInst, email.trim());
}

/* ---------- Documents ---------- */
export function watchDocs(onData, onError) {
  let unsub = () => {};
  let cancelled = false;
  load().then((m) => {
    if (cancelled) return;
    const col = m.store.collection(m.db, 'documents');
    unsub = m.store.onSnapshot(col,
      (snap) => onData(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
      (err) => onError && onError(err));
  }).catch((e) => onError && onError(e));
  return () => { cancelled = true; unsub(); };
}

export async function saveDoc(d, email) {
  const m = await load();
  const copy = JSON.parse(JSON.stringify(d));
  copy.updatedAt = Date.now();
  copy.updatedBy = email;
  if (!copy.createdBy) copy.createdBy = email;
  await m.store.setDoc(m.store.doc(m.db, 'documents', copy.id), copy);
  return copy;
}

export async function removeDoc(id) {
  const m = await load();
  await m.store.deleteDoc(m.store.doc(m.db, 'documents', id));
}

/* ---------- Numbering counters (shared by the whole team) ---------- */
export function watchCounters(onData, onError) {
  let unsub = () => {};
  let cancelled = false;
  load().then((m) => {
    if (cancelled) return;
    unsub = m.store.onSnapshot(m.store.doc(m.db, 'meta', 'counters'),
      (snap) => onData(snap.exists() ? snap.data() : {}),
      (err) => onError && onError(err));
  }).catch((e) => onError && onError(e));
  return () => { cancelled = true; unsub(); };
}

export async function bumpCounter(type, n) {
  const m = await load();
  const ref = m.store.doc(m.db, 'meta', 'counters');
  await m.store.runTransaction(m.db, async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.exists() ? Number(snap.data()[type] || 0) : 0;
    if (n > cur) tx.set(ref, { [type]: n }, { merge: true });
  });
}
