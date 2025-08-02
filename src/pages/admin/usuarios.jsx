// ─── src/pages/admin/usuarios.jsx ───
'use client';

import {
  useEffect, useState, useCallback, useMemo,
} from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';
import { db } from '@/auth/firebase';
import { useAuth } from '@/hooks/useAuth';
import { FIELD_LABELS, ENABLED_FIELDS } from '@/utils/campos';
import { savePrefs } from '@/services/Prefs';
import md5 from 'blueimp-md5';
import { ChevronDown, ChevronUp, Check, Plus } from 'lucide-react';

/*────────── Configura aquí ──────────*/
const SWITCH_STYLE = 'compact'; // 'mini' | 'compact' | 'pill'
const CARD_STYLE   = 'stripe';  // 'shadow' | 'stripe' | 'header'
/*────────────────────────────────────*/

const cx = (...c) => c.filter(Boolean).join(' ');

/*──────────────── Avatar ────────────────*/
function Avatar({ name, user }) {
  const correo = (user.correo || user.email || '').trim().toLowerCase();
  const grav   = correo ? `https://www.gravatar.com/avatar/${md5(correo)}?d=identicon&s=96` : '';
  const src    = user.photoURL || user.avatar || user.foto || grav || '';
  if (src)
    return <img src={src} alt={name} className="h-10 w-10 rounded-full object-cover ring-2 ring-white" />;
  return <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-600 text-sm font-semibold text-white">{name[0] ?? '?'}</span>;
}

/*──────────────── Interruptores ────────────────*/
function TinyToggle({ checked, onChange }) {
  return (
    <>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="relative inline-block h-5 w-10 rounded-full bg-gray-300 peer-checked:bg-rose-600 transition">
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </>
  );
}
function MiniToggle({ checked, onChange }) {
  return (
    <>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="relative inline-block h-4 w-8 rounded bg-gray-300 peer-checked:bg-rose-600 transition">
        <span className="absolute left-0.5 top-0.5 h-3 w-3 rounded bg-white shadow transition peer-checked:translate-x-4" />
      </span>
    </>
  );
}
function PillToggle({ checked, onChange }) {
  return (
    <>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="relative inline-block h-6 w-12 rounded-full bg-gray-200 ring-1 ring-gray-300 peer-checked:bg-rose-600 peer-checked:ring-rose-600 transition">
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-6" />
      </span>
    </>
  );
}
const SWITCHES = { mini: MiniToggle, compact: TinyToggle, pill: PillToggle };

