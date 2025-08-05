/* -------------------------------------------------------------------
 * SearchBar.jsx · clave (prefijo) · propietario (parcial) · dirección
 * Con autocompletado (local + Mapbox) e iconos minimalistas CSS
 * ----------------------------------------------------------------- */
'use client';

import { useState, useEffect, useMemo } from 'react';
import mapboxgl      from 'mapbox-gl';
import Swal          from 'sweetalert2';

/* helpers ---------------------------------------------------------- */
const normalize = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const digits = s => String(s ?? '').replace(/\D+/g, '');

export default function SearchBar({ map, data = [], ready = true, onFeature }) {
  const [q, setQ]        = useState('');
  const [open, setOpen]  = useState(false);
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

    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
          `${encodeURIComponent(txt)}.json?access_token=${mapboxgl.accessToken}` +
          `&limit=5&language=es`;
        const res  = await (await fetch(url, { signal: controller.signal })).json();
        setRemote(
          (res.features ?? []).map(f => ({
            id : f.id,
            txt: f.place_name,
            lon: f.center[0],
            lat: f.center[1],
          }))
        );
      } catch { setRemote([]); }
    }, 350);                 // debounce 350 ms

    return () => { clearTimeout(t); controller.abort(); };
  }, [q]);

  /* ---------- selectores ---------- */
  const pickLocal  = f => { onFeature?.(f); setQ(''); setOpen(false); };
  const pickRemote = r => {
    map.flyTo({ center:[r.lon,r.lat], zoom:17, padding:60, speed:1.25 });
    setQ(''); setOpen(false);
  };

  /* ---------- envio con Enter / lupa ---------- */
  const handleSubmit = e => {
    e.preventDefault();
    if (local.length === 1)  return pickLocal(local[0]);
    if (remote.length === 1) return pickRemote(remote[0]);
    Swal.fire('Sin resultados', 'No se encontró coincidencia.', 'info');
  };

  /* ---------- UI ---------- */
  return (
    <form className="sb-wrap" onSubmit={handleSubmit}>
      {/* hamburguesa css-only */}
      <button type="button" className="sb-burger" aria-label="Menú">
        <span />
      </button>

      <input
        className="sb-input"
        placeholder="Clave, propietario o dirección…"
        value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => (local.length || remote.length) && setOpen(true)}
        onBlur={()  => setTimeout(() => setOpen(false), 120)}
        autoComplete="off"
      />

      {/* lupa css-only */}
      <button type="submit" className="sb-search" aria-label="Buscar" />

      {/* lista sugerencias */}
      {open && (local.length || remote.length) > 0 && (
        <ul className="sb-suggestions">
          {local.map(f => (
            <li key={f.properties.cve_cat} onMouseDown={() => pickLocal(f)}>
              <strong>{f.properties.cve_cat}</strong>
              <span>{f.properties.nombre_del}</span>
            </li>
          ))}
          {remote.map(r => (
            <li key={r.id} className="sb-addr" onMouseDown={() => pickRemote(r)}>
              {r.txt}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
