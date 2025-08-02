/* ───────── src/pages/mapa.jsx ───────── */
'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl                        from 'mapbox-gl';
import AnimatedPopup                   from 'mapbox-gl-animated-popup';
import 'mapbox-gl/dist/mapbox-gl.css';

import SidebarEnge                     from '@/components/SidebarEnge';
import PdfModal                        from '@/components/PdfModal';
import { useAuth }                     from '@/hooks/useAuth';
import { loadPrefs, savePrefs }        from '@/services/Prefs';
import { doc, getDoc }                 from 'firebase/firestore';
import { db }                          from '@/auth/firebase';
import firebase                        from 'firebase/compat/app';   // ← para getIdToken()
import 'firebase/compat/auth';

import {
  obtenerCapasWMS,
  wmsTileURL,
  getFeatureInfoURL,
} from '@/services/GeoServerService';
import { OMIT_FIELDS, FIELD_LABELS }   from '@/utils/campos';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/* ─── estilos base ─── */
const MAP_STYLES = {
  Satélite: 'mapbox://styles/mapbox/satellite-streets-v12',
  Calles  : 'mapbox://styles/mapbox/streets-v12',
  Claro   : 'mapbox://styles/mapbox/light-v11',
};

/* ─── ayuda atributos ─── */
const OMIT = new Set(OMIT_FIELDS);
const tipoCampo = Object.fromEntries(
  Object.entries(FIELD_LABELS).map(([k, v]) => [k, v.fmt]),
);
const fmt = {
  moneda : v => `\$ ${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
  area   : v => `${Number(v).toLocaleString('es-MX')} m²`,
  fecha  : v => {
    const d = new Date(v);
    return isNaN(d) ? v : d.toLocaleDateString('es-MX');
  },
  numero : v => v,
  texto  : v => v,
};

/* ─── icono PDF ─── */
const pdfIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="#d4382d" viewBox="0 0 24 24" width="20" height="20"><path d="M6 2a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6H6z" opacity=".15"/><path d="M8 13h1.5a1.5 1.5 0 0 1 0 3H8v-3zm4 0v3m-2-1.5H8m6-1.5h2a1 1 0 0 1 0 2h-2v-2zM14 2v6h6" stroke="#d4382d" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

/* ─── valor formateado ─── */
const val = (k, v) => {
  if (v === '' || v == null) return '';
  if (/^https?:\/\//i.test(v))
    return `<a href="${v}" target="_blank" class="pop-link">${/\.pdf$/i.test(v) ? pdfIcon : '🔗'}</a>`;
  const t = tipoCampo[k] ?? 'texto';
  return (fmt[t] || fmt.texto)(v);
};

/* ─── HTML del popup ─── */
function buildHTML(props, visible, allowPdf) {
  const pdfId = props.cve_cat ?? null;   // usamos la clave, NO la URL física
  const head = `<div class="pop-head">
    <span class="pop-key">${props.cve_cat ?? ''}</span>
    ${allowPdf && pdfId ? `<a href="#" data-id="${pdfId}" class="pop-pdf">${pdfIcon}</a>` : ''}
  </div>`;

  const rows = Object.entries(props)
    .filter(([k]) => {
      if (k === 'cve_cat') return false;
      if (OMIT.has(k.toLowerCase())) return false;
      return visible.length === 0 || visible.includes(k);
    })
    .map(([k, v]) => {
      const label = FIELD_LABELS[k]?.txt ?? k;
      return `<tr><th>${label}</th><td>${val(k, v)}</td></tr>`;
    })
    .join('');

  return `${head}<table class="pop">${rows}</table>`;
}

/* ─── parseo XML sencillo ─── */
const parseFeatureInfoXML = (txt) => {
  const xml = new DOMParser().parseFromString(txt, 'text/xml');
  const member = xml.querySelector('*[local-name()="featureMember"]');
  if (!member) return null;
  const feat = member.firstElementChild;
  if (!feat) return null;

  const props = {};
  [...feat.children].forEach((el) => {
    if (el.children.length === 0 && el.textContent.trim())
      props[el.localName] = el.textContent.trim();
  });

  /* polígono simple */
  const posList = feat.querySelector('*[local-name()="posList"]');
  let geometry = null;
  if (posList) {
    const num = posList.textContent.trim().split(/\s+/).map(Number);
    const ring = [];
    for (let i = 0; i < num.length; i += 2) ring.push([num[i], num[i + 1]]);
    if (ring.length && ring[0][0] !== ring.at(-1)[0]) ring.push(ring[0]);
    geometry = { type: 'Polygon', coordinates: [ring] };
  }
  return { type: 'Feature', geometry, properties: props };
};

/* ─── helpers highlight ─── */
const H_SRC = 'highlight',
  H_FILL = 'highlight-fill',
  H_LINE = 'highlight-line';
const ensureHighlight = (map) => {
  if (!map.getSource(H_SRC))
    map.addSource(H_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!map.getLayer(H_FILL))
    map.addLayer({
      id: H_FILL,
      type: 'fill',
      source: H_SRC,
      paint: { 'fill-color': '#FF3333', 'fill-opacity': 0.25 },
    });
  if (!map.getLayer(H_LINE))
    map.addLayer({
      id: H_LINE,
      type: 'line',
      source: H_SRC,
      paint: { 'line-color': '#FF3333', 'line-width': 3 },
    });
};
const openPopup = (map, lngLat, html, ref) => {
  ref.current?.remove();
  ref.current = new AnimatedPopup({
    offset: 25,
    className: 'ge-balloon',
    closeOnClick: true,
    closeButton: true,
    openingAnimation: { duration: 800, easing: 'easeOutElastic', transform: 'scale' },
    closingAnimation: { duration: 300, easing: 'easeInBack', transform: 'scale' },
    maxWidth: '340px',
  })
    .setLngLat(lngLat)
    .setHTML(html)
    .addTo(map);
};

/* ───────── componente principal ───────── */
export default function MapaPage() {
  const { user, isAdmin, isSuper } = useAuth();

  const mapRef = useRef(null);
  const divRef = useRef(null);
  const popupRef = useRef(null);
  const capasRef = useRef([]);
  const actRef = useRef([]);

  const [ready, setReady]       = useState(false);
  const [styleUrl, setStyleUrl] = useState(MAP_STYLES.Satélite);
  const [capas, setCapas]       = useState([]);
  const [activas, setActivas]   = useState([]);
  const [visible, setVisible]   = useState([]);
  const [perms, setPerms]       = useState({
    canPrint  : true,
    canDown   : true,
    allowPopup: true,
    showPdf   : true,
  });
  const [pdfUrl, setPdfUrl]     = useState(null);

  /* cargar preferencias y permisos */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const prefs = await loadPrefs(user.uid);
      setStyleUrl(MAP_STYLES[prefs.mapStyle] ?? MAP_STYLES.Satélite);
      setActivas(prefs.capas ?? []);
      setVisible(prefs.visibleFields ?? []);

      const snap = await getDoc(doc(db, 'usuarios', user.uid));
      const d = snap.data() ?? {};
      setPerms({
        canPrint  : d.canPrint  !== false || isAdmin || isSuper,
        canDown   : d.canDown   !== false || isAdmin || isSuper,
        allowPopup: d.allowPopup!== false || isAdmin || isSuper,
        showPdf   : d.showPdf   !== false || isAdmin || isSuper,
      });
      setReady(true);
    })();
  }, [user, isAdmin, isSuper]);

  useEffect(() => { actRef.current = activas; }, [activas]);

  /* init Mapbox */
  useEffect(() => {
    if (!ready || mapRef.current || !divRef.current) return;

    const map = new mapboxgl.Map({
      container: divRef.current,
      style: styleUrl,
      center: [-99.506, 27.48],
      zoom: 13,
    });
    mapRef.current = map;
    requestAnimationFrame(() => map.resize());

    map.on('load', async () => {
      ensureHighlight(map);
      const listaCapas = await obtenerCapasWMS();
      capasRef.current = listaCapas;
      setCapas(listaCapas);
      await Promise.all(
        listaCapas
          .filter((c) => activas.includes(c.name))
          .map((c) => addLayer(map, c.name, false)),
      );
    });

    map.on('click', async (e) => {
      popupRef.current?.remove();
      let feature = null;

      for (const layer of actRef.current) {
        try {
          const url = getFeatureInfoURL({ layer, lngLat: e.lngLat, map });
          const txt = await (await fetch(url)).text();
          feature = txt.trim().startsWith('{')
            ? JSON.parse(txt).features?.[0] ?? null
            : parseFeatureInfoXML(txt);
          if (feature) break;
        } catch {
          /* ignore errores de capa vacía */
        }
      }

      if (!feature) {
        map.getSource(H_SRC)?.setData({ type: 'FeatureCollection', features: [] });
        return;
      }
      map
        .getSource(H_SRC)
        ?.setData({ type: 'FeatureCollection', features: [feature] });

      /* ── popup ── */
      if (perms.allowPopup) {
        const puedePdf = (perms.canPrint || perms.canDown) && perms.showPdf;
        openPopup(
          map,
          e.lngLat,
          buildHTML(feature.properties, visible, puedePdf),
          popupRef,
        );

        /* listener del icono PDF */
        const link = popupRef.current.getElement().querySelector('.pop-pdf');
        if (link) {
          link.addEventListener('click', async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            try {
              /* 1️⃣ token Firebase */
              const token = await firebase.auth().currentUser.getIdToken();

              /* 2️⃣ URL protegida */
              const id = link.getAttribute('data-id');
              const url = `https://geo.sic-di.com/catexp?id=${id}`;

              /* 3️⃣ fetch con cabecera */
              const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) {
                alert('Sin permiso o PDF inexistente');
                return;
              }

              /* 4️⃣ mostrar PDF en modal */
              const blob = await res.blob();
              setPdfUrl(URL.createObjectURL(blob));
            } catch (err) {
              console.error(err);
              alert('Error al obtener PDF');
            }
          });
        }
      }
    });

    return () => map.remove();
  }, [ready, visible, perms, styleUrl]);

  /* ─── helpers WMS: idSrc / idLay ─── */
  const idSrc = (n) => `src-${n.replace(':', '_')}`;
  const idLay = (n) => `lay-${n.replace(':', '_')}`;

  const addLayer = async (map, name, fit) => {
    const c = capasRef.current.find((x) => x.name === name);
    if (!c || map.getSource(idSrc(name))) return;
    map.addSource(idSrc(name), {
      type: 'raster',
      tiles: [wmsTileURL({ layer: c.name, style: c.style })],
      tileSize: 256,
    });
    map.addLayer({ id: idLay(name), type: 'raster', source: idSrc(name) });
    if (fit && Array.isArray(c.bbox))
      map.fitBounds(c.bbox, { padding: 50 });
  };

  const removeLayer = (map, name) => {
    if (map.getLayer(idLay(name))) map.removeLayer(idLay(name));
    if (map.getSource(idSrc(name))) map.removeSource(idSrc(name));
  };

  /* ─── UI actions ─── */
  const toggleCapa = async (n) => {
    const map = mapRef.current;
    const act = activas.includes(n);
    const next = act ? activas.filter((x) => x !== n) : [...activas, n];
    setActivas(next);
    await savePrefs(user.uid, { capas: next });
    act ? removeLayer(map, n) : await addLayer(map, n, true);
  };

  const saveFields = async (f) => {
    setVisible(f);
    await savePrefs(user.uid, { visibleFields: f });
  };

  const cambiarEstilo = async (lbl) => {
    const nuevo = MAP_STYLES[lbl];
    if (!nuevo || nuevo === styleUrl) return;
    const map = mapRef.current;
    setStyleUrl(nuevo);
    map.setStyle(nuevo);
    map.once('style.load', async () => {
      ensureHighlight(map);
      await Promise.all(
        capasRef.current
          .filter((c) => activas.includes(c.name))
          .map((c) => addLayer(map, c.name, false)),
      );
    });
    await savePrefs(user.uid, { mapStyle: lbl });
  };

  /* ─── render ─── */
  if (!user || !ready) return null;

  return (
    <>
      <SidebarEnge
        user={user}
        isAdmin={isAdmin}
        isSuper={isSuper}
        mapStyles={MAP_STYLES}
        mapStyleActual={styleUrl}
        cambiarEstiloMapa={cambiarEstilo}
        capas={capas}
        activas={activas}
        toggleCapa={toggleCapa}
        visibleFields={visible}
        saveVisibleFields={saveFields}
      />
      <div ref={divRef} className="map-wrap" />

      <PdfModal
        url={pdfUrl}
        canPrint={perms.canPrint}
        canDownload={perms.canDown}
        onClose={() => setPdfUrl(null)}
      />
    </>
  );
}
