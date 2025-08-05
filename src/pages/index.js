/* ----------------------------------------------------------------------
 *  pages/index.js · Login “Glass Frost”  v29
 * -------------------------------------------------------------------- */
import { useEffect, useState, useTransition } from 'react';
import Head           from 'next/head';
import Image          from 'next/image';
import { useRouter }  from 'next/router';
import { auth, db }   from '../auth/firebase';
import {
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
}                      from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

/* ───────── helpers ───────── */
const provider = new GoogleAuthProvider();
/* Muestra SIEMPRE el selector para poder escribir otra cuenta */
provider.setCustomParameters({ prompt: 'select_account' });

const isAuthorized = async uid =>
  (await getDoc(doc(db, 'usuarios', uid))).exists();

/* ───────── component ───────── */
export default function LoginPage() {
  const [status, setStatus]          = useState('checking');
  const [isPending, startTransition] = useTransition();
  const router                       = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      if (!user) { setStatus('ready'); return; }
      if (await isAuthorized(user.uid)) router.replace('/mapa');
      else { await signOut(auth); setStatus('unauthorized'); }
    });
    return () => unsub();
  }, [router]);

  const loginWithGoogle = () =>
    startTransition(async () => {
      try { await signInWithPopup(auth, provider); }
      catch (e) { console.error(e); }
    });

  return (
    <>
      <Head>
        <title>Sistema de Cartografía Digital | Acceso</title>
        <meta name="description" content="Sistema de Cartografía Digital" />
      </Head>

      <main className="grid min-h-screen grid-cols-12 bg-gradient-to-br from-sky-100 via-white to-sky-50">
        {/* PANEL */}
        <aside className="relative col-span-12 flex items-center justify-center lg:col-span-5">
          <div className="mx-8 my-20 w-full max-w-md rounded-3xl
                          bg-white/80 p-10 shadow-xl ring-1 ring-black/10
                          backdrop-blur-lg">
            {/* logo + título pegados */}
            <div className="mb-10 flex flex-col items-center gap-0">
              <Image
                src="/logo-sicdi.png"
                alt="Logo SIC-DI"
                width={96}
                height={96}
                priority
                className="block select-none"
              />
              <h1 className="-mt-6 text-lg font-semibold text-gray-700 leading-none">
                Sistema de Cartografía Digital
              </h1>
            </div>

            {/* ESTADOS ******************************** */}
            {status === 'checking' && (
              <p className="text-center text-gray-500">Verificando sesión…</p>
            )}

            {status === 'ready' && (
              <button
                onClick={loginWithGoogle}
                disabled={isPending}
                className="flex w-full items-center justify-center gap-3
                           rounded-xl bg-sky-600 py-3 font-medium text-white
                           shadow hover:bg-sky-700 focus:outline-none
                           focus:ring-4 focus:ring-sky-300 disabled:opacity-50">
                {/* icono Google */}
                <svg width="22" height="22" viewBox="0 0 256 262">
                  <path fill="#EA4335" d="M255.5 133.3a158 158 0 0 0-2.3-26.7H130.5v50.6h70.1a60 60 0 0 1-25.9 39.3v32.5h41.9c24.6-22.6 39-56 39-95.7z"/>
                  <path fill="#34A853" d="M130.5 262c35.3 0 64.8-11.6 86.4-31.6l-41.9-32.5c-11.7 7.8-26.7 12.5-44.4 12.5-34.1 0-63.1-23.1-73.4-54.1H13.5v33.9A131.5 131.5 0 0 0 130.5 262z"/>
                  <path fill="#4A90E2" d="M57 156.3a78.5 78.5 0 0 1 0-50.6v-33.9H13.5a131.5 131.5 0 0 0 0 118.4L57 156.3z"/>
                  <path fill="#FBBC05" d="M130.5 51.1c19.2 0 36.4 6.6 50 18l37.5-37.5C207.9 12.3 178.3 0 130.5 0A131.5 131.5 0 0 0 13.5 71.8l43.5 33.9c10.4-31 39.3-54.6 73.5-54.6z"/>
                </svg>
                Continuar con Google
              </button>
            )}

            {status === 'unauthorized' && (
              <>
                <p className="mb-4 rounded-md bg-red-600 py-2 text-center text-sm text-white">
                  Correo no autorizado
                </p>
                <button
                  onClick={() => signOut(auth)}
                  disabled={isPending}
                  className="w-full rounded-xl bg-gray-200 py-3 font-medium text-gray-800
                             shadow hover:bg-gray-300 focus:outline-none
                             focus:ring-4 focus:ring-gray-400 disabled:opacity-50">
                  Probar con otra cuenta
                </button>
              </>
            )}
          </div>

          {/* decoración cuadriculada */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full text-sky-200/40"
            viewBox="0 0 160 160" fill="none">
            {[...Array(32)].map((_, i) => (
              <path key={i}
                d={`M${i*5} 0V160M0 ${i*5}H160`}
                stroke="currentColor" strokeWidth=".2" />
            ))}
          </svg>
        </aside>

        {/* HERO */}
        <section className="relative col-span-12 lg:col-span-7">
          <Image
            src="/hero-sicdi.png"
            alt="Mapa catastral"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-l
                          from-white/0 via-white/10 to-white/70 backdrop-blur-sm"/>
        </section>
      </main>
    </>
  );
}
