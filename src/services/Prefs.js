// src/services/prefs.js
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../auth/firebase';

export async function loadPrefs(uid) {
  const ref = doc(db, 'preferencias', uid); // ← nombre correcto de la colección
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const def = { mapStyle: 'Satélite', capas: [] };
    await setDoc(ref, def);
    return def;
  }
  return snap.data();
}

export async function savePrefs(uid, data) {
  await setDoc(doc(db, 'preferencias', uid), data, { merge: true });
}
