'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Plus } from 'lucide-react';
import {
  collection, getDocs, updateDoc, doc,
} from 'firebase/firestore';
import { db, functions } from '@/auth/firebase';
import { httpsCallable } from 'firebase/functions';

const FX = { type: 'tween', duration: 0.25, ease: 'easeOut' };

export default function AdminModal({ open, onClose, currentUid, isSuper }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoad] = useState(true);

  const [email, setEmail] = useState('');
  const [adminFlag, setAdminFlag] = useState(false);
  const [saving, setSaving] = useState(false);

  /* cargar usuarios */
  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoad(true);
      const snap = await getDocs(collection(db, 'usuarios'));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoad(false);
    })();
  }, [open]);

  /* cambiar admin */
  const toggleAdmin = async (uid, current) => {
    if (!isSuper || uid === currentUid) return;
    await updateDoc(doc(db, 'usuarios', uid), { admin: !current });
    setUsers(u => u.map(p => (p.id === uid ? { ...p, admin: !current } : p)));
  };

  /* alta por correo */
  const addByEmail = async e => {
    e.preventDefault();
    if (!isSuper || !email) return;
    setSaving(true);
    try {
      const fn = httpsCallable(functions, 'createUserByEmail');
      const { data } = await fn({ email, admin: adminFlag });
      setUsers(u => [...u, { id: data.uid, email, admin: adminFlag }]);
      setEmail(''); setAdminFlag(false);
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* fondo */}
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FX}
            onClick={onClose}
          />

          {/* ventana */}
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={FX}
          >
            {/* ---------- AQUÍ forzamos colores claros ---------- */}
            <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg 
                            bg-white text-gray-900 dark:bg-white dark:text-gray-900
                            shadow-2xl ring-1 ring-gray-200 flex flex-col">

              {/* Header */}
              <div className="flex items-center justify-between bg-blue-600 text-white px-6 py-3">
                <h2 className="text-base font-semibold">Gestión de usuarios</h2>
                <button onClick={onClose} className="p-1.5 rounded hover:bg-white/20">
                  <X size={18} />
                </button>
              </div>

              {/* Contenido desplazable */}
              <div className="overflow-auto p-4 sidebar-scrollbar space-y-8">
                {/* tabla */}
                <section>
                  <h3 className="text-sm font-semibold mb-3">Usuarios</h3>

                  {loading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="animate-spin text-blue-600" size={28} />
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 pr-4">UID</th>
                          <th className="py-2 pr-4">Correo</th>
                          <th className="py-2">Admin</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(u => (
                          <tr key={u.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-mono text-xs truncate max-w-[9rem]">{u.id}</td>
                            <td className="py-2 pr-4">{u.email}</td>
                            <td className="py-2">
                              <input
                                type="checkbox"
                                className="accent-blue-600"
                                disabled={!isSuper || u.id === currentUid}
                                checked={u.admin === true}
                                onChange={() => toggleAdmin(u.id, u.admin === true)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>

                {/* alta */}
                <section>
                  <h3 className="text-sm font-semibold mb-2">Autorizar por correo</h3>
                  <form onSubmit={addByEmail} className="flex flex-wrap gap-4 items-end">
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="email@dominio.com"
                      required
                      disabled={!isSuper}
                      className="border rounded px-2 py-1 text-sm w-64 
                                 dark:border-gray-300 dark:bg-white dark:text-gray-900"
                    />

                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="accent-blue-600"
                        checked={adminFlag}
                        disabled={!isSuper}
                        onChange={e => setAdminFlag(e.target.checked)}
                      /> Admin
                    </label>

                    <button
                      disabled={!isSuper || saving}
                      className="flex items-center gap-2 rounded-md bg-blue-600 text-white 
                                 text-sm px-4 py-1.5 hover:bg-blue-500 disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                      Guardar
                    </button>
                  </form>
                </section>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
