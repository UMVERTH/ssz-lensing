import { useEffect, useState } from 'react';
import { useRouter }           from 'next/router';
import { auth, db }            from '../auth/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from 'firebase/auth';
import { doc, getDoc }         from 'firebase/firestore';

export default function LoginPage() {
  const [status, setStatus] = useState('checking'); // checking | ready | unauthorized
  const router   = useRouter();
  const provider = new GoogleAuthProvider();

  const login = async () => {
    try { await signInWithPopup(auth, provider); } catch (e) { console.error(e); }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setStatus('ready'); return; }

      const ok = (await getDoc(doc(db, 'usuarios', user.uid))).exists();
      if (ok) router.replace('/mapa');
      else {
        await signOut(auth);
        setStatus('unauthorized');
      }
    });
    return () => unsub();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-600 via-blue-600 to-purple-700">
      <div className="w-[320px] rounded-xl bg-white/10 p-8 text-center backdrop-blur-md">
        <h1 className="mb-6 text-2xl font-bold text-white">Bienvenido a&nbsp;m-Apps</h1>

        {status === 'checking' && <p className="text-white">Cargando…</p>}

        {status === 'ready' && (
          <button
            onClick={login}
            className="w-full rounded-lg bg-white/90 py-3 text-base font-semibold text-gray-800 shadow hover:bg-white"
          >
            Iniciar sesión con Google
          </button>
        )}

        {status === 'unauthorized' && (
          <>
            <p className="mb-4 rounded bg-red-500/90 py-2 text-sm text-white">
              Correo no autorizado
            </p>
            <button
              onClick={() => signOut(auth)}
              className="w-full rounded-lg bg-white/90 py-3 text-base font-semibold text-gray-800 shadow hover:bg-white"
            >
              Probar con otra cuenta
            </button>
          </>
        )}
      </div>
    </div>
  );
}
