/* -------------------------------------------------------------------
 * SearchBar.jsx · “Pill Gradient”
 * - Prefijo de cve_cat → resalta TODAS (source 'hl' del mapa) + fitBounds
 * - 1 coincidencia → onFeature(feat) (tu flujo abre popup/centra)
 * - Incluye botón "Limpiar" para vaciar el highlight
 * ----------------------------------------------------------------- */
'use client';

import { useState, useEffect, useMemo } from 'react';
import mapboxgl                    from 'mapbox-gl';
import Swal                        from 'sweetalert2';
import { AlignLeft, Search, X }    from 'lucide-react';

/* ---------- helpers ---------- */
const normalize = s => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const digits    = s => String(s ?? '').replace(/\D+/g,'');

/* ---------- bounds util (sin dependencias) ---------- */
function coordsWalker(geom, fn) {
  if (!geom) return;
  const { type, coordinates, geometries } = geom;
  if (type === 'GeometryCollection') { (geometries || []).forEach(g => coordsWalker(g, fn)); return; }
  const walk = (c) => { if (typeof c[0] === 'number') fn(c); else c?.forEach?.(walk); };
  walk(coordinates || []);
}
function boundsOfGeometry(geom) {
  let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity, ok=false;
  coordsWalker(geom, ([x,y]) => { ok = true;
    if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y;
  });
  return ok ? [minX,minY,maxX,maxY] : null;
}
function boundsOfFeature(f){ if(!f) return null; if(Array.isArray(f.bbox)&&f.bbox.length===4) return f.bbox; return boundsOfGeometry(f.geometry); }
function mergeBounds(a,b){ if(!a) return b? [...b]:null; if(!b) return a?[...a]:null;
  return [Math.min(a[0],b[0]), Math.min(a[1],b[1]), Math.max(a[2],b[2]), Math.max(a[3],b[3])]; }
function boundsOfFeatures(fs){ return (fs||[]).reduce((acc,f)=>mergeBounds(acc,boundsOfFeature(f)), null); }

/* ---------- helpers para hablar con el source 'hl' del mapa ---------- */
const HL_ID = 'hl'; // tu mapa.jsx ya lo crea
function setHL(map, features = []) {
  if (!map) return;
  const apply = () => map.getSource(HL_ID)?.setData({ type:'FeatureCollection', features });
  if (map.loaded()) apply();
  else map.once('load', apply);
}
function clearHL(map) { setHL(map, []); }

export default function SearchBar({
  map,
  data = [],
  ready = true,
  onFeature,                 // ya usas focusFeature desde mapa.jsx
  onToggleSidebar = () => {},
  sidebarOpen     = false,
}) {
  /* ---------- state ---------- */
  const [q, setQ]           = useState('');
  const [open, setOpen]     = useState(false);
  const [remote, setRemote] = useState([]);

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
          (qNum  && digits(p.cve_cat).startsWith(qNum)) ||        // ← prefijo clave
          (qNorm && normalize(p.nombre_del).includes(qNorm))      // ← por nombre
        );
      })
      .slice(0, 50);
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
  const pickLocal  = f => {            // 1 coincidencia local
    clearHL(map);                      // el foco lo maneja onFeature
    onFeature?.(f);
    setQ(''); setOpen(false);
  };
  const pickRemote = r => {
    clearHL(map);
    map?.flyTo({ center:[r.lon,r.lat], zoom:17, padding:60, speed:1.25 });
    setQ(''); setOpen(false);
  };

  /* ---------- enviar ---------- */
  const handleSubmit = (e) => {
    e.preventDefault();

    // Caso 1: exactamente 1 local → como antes
    if (local.length === 1) {
      return pickLocal(local[0]);
    }

    // Caso 2: prefijo numérico con varias locales → resaltar TODAS + fitBounds
    const onlyDigits = digits(q.trim());
    if (onlyDigits && local.length > 0) {
      setHL(map, local);
      const b = boundsOfFeatures(local);
      if (b) map?.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 80, maxZoom: 18, duration: 900 });
      setQ(''); setOpen(false);
      return;
    }

    // Caso 3: 1 remota → como antes
    if (remote.length === 1) {
      return pickRemote(remote[0]);
    }

    // Mensajes
    if (local.length > 1) {
      Swal.fire(`${local.length} coincidencias`, 'Refina la búsqueda o elige una de la lista.', 'info');
    } else if (remote.length > 1) {
      Swal.fire(`${remote.length} direcciones`, 'Selecciona una de la lista.', 'info');
    } else {
      Swal.fire('Sin resultados', 'No se encontró coincidencia.', 'info');
    }
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
        placeholder="Buscar clave (prefijo) o dirección…"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={()  => setTimeout(() => setOpen(false), 120)}
        autoComplete="off"
      />

      {/* limpiar highlight */}
      <button
        type="button"
        className="sb-btn"
        aria-label="Limpiar resaltado"
        onClick={() => { clearHL(map); setQ(''); }}
        title="Limpiar resaltado"
      >
        <X size={18}/>
      </button>

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
