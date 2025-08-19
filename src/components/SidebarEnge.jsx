/* ------------------------------------------------------------------
 * src/components/SidebarEnge.jsx
 * Controla apertura vía props · filtro duro por usuario
 * - Muestra SOLO capas autorizadas (si no es admin/super).
 * - No muestra el aviso si ya tiene capas autorizadas.
 * - Normaliza nombres con/sin prefijo "SICDI:".
 * - Apaga automáticamente capas activas no permitidas.
 * ---------------------------------------------------------------- */
'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, LogOut, Layers, MapPinned, ChevronRight, Settings, ShieldAlert,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/auth/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

/* ---------- utilidades ---------- */
const FX = { type: 'tween', duration: 0.25, ease: 'easeOut' };
const LS = 'sidebarFold';
const cn = (...c) => c.filter(Boolean).join(' ');

/* Workspace para normalizar nombres de capa */
const WS_PREFIX = 'SICDI:';
const norm = (n) => (n || '').replace(/^SICDI:/, '').trim();
const makeAllowedSet = (arr = []) => {
  const s = new Set();
  arr.forEach((n) => {
    const base = norm(n);
    if (!base) return;
    s.add(base);                  // 'SECTOR_02'
    s.add(`${WS_PREFIX}${base}`); // 'SICDI:SECTOR_02'
  });
  return s;
};

const Avatar = ({ src }) => (
  <img src={src || '/user.png'} alt="avatar"
       className="h-12 w-12 rounded-full object-cover border-2 border-gray-300"/>
);
const Swatch = ({ url }) => (
  url
    ? <img src={url} alt="" className="h-4 w-4 rounded-sm ring-1 ring-gray-400 object-cover"/>
    : <span className="h-4 w-4 rounded-sm bg-gray-300"/>
);
const LayerItem = ({ name, checked, onToggle, legend }) => (
  <label className="flex items-center justify-between px-4 py-1.5 cursor-pointer rounded hover:bg-gray-100">
    <span className="flex items-center gap-2 text-sm">
      <Swatch url={legend}/>
      <span className={cn(
        checked ? 'text-blue-600 font-medium' : 'text-gray-800',
        'truncate'
      )}>
        {name.replace(/^SICDI:/, '')}
      </span>
    </span>
    <input type="checkbox" className="accent-blue-600" checked={checked} onChange={onToggle}/>
  </label>
);
const Fold = ({ title, icon:Icon, open, onToggle, children }) => (
  <div className="border-b border-gray-200">
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-600 hover:bg-gray-50">
      <span className="flex items-center gap-2"><Icon size={16}/> {title}</span>
      <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration:0.2 }}>
        <ChevronRight size={16}/>
      </motion.span>
    </button>
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{height:0,opacity:0}}
          animate={{height:'auto',opacity:1}}
          exit={{height:0,opacity:0}}
          transition={FX}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  </div>
);
const StyleChips = ({ mapStyles, mapStyleActual, cambiarEstiloMapa }) => (
  <div className="flex flex-wrap gap-4 px-5 pb-5">
    {Object.entries(mapStyles).map(([lbl,url])=>(
      <button key={lbl} onClick={()=>cambiarEstiloMapa(lbl)}
        className={cn(
          'px-4 py-1.5 text-xs rounded-full border transition-colors',
          mapStyleActual===url
            ?'border-blue-600 bg-blue-600 text-white shadow'
            :'border-gray-300 text-gray-700 hover:bg-gray-100')}>
        {lbl}
      </button>
    ))}
  </div>
);

