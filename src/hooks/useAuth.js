/**
 * src/hooks/useAuth.js
 * ------------------------------------------------------------
 * Contexto global que expone:
 *   • user     →  objeto Firebase Auth
 *   • isAdmin  →  true  si  admin:true  (claim o doc)  O  superAdmin:true
 *   • isSuper  →  true  si  superAdmin:true  (claim o doc)
 *
 * Flujo:
 *  1) Espera a que Firebase Auth detecte el usuario.
 *  2) Lee custom‑claims  →  claims.admin , claims.superAdmin
 *  3) Lee documento /usuarios/{uid}
 *  4) Combina la info y establece flags.
 *  5) Si el doc NO existe ⇒ expulsa al usuario (signOut + redirect '/').
 *
 * Nota: superAdmin implica admin automáticamente.
 * ------------------------------------------------------------
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/auth/firebase';
import { useRouter } from 'next/router';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [isAdmin, setAdmin]     = useState(false);
  const [isSuper, setSuper]     = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      if (!u) {                            // sesión cerrada
        setUser(null);
        setAdmin(false);
        setSuper(false);
        router.replace('/');
        return;
      }

      /* ───── 1. Claims ───── */
      const { claims } = await u.getIdTokenResult(true);
      let superFlag = !!claims.superAdmin;          // claim
      let adminFlag = !!claims.admin || superFlag;  // super ⇒ admin

      /* ───── 2. Documento Firestore ───── */
      const snap = await getDoc(doc(db, 'usuarios', u.uid));
      if (!snap.exists()) {
        alert('Usuario no autorizado');
        await signOut(auth);
        return;
      }
      const data = snap.data();
      if (data.superAdmin === true) superFlag = true;
      if (data.admin === true || data.tipo === 'administrador') adminFlag = true;

      /* ───── 3. Actualizar estado global ───── */
      setUser(u);
      setSuper(superFlag);
      setAdmin(adminFlag || superFlag);     // super siempre hereda admin
    });

    return unsub;
  }, []);

  return (
    <AuthCtx.Provider value={{ user, isAdmin, isSuper }}>
      {children}
    </AuthCtx.Provider>
  );
}