/*──────────────── Chip ────────────────*/
function Chip({ text, active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={cx(
        'flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition',
        active
          ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
          : 'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200'
      )}
    >
      {active ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
      {text}
    </button>
  );
}

/*──────────────── Tarjeta de usuario ────────────────*/
function cardClasses(open) {
  switch (CARD_STYLE) {
    case 'shadow':
      return cx(
        'rounded-xl bg-white border border-gray-200 shadow-sm transition hover:shadow',
        open && 'ring-2 ring-rose-300'
      );
    case 'stripe':
      return cx(
        'relative rounded-xl bg-white border border-gray-200 shadow-sm',
        open && 'ring-2 ring-rose-300',
        'before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:rounded-l-xl',
        open ? 'before:bg-rose-600' : 'before:bg-gray-200'
      );
    case 'header':
      return cx(
        'rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden',
        open && 'ring-2 ring-rose-300'
      );
    default:
      return '';
  }
}

function UserCard({ user, open, onToggle, onPatch }) {
  const vis  = useMemo(() => new Set(user.visibleFields ?? []), [user.visibleFields]);
  const name = user.Nombre || user.nombre || user.displayName || 'Sin nombre';
  const mail = user.correo  || user.email   || '';
  const Toggle = SWITCHES[SWITCH_STYLE];

  return (
    <article className={cx('self-start', cardClasses(open))}>
      {/* Cabecera */}
      <button
        type="button"
        onClick={onToggle}
        className={cx(
          'flex w-full items-center gap-4 p-4',
          CARD_STYLE === 'header' && (open ? 'bg-rose-600 text-white' : 'bg-gray-100')
        )}
        aria-expanded={open}
      >
        <Avatar name={name} user={user} />
        <div className="min-w-0 flex-1 text-left">
          <p className={cx('truncate font-medium', CARD_STYLE === 'header' && 'text-current')}>{name}</p>
          {mail && <p className={cx('truncate text-xs', CARD_STYLE === 'header' && 'text-current/80')}>{mail}</p>}
        </div>
        {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>

      {/* Contenido */}
      {open && (
        <div className="space-y-5 px-5 pb-6 pt-2 animate-fadeIn">
          {/* Interruptores */}
          <div className="space-y-3">
            {[
              { k: 'allowPopup', lbl: 'Pop‑ups'   },
              { k: 'canPrint',   lbl: 'Imprimir'  },
              { k: 'canDown',    lbl: 'Descargar' },
              { k: 'showPdf',    lbl: 'PDF'       },
            ].map(({ k, lbl }) => (
              <label key={k} className="flex items-center justify-between gap-4">
                <span className="text-sm text-gray-700">{lbl}</span>
                <Toggle
                  checked={user[k] !== false}
                  onChange={v => onPatch(user.id, { [k]: v })}
                />
              </label>
            ))}
          </div>

          {/* Chips */}
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))' }}>
            {ENABLED_FIELDS.map(k => (
              <Chip
                key={k}
                text={FIELD_LABELS[k].txt}
                active={vis.has(k)}
                onToggle={() => {
                  const next = new Set(vis);
                  next.has(k) ? next.delete(k) : next.add(k);
                  onPatch(user.id, { visibleFields: [...next] });
                }}
              />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

/*──────────────── Página ────────────────*/
export default function UsersPage() {
  const router               = useRouter();
  const { isAdmin, isSuper } = useAuth();

  const [rows,   setRows]   = useState([]);
  const [filter, setFilter] = useState('');
  const [openId, setOpenId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin && !isSuper) return;
    (async () => {
      const snap = await getDocs(collection(db, 'usuarios'));
      setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [isAdmin, isSuper]);

  const patch = useCallback(async (id, obj) => {
    await setDoc(doc(db, 'usuarios', id), obj, { merge: true });
    if (obj.visibleFields !== undefined)
      await savePrefs(id, { visibleFields: obj.visibleFields });
    setRows(r => r.map(u => (u.id === id ? { ...u, ...obj } : u)));
  }, []);

  const list = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(u => {
      const c = (u.correo || u.email || '').toLowerCase();
      const n = (u.Nombre || u.nombre || u.displayName || '').toLowerCase();
      return c.includes(q) || n.includes(q);
    });
  }, [rows, filter]);

  const toggleCard = useCallback(id => setOpenId(prev => (prev === id ? null : id)), []);

  if (!isAdmin && !isSuper)
    return <p className="m-8 text-red-700">No autorizado.</p>;

  return (
    <main className="min-h-screen bg-neutral-50 p-8">
      {/* cerrar */}
      <button onClick={() => router.back()} className="absolute right-6 top-6 text-3xl text-gray-400 hover:text-gray-700">×</button>

      {/* encabezado */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <h1 className="text-3xl font-semibold text-gray-800">Permisos de usuarios</h1>

        {/* ⬇️  << CORRECCIÓN: una sola línea de clase >> */}
        <input
          type="search"
          placeholder="Buscar nombre o correo…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full grow rounded-lg border border-gray-300 px-4 py-2 shadow-sm focus:border-rose-600 focus:ring-2 focus:ring-rose-300 sm:max-w-xs"
        />
      </div>

      {/* tarjetas */}
      {loading ? (
        <p className="text-center text-gray-500">Cargando…</p>
      ) : list.length === 0 ? (
        <p className="text-center text-gray-500">Sin resultados</p>
      ) : (
        <section className="grid gap-6 items-start sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map(u => (
            <UserCard
              key={u.id}
              user={u}
              open={openId === u.id}
              onToggle={() => toggleCard(u.id)}
              onPatch={patch}
            />
          ))}
        </section>
      )}

      <style jsx global>{`
        @keyframes fadeIn { from{opacity:0;transform:translateY(-.25rem)} to{opacity:1;transform:translateY(0)} }
        .animate-fadeIn { animation: fadeIn .25s ease-out; }
      `}</style>
    </main>
  );
}
