import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../auth/firebase';                 // ← ruta corregida
import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Home() {
  const [status, setStatus] = useState('checking'); // checking | ready | unauthorized
  const router   = useRouter();
  const provider = new GoogleAuthProvider();

  const loginGoogle = async () => {
    try {
      await signInWithPopup(auth, provider);
      // onAuthStateChanged decidirá…
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStatus('ready');
        return;
      }
      const ref  = doc(db, 'usuarios', user.uid);   // colección/root: usuarios
      const snap = await getDoc(ref);

      if (snap.exists()) {
        router.replace('/mapa');
      } else {
        await signOut(auth);
        setStatus('unauthorized');
      }
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
      {status === 'checking' && <p>Cargando…</p>}

      {status === 'ready' && (
        <button
          onClick={loginGoogle}
          className="rounded bg-blue-600 px-6 py-3 text-lg font-semibold hover:bg-blue-700"
        >
          Iniciar sesión con Google
        </button>
      )}

      {status === 'unauthorized' && (
        <div className="space-y-4 text-center">
          <p className="text-red-400">Correo no autorizado</p>
          <button
            onClick={() => signOut(auth)}
            className="rounded border px-4 py-2 hover:bg-gray-800"
          >
            Probar con otra cuenta
          </button>
        </div>
      )}
    </div>
  );
}
