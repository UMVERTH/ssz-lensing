/* ─── src/pages/admin/usuarios.jsx ─── */
'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import md5 from 'blueimp-md5';
import {
  Search, Filter, Loader2, Edit3, X, ChevronLeft, ChevronRight,
  Shield, ShieldAlert, Layers, SlidersHorizontal, Check, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { db } from '@/auth/firebase';
import { useAuth } from '@/hooks/useAuth';
import { FIELD_LABELS, ENABLED_FIELDS } from '@/utils/campos';
import { savePrefs } from '@/services/Prefs';
import { obtenerCapasWMS } from '@/services/GeoServerService';

/* ─ helpers / estilos ─ */
const cx = (...c) => c.filter(Boolean).join(' ');
const labelCapa = (n = '') => n.replace(/^SICDI:/, '').trim();

/* ─ Switch accesible ─ */
function Switch({ checked, onChange, size = 'md' }) {
  const sizes = { sm: ['h-4 w-8', 'h-3 w-3', 'translate-x-4'], md: ['h-6 w-12', 'h-5 w-5', 'translate-x-6'] };
  const [bx, dot, tx] = sizes[size] || sizes.md;
  return (
    <>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className={cx(
        'relative inline-block rounded-full bg-gray-300 peer-checked:bg-rose-600 transition ring-1 ring-inset ring-gray-300 peer-checked:ring-rose-600',
        bx
      )}>
        <span className={cx('absolute left-0.5 top-0.5 rounded-full bg-white shadow transition', 'peer-checked:' + tx, dot)} />
      </span>
    </>
  );
}

/* ─ Chip ─ */
function Chip({ text, active, onToggle, disabled }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={cx(
        'group flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition focus:outline-none',
        disabled && 'opacity-50 cursor-not-allowed',
        active ? 'border-rose-600 bg-rose-600 text-white shadow-sm' : 'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200'
      )}
      title={text}
    >
      {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
      <span className="truncate">{text}</span>
    </button>
  );
}

/* ─ Avatar ─ */
function Avatar({ name, user, size = 10 }) {
  const correo = (user.correo || user.email || '').trim().toLowerCase();
  const grav   = correo ? `https://www.gravatar.com/avatar/${md5(correo)}?d=identicon&s=128` : '';
  const src    = user.photoURL || user.avatar || user.foto || grav || '';
  const cls    = `h-${size} w-${size} rounded-full object-cover ring-2 ring-white`;
  if (src) return <img src={src} alt={name} className={cls} />;
  return <span className={cx('flex items-center justify-center bg-rose-600 text-white font-semibold', cls)}>{name?.[0] ?? '?'}</span>;
}

/* ─ Rol tag ─ */
function RoleTag({ u }) {
  const isSuper = u.super === true || u.superAdmin === true;
  const isAdmin = isSuper || u.admin === true || (typeof u.tipo === 'string' && u.tipo.toLowerCase() === 'administrador');
  if (!isAdmin) return null;
  return (
    <span className={cx(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
      isSuper ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'
    )}>
      {isSuper ? <Shield className="h-3 w-3"/> : <ShieldAlert className="h-3 w-3"/>}
      {isSuper ? 'SUPER' : 'ADMIN'}
    </span>
  );
}

/* ─ Resaltado en búsqueda (tabla) ─ */
function HL({ text, q }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/* ─ SlideOver (editor lateral) ─ */
function SlideOver({ open, onClose, children, title }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 z-50 h-full w-[min(680px,95%)] bg-white shadow-2xl flex flex-col dark:bg-neutral-900"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.25 }}
          >
            <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-neutral-800">
              <h3 className="text-base font-semibold text-gray-800 dark:text-neutral-200">{title}</h3>
              <button className="p-2 rounded hover:bg-gray-100 dark:hover:bg-neutral-800" onClick={onClose}><X className="h-5 w-5 text-gray-600 dark:text-neutral-300"/></button>
            </header>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ─ Editor de usuario ─ */
function UserEditor({ baseUser, capas, onSave, onCancel, openToast }) {
  const name = baseUser.Nombre || baseUser.nombre || baseUser.displayName || 'Sin nombre';
  const mail = baseUser.correo  || baseUser.email   || '';

  /* Estado local editable */
  const [model, setModel] = useState(() => ({
    allowPopup:  baseUser.allowPopup !== false,
    canPrint:    baseUser.canPrint   !== false,
    canDown:     baseUser.canDown    !== false,
    showPdf:     baseUser.showPdf    !== false,
    visibleFields: Array.isArray(baseUser.visibleFields) ? [...baseUser.visibleFields] : [],
    allowAllLayers: baseUser.allowAllLayers === true, // solo TRUE explícito
    allowedLayers: Array.isArray(baseUser.allowedLayers) ? [...baseUser.allowedLayers] : [],
  }));
  const [tab, setTab] = useState('permisos');

  /* ─ Plantillas de permisos ─ */
  const TEMPLATES = [
    { key:'consulta',  label:'Consulta',  v:{ allowPopup:true,  canPrint:false, canDown:false, showPdf:true } },
    { key:'operador',  label:'Operador',  v:{ allowPopup:true,  canPrint:true,  canDown:true,  showPdf:true } },
    { key:'supervisor',label:'Supervisor',v:{ allowPopup:true,  canPrint:true,  canDown:false, showPdf:true } },
  ];

  /* ─ Campos ─ */
  const visSet = useMemo(() => new Set(model.visibleFields), [model.visibleFields]);

  /* ─ Capas (búsqueda + favoritos) ─ */
  const [capasFilter, setCapasFilter] = useState('');
  const allowedSet = useMemo(() => new Set(model.allowedLayers), [model.allowedLayers]);
  const capasFiltradas = useMemo(() => {
    const q = capasFilter.trim().toLowerCase();
    if (!q) return capas;
    return capas.filter(c => labelCapa(c.name).toLowerCase().includes(q));
  }, [capas, capasFilter]);

  // Favoritos
  const LS_PIN = 'pinnedLayers';
  const [pinned, setPinned] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(LS_PIN) || '[]')); } catch { return new Set(); }
  });
  const togglePin = (n) => {
    setPinned(prev => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      localStorage.setItem(LS_PIN, JSON.stringify([...next]));
      return next;
    });
  };
  const orderedCapas = useMemo(() => {
    const arr = [...capasFiltradas];
    return arr.sort((a, b) => {
      const ap = pinned.has(a.name) ? 0 : 1;
      const bp = pinned.has(b.name) ? 0 : 1;
      return ap - bp || labelCapa(a.name).localeCompare(labelCapa(b.name), 'es');
    });
  }, [capasFiltradas, pinned]);

  /* ─ Dirty state + Ctrl/Cmd+S ─ */
  const isEqual = (a, b) => Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((v,i)=>v===b[i])
    : a === b;

  const dirty = useMemo(() => {
    const keys = ['allowPopup','canPrint','canDown','showPdf','visibleFields','allowAllLayers','allowedLayers'];
    return keys.some(k => !isEqual(baseUser[k], model[k]));
  }, [baseUser, model]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty) patchAndClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty]); // eslint-disable-line

  /* ─ Guardar ─ */
  const patchAndClose = () => {
    const patch = {};
    const keys = ['allowPopup','canPrint','canDown','showPdf','visibleFields','allowAllLayers','allowedLayers'];
    keys.forEach(k => {
      const a = baseUser[k];
      const b = model[k];
      const eq = Array.isArray(a) && Array.isArray(b)
        ? (a.length === b.length && a.every((v,i)=>v===b[i]))
        : a === b;
      if (!eq) patch[k] = b;
    });
    onSave(baseUser.id, patch, { onSuccess: () => openToast('success', 'Permisos guardados') });
  };

  const perms = [
    { k: 'allowPopup', lbl: 'Pop-ups'   },
    { k: 'canPrint',   lbl: 'Imprimir'  },
    { k: 'canDown',    lbl: 'Descargar' },
    { k: 'showPdf',    lbl: 'PDF'       },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header usuario */}
      <div className="flex items-center gap-4 p-5 border-b border-gray-200 dark:border-neutral-800">
        <Avatar name={name} user={baseUser} size={12}/>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-gray-900 dark:text-neutral-100">{name}</p>
          {mail && <p className="truncate text-sm text-gray-500">{mail}</p>}
          {/* Resumen visual */}
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full border px-2 py-0.5 bg-gray-50 text-gray-600 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300">
              Campos: <b>{(model.visibleFields||[]).length}</b> / {ENABLED_FIELDS.length}
            </span>
            <span className={cx(
              "rounded-full border px-2 py-0.5",
              model.allowAllLayers
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-sky-50 border-sky-200 text-sky-700"
            )}>
              Capas: {model.allowAllLayers ? "Todas" : `${(model.allowedLayers||[]).length} seleccionadas`}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-5 dark:border-neutral-800">
        {[
          { k: 'permisos', lbl: 'Permisos', icon: SlidersHorizontal },
          { k: 'campos', lbl: 'Campos' },
          { k: 'capas', lbl: 'Capas', icon: Layers },
        ].map(t => (
          <button key={t.k}
            onClick={()=>setTab(t.k)}
            className={cx(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition',
              tab === t.k ? 'border-rose-600 text-rose-700' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-neutral-400 dark:hover:text-neutral-200'
            )}
          >
            {t.icon && <t.icon className="inline h-4 w-4 mr-1" />}{t.lbl}
          </button>
        ))}
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'permisos' && (
          <>
            {/* Plantillas */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Plantillas:</span>
              {TEMPLATES.map(t=>(
                <button key={t.key}
                  onClick={()=>setModel(m=>({ ...m, ...t.v }))}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800">
                  {t.label}
                </button>
              ))}
            </div>

            {/* Switches */}
            <div className="grid gap-3 sm:grid-cols-2">
              {perms.map(({k,lbl}) => (
                <label key={k} className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:bg-neutral-800 dark:border-neutral-700">
                  <span className="text-sm text-gray-700 dark:text-neutral-200">{lbl}</span>
                  <Switch
                    checked={model[k]}
                    onChange={(v)=>setModel(m=>({ ...m, [k]: v }))}
                  />
                </label>
              ))}
            </div>
          </>
        )}

        {tab === 'campos' && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Campos visibles</p>
              <div className="flex items-center gap-3 text-xs">
                <button onClick={()=>setModel(m=>({ ...m, visibleFields:[...ENABLED_FIELDS] }))} className="text-gray-600 hover:underline">Todos</button>
                <span className="text-gray-300">·</span>
                <button onClick={()=>setModel(m=>({ ...m, visibleFields:[] }))} className="text-gray-600 hover:underline">Ninguno</button>
                <span className="text-gray-300">·</span>
                <button onClick={()=>{
                  const next = new Set(ENABLED_FIELDS);
                  visSet.forEach(k=>next.delete(k));
                  setModel(m=>({ ...m, visibleFields:[...next] }));
                }} className="text-gray-600 hover:underline">Invertir</button>
              </div>
            </div>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
              {ENABLED_FIELDS.map(k => (
                <Chip
                  key={k}
                  text={FIELD_LABELS[k].txt}
                  active={visSet.has(k)}
                  onToggle={()=>{
                    const next = new Set(visSet);
                    next.has(k) ? next.delete(k) : next.add(k);
                    setModel(m=>({ ...m, visibleFields:[...next] }));
                  }}
                />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-gray-500">
              Seleccionados: <b>{visSet.size}</b> / {ENABLED_FIELDS.length}
            </p>
          </>
        )}

        {tab === 'capas' && (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700 dark:text-neutral-200">Todas las capas</span>
                <Switch
                  checked={model.allowAllLayers}
                  onChange={(v)=>setModel(m=>({ ...m, allowAllLayers:v }))}
                />
              </div>

              <div className="flex items-center gap-3">
                <div className={cx(
                  'flex items-center rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:bg-neutral-900 dark:border-neutral-700',
                  model.allowAllLayers && 'opacity-50 pointer-events-none'
                )}>
                  <Search className="h-4 w-4 text-gray-400 mr-1" />
                  <input
                    type="search"
                    placeholder="Buscar sector…"
                    value={capasFilter}
                    onChange={e => setCapasFilter(e.target.value)}
                    className="min-w-[12rem] outline-none bg-transparent"
                  />
                  {capasFilter && (
                    <button onClick={()=>setCapasFilter('')} className="ml-1 text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4"/>
                    </button>
                  )}
                </div>

                {/* Acciones masivas */}
                <div className={cx('hidden sm:flex items-center gap-2', model.allowAllLayers && 'opacity-50 pointer-events-none')}>
                  <button className="text-xs text-gray-600 hover:underline"
                          onClick={()=>setModel(m=>({ ...m, allowAllLayers:false, allowedLayers:capas.map(c=>c.name) }))}>
                    Todas (lista)
                  </button>
                  <span className="text-gray-300">·</span>
                  <button className="text-xs text-gray-600 hover:underline"
                          onClick={()=>setModel(m=>({ ...m, allowAllLayers:false, allowedLayers:[] }))}>
                    Ninguna
                  </button>
                  <span className="text-gray-300">·</span>
                  <button className="text-xs text-gray-600 hover:underline"
                          onClick={()=>{
                            const names=capas.map(c=>c.name);
                            const next = names.filter(n=>!allowedSet.has(n));
                            setModel(m=>({ ...m, allowAllLayers:false, allowedLayers:next }));
                          }}>
                    Invertir
                  </button>
                </div>
              </div>
            </div>

            {!capas?.length ? (
              <p className="text-sm text-gray-500">Capas no disponibles o no se pudieron cargar.</p>
            ) : (
              <>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))' }}>
                  {orderedCapas.map(c => {
                    const name  = c.name;
                    const active = model.allowAllLayers ? false : allowedSet.has(name);
                    const isPinned = pinned.has(name);
                    return (
                      <div key={name} className="flex items-center gap-2">
                        {/* Botón pin */}
                        <button
                          type="button"
                          onClick={()=>togglePin(name)}
                          className={cx(
                            'h-4 w-4 rounded-full border transition',
                            isPinned ? 'bg-yellow-300 border-yellow-400' : 'bg-white border-gray-300'
                          )}
                          title={isPinned ? 'Quitar favorito' : 'Marcar favorito'}
                        />
                        <Chip
                          text={labelCapa(name)}
                          active={active}
                          onToggle={()=>{
                            const next = new Set(allowedSet);
                            next.has(name) ? next.delete(name) : next.add(name);
                            setModel(m=>({ ...m, allowAllLayers:false, allowedLayers:[...next] }));
                          }}
                          disabled={model.allowAllLayers}
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  {model.allowAllLayers ? 'Modo: todas las capas.' : <>Seleccionadas: <b>{allowedSet.size}</b> / {capas.length}</>}
                </p>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer acciones (sticky) */}
      <footer className="sticky bottom-0 border-t border-gray-200 bg-white/90 backdrop-blur px-4 py-3 dark:bg-neutral-900/90 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          <p className={cx("text-xs", dirty ? "text-amber-700" : "text-gray-500")}>
            {dirty ? "Hay cambios sin guardar" : "Sin cambios pendientes"}
          </p>
          <div className="flex items-center gap-3">
            <button className="rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                    onClick={onCancel}>
              Cancelar
            </button>
            <button
              disabled={!dirty}
              className={cx(
                "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium",
                dirty ? "bg-rose-600 text-white hover:bg-rose-500" : "bg-gray-200 text-gray-500 cursor-not-allowed"
              )}
              onClick={patchAndClose}
              title="Guardar (Ctrl/Cmd + S)"
            >
              <Edit3 className="h-4 w-4"/> Guardar cambios
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─ Página principal ─ */
export default function UsersPage() {
  const router = useRouter();
  const { isAdmin = false, isSuper = false, checking = false } = useAuth() || {};

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // filtros / búsqueda / paginación
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');          // all | admin | super | user
  const [capMode, setCapMode] = useState('all');    // all | restricted
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 12;

  // densidad
  const LS_DENSITY = 'usersDensity';
  const [density, setDensity] = useState(()=> typeof window === 'undefined' ? 'comfy' : (localStorage.getItem(LS_DENSITY) || 'comfy'));
  useEffect(()=>{ try{ localStorage.setItem(LS_DENSITY, density); }catch{} }, [density]);
  const cellPd = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';

  // capas
  const [capas, setCapas] = useState([]);

  // editor
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);

  // toasts
  const [toast, setToast] = useState(null);
  const openToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(()=>setToast(null), 2500);
  };

  /* Cargar usuarios */
  useEffect(() => {
    if (checking) return;
    if (!isAdmin && !isSuper) { setLoading(false); return; }
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'usuarios'));
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error('READ usuarios failed', e.code, e.message);
        openToast('error', `READ usuarios: ${e.code || e.message || 'permission-denied'}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [checking, isAdmin, isSuper]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Cargar capas WMS */
  useEffect(() => {
    (async () => {
      try {
        const all = await obtenerCapasWMS();
        setCapas(all);
      } catch (e) {
        console.error('Capas WMS:', e);
        setCapas([]);
      }
    })();
  }, []);

  /* Filtros */
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const isAdminUser = (u) => u.super === true || u.superAdmin === true || u.admin === true || (u.tipo||'').toLowerCase() === 'administrador';
    const isSuperUser = (u) => u.super === true || u.superAdmin === true;

    return rows.filter(u => {
      if (term) {
        const mail = (u.correo || u.email || '').toLowerCase();
        const name = (u.Nombre || u.nombre || u.displayName || '').toLowerCase();
        if (!mail.includes(term) && !name.includes(term)) return false;
      }
      if (role === 'admin'  && !isAdminUser(u)) return false;
      if (role === 'super'  && !isSuperUser(u)) return false;
      if (role === 'user'   && (isAdminUser(u))) return false;

      if (capMode === 'restricted') {
        if (u.allowAllLayers === true) return false;
        const allowed = Array.isArray(u.allowedLayers) ? u.allowedLayers : [];
        if (allowed.length === 0) return false;
      }
      return true;
    });
  }, [rows, q, role, capMode]);

  const paginated = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const openEditor = (u) => { setEditUser(u); setOpen(true); };
  const closeEditor = () => { setOpen(false); setEditUser(null); };

  const onSave = useCallback(async (id, patch, { onSuccess } = {}) => {
    try {
      if (!patch || Object.keys(patch).length === 0) { closeEditor(); return; }
      await setDoc(doc(db, 'usuarios', id), patch, { merge: true });
      if (patch.visibleFields !== undefined) {
        await savePrefs(id, { visibleFields: patch.visibleFields });
      }
      setRows(r => r.map(u => (u.id === id ? { ...u, ...patch } : u)));
      closeEditor();
      openToast('success', 'Permisos guardados');
      onSuccess?.();
    } catch (e) {
      console.error('WRITE usuarios failed', { id, patch, code: e.code, message: e.message });
      openToast('error', `WRITE usuarios: ${e.code || e.message || 'permission-denied'}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) return <p className="m-8 text-gray-500">Cargando…</p>;
  if (!isAdmin && !isSuper) return <p className="m-8 text-red-700">No autorizado.</p>;

  return (
    <main className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:bg-neutral-900/80 dark:border-neutral-800">
        <div className="mx-auto max-w-7xl px-6 py-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold text-gray-800 dark:text-neutral-100">Permisos de usuarios</h1>
            <span className="text-xs rounded-full bg-gray-100 text-gray-600 px-2 py-0.5 border border-gray-200 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700">{rows.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded border px-2 py-1 text-xs hover:bg-gray-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
              onClick={()=>setDensity(d => d==='comfy' ? 'compact' : 'comfy')}
              title="Cambiar densidad"
            >
              {density === 'comfy' ? 'Compactar' : 'Ampliar'}
            </button>
            <button onClick={() => router.back()} className="text-2xl text-gray-400 hover:text-gray-700 leading-none dark:text-neutral-400 dark:hover:text-neutral-200">×</button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Toolbar */}
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700">
            <Search className="h-4 w-4 text-gray-400" />
            <input
              value={q}
              onChange={e=>{ setQ(e.target.value); setPage(1); }}
              placeholder="Buscar por nombre o correo…"
              className="w-full outline-none text-sm bg-transparent"
              type="search"
            />
            {q && (
              <button onClick={()=>setQ('')} className="text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4"/>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700">
            <Filter className="h-4 w-4 text-gray-400"/>
            <select
              value={role}
              onChange={e=>{ setRole(e.target.value); setPage(1); }}
              className="w-full bg-transparent text-sm outline-none dark:text-neutral-200"
              title="Filtrar por rol"
            >
              <option value="all">Todos los roles</option>
              <option value="super">Super admin</option>
              <option value="admin">Admin</option>
              <option value="user">Usuarios</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:bg-neutral-900 dark:border-neutral-700">
            <Layers className="h-4 w-4 text-gray-400"/>
            <select
              value={capMode}
              onChange={e=>{ setCapMode(e.target.value); setPage(1); }}
              className="w-full bg-transparent text-sm outline-none dark:text-neutral-200"
              title="Modo de capas"
            >
              <option value="all">Todos (modo de capas)</option>
              <option value="restricted">Solo con capas restringidas</option>
            </select>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:bg-neutral-900 dark:border-neutral-800">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 dark:bg-neutral-900 dark:text-neutral-300">
                <tr>
                  <th className={cx(cellPd, 'text-left font-semibold')}>Usuario</th>
                  <th className={cx(cellPd, 'text-left font-semibold')}>Correo</th>
                  <th className={cx(cellPd, 'text-left font-semibold')}>Rol</th>
                  <th className={cx(cellPd, 'text-left font-semibold')}>Campos</th>
                  <th className={cx(cellPd, 'text-left font-semibold')}>Capas</th>
                  <th className={cx(cellPd, 'text-right font-semibold')}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
                {loading ? (
                  [...Array(6)].map((_,i)=>(
                    <tr key={i} className="animate-pulse">
                      <td className={cellPd}><div className="h-5 w-40 bg-gray-200 rounded"/></td>
                      <td className={cellPd}><div className="h-5 w-52 bg-gray-200 rounded"/></td>
                      <td className={cellPd}><div className="h-5 w-20 bg-gray-200 rounded"/></td>
                      <td className={cellPd}><div className="h-5 w-12 bg-gray-200 rounded"/></td>
                      <td className={cellPd}><div className="h-5 w-28 bg-gray-200 rounded"/></td>
                      <td className={cx(cellPd, 'text-right')}><div className="h-8 w-20 bg-gray-200 rounded ml-auto"/></td>
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td className={cx(cellPd, 'text-center text-gray-500')} colSpan={6}>Sin resultados</td>
                  </tr>
                ) : (
                  paginated.map(u => {
                    const name = u.Nombre || u.nombre || u.displayName || 'Sin nombre';
                    const mail = u.correo || u.email || '';
                    const fieldsCount = Array.isArray(u.visibleFields) ? u.visibleFields.length : 0;
                    const capasTxt = u.allowAllLayers === true
                      ? 'Todas'
                      : `${(u.allowedLayers||[]).length || 0} seleccionadas`;
                    return (
                      <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800/60">
                        <td className={cellPd}>
                          <div className="flex items-center gap-3">
                            <Avatar name={name} user={u} size={9}/>
                            <span className="truncate font-medium text-gray-800 dark:text-neutral-100">
                              <HL text={name} q={q}/>
                            </span>
                          </div>
                        </td>
                        <td className={cellPd}>
                          <span className="truncate block text-gray-600 dark:text-neutral-300">
                            <HL text={mail} q={q}/>
                          </span>
                        </td>
                        <td className={cellPd}><RoleTag u={u}/></td>
                        <td className={cellPd}>{fieldsCount}</td>
                        <td className={cellPd}>{capasTxt}</td>
                        <td className={cx(cellPd, 'text-right')}>
                          <button
                            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 dark:bg-neutral-900 dark:border-neutral-700 dark:hover:bg-neutral-800"
                            onClick={()=>{ setEditUser(u); setOpen(true); }}
                          >
                            <Edit3 className="h-4 w-4"/> Editar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paginación */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 text-sm dark:border-neutral-800">
              <p className="text-gray-600 dark:text-neutral-300">Página {page} de {totalPages}</p>
              <div className="flex items-center gap-1">
                <button
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  onClick={()=>setPage(p=>Math.max(1, p-1))}
                  disabled={page===1}
                >
                  <ChevronLeft className="h-4 w-4"/> Anterior
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded border px-2 py-1 hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  onClick={()=>setPage(p=>Math.min(totalPages, p+1))}
                  disabled={page===totalPages}
                >
                  Siguiente <ChevronRight className="h-4 w-4"/>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SlideOver editor */}
      <SlideOver open={open} onClose={closeEditor} title="Editar usuario">
        {editUser ? (
          <UserEditor
            baseUser={editUser}
            capas={capas}
            onSave={onSave}
            onCancel={closeEditor}
            openToast={openToast}
          />
        ) : (
          <div className="p-6 text-center text-gray-500"><Loader2 className="mx-auto h-5 w-5 animate-spin"/></div>
        )}
      </SlideOver>

      {/* Toasts */}
      {toast && (
        <div className={cx(
          "fixed right-4 bottom-4 z-[60] rounded-lg px-4 py-2 shadow-lg text-sm",
          toast.type==='success' ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"
        )}>
          {toast.msg}
        </div>
      )}
    </main>
  );
}