/* ---------- Sidebar principal ---------- */
export default function SidebarEnge({
  /* control externo */
  open,
  onClose = () => {},

  /* resto de props */
  user, isAdmin, isSuper,
  mapStyles, mapStyleActual, cambiarEstiloMapa,
  capas = [], activas = [], toggleCapa,
}) {
  const router = useRouter();

  /* pliegues recordados */
  const [fold, setFold] = useState(() => {
    if (typeof window === 'undefined') return { capas:true, estilos:true };
    try { return JSON.parse(localStorage.getItem(LS)) ?? { capas:true, estilos:true }; }
    catch { return { capas:true, estilos:true }; }
  });
  const toggleFold = k => {
    const n={...fold,[k]:!fold[k]}; setFold(n);
    localStorage.setItem(LS,JSON.stringify(n));
  };

  const logout = async () => { await signOut(auth); router.refresh(); };

  /* permisos por usuario (Firestore) */
  const [allowAllLayers, setAllowAllLayers] = useState(true);
  const [allowedLayers, setAllowedLayers]   = useState([]); // array plano (sin prefijo)

  useEffect(() => {
    if (!user?.uid) { setAllowAllLayers(true); setAllowedLayers([]); return; }
    const ref = doc(db, 'usuarios', user.uid);
    const unsub = onSnapshot(ref, snap => {
      const d = snap.data() || {};
      // Solo TRUE explícito significa “todas”
      setAllowAllLayers(d.allowAllLayers === true);
      const arr = Array.isArray(d.allowedLayers) ? d.allowedLayers : [];
      setAllowedLayers(arr.map(norm)); // guardamos normalizados
    });
    return () => unsub();
  }, [user?.uid]);

  const allowedSet = useMemo(() => makeAllowedSet(allowedLayers), [allowedLayers]);

  /* Capas visibles para este usuario */
  const capasFiltradas = useMemo(() => {
    if (isAdmin || isSuper) return capas;
    if (allowAllLayers === true) return capas;
    if (!capas?.length) return [];
    return capas.filter(c => allowedSet.has(c.name) || allowedSet.has(norm(c.name)));
  }, [capas, isAdmin, isSuper, allowAllLayers, allowedSet]);

  /* Apaga automáticamente capas activas NO permitidas cuando cambian permisos */
  useEffect(() => {
    if (isAdmin || isSuper) return;
    if (allowAllLayers === true) return;
    if (!Array.isArray(activas) || activas.length === 0) return;
    const forbidden = activas.filter(n => !(allowedSet.has(n) || allowedSet.has(norm(n))));
    forbidden.forEach(n => {
      try { toggleCapa(n); } catch {}
    });
  }, [allowAllLayers, allowedSet, activas, isAdmin, isSuper, toggleCapa]);

  /* Envuelve toggle para bloquear clics en capas no autorizadas */
  const safeToggleCapa = (name) => {
    if (isAdmin || isSuper || allowAllLayers === true || allowedSet.has(name) || allowedSet.has(norm(name))) {
      toggleCapa(name);
    } else {
      console.warn('Capa no autorizada:', name);
    }
  };

  /* ESC + scroll-lock */
  useEffect(() => {
    if (!open) return;
    const esc = e => e.key === 'Escape' && onClose();
    const ov  = document.body.style.overflow;
    window.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', esc);
      document.body.style.overflow = ov;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
            transition={FX} onClick={onClose}
          />

          {/* sidebar */}
          <motion.aside
            className="fixed left-0 top-0 z-50 flex h-full w-80 max-w-[90%] flex-col
                       bg-white text-gray-800 shadow-2xl"
            initial={{x:'-100%'}} animate={{x:0}} exit={{x:'-100%'}}
            transition={FX}
          >
            {/* header */}
            <div className="flex items-center justify-between px-6 py-4 bg-blue-600 text-white">
              <p className="text-base font-semibold">Opciones</p>
              <button onClick={onClose}
                      className="p-1.5 rounded hover:bg-white/20"><X size={18}/></button>
            </div>

            {/* usuario */}
            <div className="flex items-center gap-4 px-5 py-5 border-b border-gray-200">
              <Avatar src={user?.photoURL}/>
              <div className="flex-1">
                <p className="text-sm font-medium truncate">{user?.displayName||'Sin nombre'}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
              <button onClick={logout}
                className="flex h-8 w-8 items-center justify-center rounded-full
                           bg-rose-500 text-white hover:bg-rose-600">
                <LogOut size={16}/>
              </button>
            </div>

            {/* AVISO: solo si no es admin, está restringido y AÚN no tiene capas autorizadas */}
            {!(isAdmin || isSuper) && allowAllLayers !== true && (allowedLayers?.length ?? 0) === 0 && (
              <div className="mx-5 mt-4 mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <ShieldAlert className="mt-0.5 h-4 w-4" />
                <p>Tu cuenta todavía no tiene capas autorizadas. Pide a un administrador que te asigne alguna.</p>
              </div>
            )}

            {/* Capas */}
            <Fold title="Capas" icon={Layers} open={fold.capas}
                  onToggle={()=>toggleFold('capas')}>
              <div className="sidebar-scrollbar max-h-60 overflow-y-auto">
                {capasFiltradas.length ? capasFiltradas.map(c=>(
                  <LayerItem key={c.name} name={c.name} legend={c.legend}
                             checked={activas.includes(c.name)}
                             onToggle={()=>safeToggleCapa(c.name)}/>
                )) : (
                  <div className="px-4 py-2 text-sm text-gray-500">
                    {allowAllLayers === true
                      ? 'No hay capas disponibles.'
                      : 'No tienes capas autorizadas.'}
                  </div>
                )}
              </div>
            </Fold>

            <div className="h-6 border-t border-gray-200"/>

            {/* Estilo base */}
            <Fold title="Estilo base" icon={MapPinned}
                  open={fold.estilos} onToggle={()=>toggleFold('estilos')}>
              <StyleChips mapStyles={mapStyles}
                          mapStyleActual={mapStyleActual}
                          cambiarEstiloMapa={cambiarEstiloMapa}/>
            </Fold>

            {/* Admin */}
            {(isAdmin || isSuper) && (
              <Fold title="Admin" icon={Settings}
                    open={fold.admin ?? true} onToggle={()=>toggleFold('admin')}>
                <div className="px-5 pb-4">
                  <button
                    onClick={()=>{
                      router.push('/admin/usuarios');
                      onClose();
                    }}
                    className="w-full rounded-md bg-blue-600 text-white text-sm py-2 hover:bg-blue-500">
                    Ir al dashboard
                  </button>
                </div>
              </Fold>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
