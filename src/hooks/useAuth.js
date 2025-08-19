/**
 * src/hooks/useAuth.js
 * ------------------------------------------------------------
 * Expone: { user, checking, isAdmin, isSuper }
 * Reconoce admin/super por claims y por doc:
 *   - claims.admin, claims.super, claims.superAdmin
 *   - doc.admin, doc.super, doc.superAdmin, doc.tipo === 'administrador'
 * Super SIEMPRE implica admin.
 * Si el doc /usuarios/{uid} NO existe ⇒ signOut.
 * ------------------------------------------------------------
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, getIdTokenResult } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/auth/firebase';
import { useRouter } from 'next/router';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [checking, setCheck]  = useState(true);
  const [isAdmin, setAdmin]   = useState(false);
  const [isSuper, setSuper]   = useState(false);
  const router = useRouter();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setCheck(true);

      if (!u) {
        setUser(null);
        setAdmin(false);
        setSuper(false);
        setCheck(false);
        try { router.replace('/'); } catch (_) {}
        return;
      }

      try {
        // 1) Claims
        const { claims = {} } = await getIdTokenResult(u, true);
        let superFlag =
          !!claims.superAdmin || !!claims.super;
        let adminFlag =
          !!claims.admin || superFlag;

        // 2) Doc /usuarios/{uid}
        const snap = await getDoc(doc(db, 'usuarios', u.uid));
        if (!snap.exists()) {
          alert('Usuario no autorizado');
          await signOut(auth);
          setCheck(false);
          return;
        }
        const data = snap.data() || {};

        // Acepta todas las variantes en el doc
        if (data.superAdmin === true || data.super === true) superFlag = true;
        if (data.admin === true || (typeof data.tipo === 'string' && data.tipo.toLowerCase() === 'administrador')) {
          adminFlag = true;
        }
        // Super hereda admin
        if (superFlag) adminFlag = true;

        // 3) Estado global
        setUser(u);
        setSuper(!!superFlag);
        setAdmin(!!adminFlag);
      } catch (e) {
        console.error('useAuth error:', e);
        // como fallback, no marcamos admin/super
        setUser(u);
        setSuper(false);
        setAdmin(false);
      } finally {
        setCheck(false);
      }
    });

    return unsub;
  }, [router]);

  return (
    <AuthCtx.Provider value={{ user, checking, isAdmin, isSuper }}>
      {children}
    </AuthCtx.Provider>
  );
}
