/* -------------------------------------------------------------------
 * SearchBar.jsx · estilo “Pill Gradient” compacto (260 px)
 * - Iconos Lucide frescos
 * - Desaparece cuando sidebarOpen === true
 * ----------------------------------------------------------------- */
'use client';

import { useState, useEffect, useMemo } from 'react';
import mapboxgl                    from 'mapbox-gl';
import Swal                        from 'sweetalert2';
import { AlignLeft, Search }       from 'lucide-react';


/* ---------- helpers ---------- */
const normalize = s => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const digits    = s => String(s ?? '').replace(/\D+/g,'');

export default function SearchBar({
  map,
  data = [],
  ready = true,
  onFeature,
  onToggleSidebar = () => {},
  sidebarOpen     = false,          // controla visibilidad
}) {
  /* ---------- state ---------- */
  const [q, setQ]             = useState('');
  const [open, setOpen]       = useState(false);
  const [remote, setRemote]   = useState([]);

  /* ---------- sugerencias locales ---------- */
  const local = useMemo(() => {
    if (!ready) return [];
    const txt = q.trim();
    if (!txt) return [];
    const qNum  = digits(txt);
    const qNorm = normalize(txt);
    return data
      .filter(f => {
        const p = f.properties ?? {};
        return (
          (qNum  && digits(p.cve_cat).startsWith(qNum)) ||
          (qNorm && normalize(p.nombre_del).includes(qNorm))
        );
      })
      .slice(0, 8);
  }, [q, data, ready]);

  /* ---------- direcciones Mapbox (debounce) ---------- */
  useEffect(() => {
    const txt = q.trim();
    if (!txt) { setRemote([]); return; }

    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
          `${encodeURIComponent(txt)}.json?access_token=${mapboxgl.accessToken}` +
          `&limit=5&language=es`;
        const res = await (await fetch(url, { signal: ctrl.signal })).json();
        setRemote(
          (res.features ?? []).map(f => ({
            id : f.id,
            txt: f.place_name,
            lon: f.center[0],
            lat: f.center[1],
          }))
        );
      } catch { setRemote([]); }
    }, 350);

    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q]);

  /* ---------- selectores ---------- */
  const pickLocal  = f => { onFeature?.(f); setQ(''); setOpen(false); };
  const pickRemote = r => {
    map.flyTo({ center:[r.lon,r.lat], zoom:17, padding:60, speed:1.25 });
    setQ(''); setOpen(false);
  };

  /* ---------- envío ---------- */
  const handleSubmit = e => {
    e.preventDefault();
    if (local.length === 1)  return pickLocal(local[0]);
    if (remote.length === 1) return pickRemote(remote[0]);
    Swal.fire('Sin resultados', 'No se encontró coincidencia.', 'info');
  };

  /* ---------- UI ---------- */
  return (
    <form
      className="sb pill"
      onSubmit={handleSubmit}
      style={{
        opacity: sidebarOpen ? 0 : 1,
        transform: sidebarOpen ? 'translateY(-20px)' : 'translateY(0)',
        pointerEvents: sidebarOpen ? 'none' : 'auto',
      }}
    >
      {/* hamburguesa */}
      <button
        type="button"
        className="sb-btn"
        aria-label="Menú"
        onClick={onToggleSidebar}
      >
        <AlignLeft size={18}/>
      </button>

      <input
        className="sb-input"
        placeholder="Buscar clave o dirección…"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={()  => setTimeout(() => setOpen(false), 120)}
        autoComplete="off"
      />

      {/* lupa */}
      <button type="submit" className="sb-btn" aria-label="Buscar">
        <Search size={18}/>
      </button>

      {/* sugerencias */}
      {open && (local.length || remote.length) > 0 && (
        <div className="sb-sugg-wrap">
          <ul className="sb-sugg">
            {local.map(f => (
              <li key={f.properties.cve_cat} onMouseDown={() => pickLocal(f)}>
                <span className="sb-icon sb-icon-local"/>
                <div className="sb-text">
                  <strong>{f.properties.cve_cat}</strong>
                  <span>{f.properties.nombre_del}</span>
                </div>
              </li>
            ))}
            {remote.map(r => (
              <li key={r.id} className="remote" onMouseDown={() => pickRemote(r)}>
                <span className="sb-icon sb-icon-remote"/>
                <div className="sb-text">{r.txt}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
