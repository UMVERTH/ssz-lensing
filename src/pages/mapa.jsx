/* --------------------------------------------------------------
 * pages/mapa.jsx · Mapbox + GeoServer + Popup rápido
 * Pin tipo Google: arrastrar sobre el mapa (snap) y abrir Street View
 * ------------------------------------------------------------ */
'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl                        from 'mapbox-gl';
import AnimatedPopup                   from 'mapbox-gl-animated-popup';

import 'mapbox-gl/dist/mapbox-gl.css';
import 'sweetalert2/dist/sweetalert2.min.css';

import SidebarEnge            from '@/components/SidebarEnge';
import PdfModal               from '@/components/PdfModal';
import SearchBar              from '@/components/SearchBar';
import StreetViewModal        from '@/components/StreetViewModal';

import { useAuth }            from '@/hooks/useAuth';
import { loadPrefs, savePrefs } from '@/services/Prefs';
import { doc, getDoc }        from 'firebase/firestore';
import { db }                 from '@/auth/firebase';

import {
  obtenerCapasWMS,
  wmsTileURL,
  getFeatureInfoURL,
} from '@/services/GeoServerService';
import { obtenerUrlPdf }      from '@/utils/expediente';

import Swal                   from 'sweetalert2';
import * as turf              from '@turf/turf';
import { FIELD_LABELS, OMIT_FIELDS } from '@/utils/campos';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/* -------- estilos base -------- */
const MAP_STYLES = {
  Satélite : 'mapbox://styles/mapbox/satellite-streets-v12',
  Calles   : 'mapbox://styles/mapbox/streets-v12',
  Claro    : 'mapbox://styles/mapbox/light-v11',
};

/* -------- helpers popup -------- */
const OMIT      = new Set(OMIT_FIELDS);
const tipoCampo = Object.fromEntries(Object.entries(FIELD_LABELS).map(([k,v])=>[k,v.fmt]));
const fmt = {
  moneda:v=>`$ ${Number(v).toLocaleString('es-MX',{minimumFractionDigits:2})}`,
  area  :v=>`${Number(v).toLocaleString('es-MX')} m²`,
  fecha :v=>{const d=new Date(v);return isNaN(d)?v:d.toLocaleDateString('es-MX');},
  numero:v=>v,
  texto :v=>v,
};
const pdfIcon = `<svg xmlns="http://www.w3.org/2000/svg" fill="#d4382d" viewBox="0 0 24 24" width="20" height="20"><path d="M6 2a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6H6z" opacity=".15"/><path d="M8 13h1.5a1.5 1.5 0 0 1 0 3H8v-3zm4 0v3m-2-1.5H8m6-1.5h2a1 1 0 0 1 0 2h-2v-2zM14 2v6h6" stroke="#d4382d" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
const val = (k,v)=>{
  if(v===''||v==null) return '';
  if(/^https?:\/\//i.test(v))
    return `<a href="${v}" target="_blank" class="pop-link">${/\.pdf$/i.test(v)?pdfIcon:'🔗'}</a>`;
  return (fmt[tipoCampo[k]||'texto']||fmt.texto)(v);
};
const buildHTML=(props,visible,allowPdf)=>{
  const pdfId=props.cve_cat??null;
  const head=`<div class="pop-head">
    <span class="pop-key">${props.cve_cat??''}</span>
    ${allowPdf&&pdfId?`<a href="#" data-id="${pdfId}" class="pop-pdf" title="Expediente PDF">${pdfIcon}</a>`:''}
  </div>`;
  const rows=Object.entries(props)
    .filter(([k])=>{
      if(k==='cve_cat') return false;
      if(OMIT.has(k.toLowerCase())) return false;
      return visible.length===0||visible.includes(k);
    })
    .map(([k,v])=>`<tr><th>${FIELD_LABELS[k]?.txt??k}</th><td>${val(k,v)}</td></tr>`)
    .join('');
  return `${head}<table class="pop">${rows}</table>`;
};

/* -------- highlight -------- */
const H_SRC='hl', H_FILL='hl-fill', H_LINE='hl-line';
const ensureHighlight=map=>{
  if(!map.getSource(H_SRC))
    map.addSource(H_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});

  if(!map.getLayer(H_FILL))
    map.addLayer({id:H_FILL,type:'fill',source:H_SRC,paint:{'fill-color':'#FF3333','fill-opacity':0.25}});

  if(!map.getLayer(H_LINE))
    map.addLayer({id:H_LINE,type:'line',source:H_SRC,paint:{'line-color':'#FF3333','line-width':3}});
};

/* -------- índice de clic (para popup rápido) -------- */
const CLICK_SRC='click-index-src';
const CLICK_FILL='click-index-fill';
const CLICK_LINE='click-index-line';
const emptyFC = { type:'FeatureCollection', features:[] };
const ensureClickIndex=(map)=>{
  if(!map.getSource(CLICK_SRC))
    map.addSource(CLICK_SRC,{ type:'geojson', data: emptyFC });
  if(!map.getLayer(CLICK_FILL)){
    try { map.addLayer({ id:CLICK_FILL, type:'fill', source:CLICK_SRC, paint:{ 'fill-opacity':0 } }, H_FILL); }
    catch { map.addLayer({ id:CLICK_FILL, type:'fill', source:CLICK_SRC, paint:{ 'fill-opacity':0 } }); }
  }
  if(!map.getLayer(CLICK_LINE)){
    try { map.addLayer({ id:CLICK_LINE, type:'line', source:CLICK_SRC, paint:{ 'line-opacity':0 } }, H_LINE); }
    catch { map.addLayer({ id:CLICK_LINE, type:'line', source:CLICK_SRC, paint:{ 'line-opacity':0 } }); }
  }
};
const setClickIndexData=(map,features)=>{
  const src = map.getSource(CLICK_SRC);
  if(src) src.setData({ type:'FeatureCollection', features: features||[] });
};

/* -------- popup ultrarrápido -------- */
const fastOpenPopup=(map,lngLat,html,ref)=>{
  const opts = {
    offset: 18,
    className:'ge-balloon',
    closeButton:true,
    openingAnimation:{ duration:120, easing:'easeOutBack', transform:'scale' },
    closingAnimation:{ duration:120, easing:'easeInBack',  transform:'scale'  },
    maxWidth:'340px',
  };
  if(ref.current){ ref.current.setLngLat(lngLat).setHTML(html).addTo(map); return; }
  ref.current = new AnimatedPopup(opts).setLngLat(lngLat).setHTML(html).addTo(map);
};

/* -------- cobertura (calles azules) + target del snap -------- */
const SV_COVER_LINE = 'sv-cover-line';
const SV_TARGET_SRC = 'sv-target-src';
const SV_TARGET     = 'sv-target';
const ensureSvDragLayers = (map)=>{
  // usa la capa base "composite/road" del estilo de Mapbox
  if(!map.getLayer(SV_COVER_LINE)){
    map.addLayer({
      id: SV_COVER_LINE,
      type: 'line',
      source: 'composite',
      'source-layer': 'road',
      filter: [
        'in',
        ['get','class'],
        ['literal', [
          'motorway','trunk','primary','secondary','tertiary',
          'street','street_limited','service','link','trunk_link','primary_link','secondary_link','tertiary_link'
        ]]
      ],
      paint: {
        'line-color': '#0b66ff',
        'line-opacity': 0.70,
        'line-width': ['interpolate',['linear'],['zoom'], 10, 1.4, 12, 2.2, 14, 3.2, 16, 6],
        'line-blur': 0.2
      }
    });
  }
  if(!map.getSource(SV_TARGET_SRC)){
    map.addSource(SV_TARGET_SRC, { type:'geojson', data: emptyFC });
  }
  if(!map.getLayer(SV_TARGET)){
    map.addLayer({
      id: SV_TARGET,
      type: 'circle',
      source: SV_TARGET_SRC,
      paint: {
        'circle-radius': ['interpolate',['linear'],['zoom'], 10, 5, 16, 8],
        'circle-color': '#ffffff',
        'circle-stroke-color': '#0b66ff',
        'circle-stroke-width': 3,
        'circle-opacity': 1
      }
    });
  }
};
const removeSvDragLayers = (map)=>{
  if(map.getLayer(SV_TARGET)) map.removeLayer(SV_TARGET);
  if(map.getSource(SV_TARGET_SRC)) map.removeSource(SV_TARGET_SRC);
  if(map.getLayer(SV_COVER_LINE)) map.removeLayer(SV_COVER_LINE);
};

/* -------- control del pin (debajo de zoom/geolocalizar) -------- */
class StreetViewPinControl {
  constructor({ onStart, btnRef }) {
    this.onStart = onStart;
    this.btnRef = btnRef;
    this._container = null;
    this._btn = null;
  }
  onAdd() {
    const c = document.createElement('div');
    c.className = 'mapboxgl-ctrl mapboxgl-ctrl-group sv-pin-ctrl';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sv-pin-btn';
    b.title = 'Arrastra al mapa para abrir Street View';
    b.setAttribute('aria-label','Abrir Street View con pin');
    const img = document.createElement('img');
    img.src = '/sv-pin.png'; img.alt = ''; img.draggable = false; img.className = 'sv-pin-ctrl-img';
    b.appendChild(img);
    // Pointer Events → soporta mouse/touch/pen
    b.addEventListener('pointerdown', this.onStart, { passive:false });
    c.appendChild(b);
    this._container = c; this._btn = b;
    if (this.btnRef && 'current' in this.btnRef) this.btnRef.current = b;
    return c;
  }
  onRemove() {
    this._btn?.removeEventListener('pointerdown', this.onStart);
    this._container?.remove();
    this._btn = null; this._container = null;
  }
}

export default function MapaPage(){
  const {user,isAdmin,isSuper}=useAuth();

  /* refs */
  const mapRef        = useRef(null);
  const divRef        = useRef(null);
  const popupRef      = useRef(null);
  const capasRef      = useRef([]);
  const actRef        = useRef([]);
  const visibleRef    = useRef([]);
  const permsRef      = useRef({});
  const pinBtnRef     = useRef(null);
  const snapRef       = useRef(null);
  const dragMarkerRef = useRef(null);

  /* state */
  const [ready,setReady]         = useState(false);
  const [styleUrl,setStyleUrl]   = useState(MAP_STYLES.Satélite);
  const [capas,setCapas]         = useState([]);
  const [activas,setActivas]     = useState([]);
  const [visible,setVisible]     = useState([]);
  const [perms,setPerms]         = useState({canPrint:true,canDown:true,allowPopup:true,showPdf:true});
  const [pdfUrl,setPdfUrl]       = useState(null);
  const [polyData,setPolyData]   = useState([]);
  const [polyReady,setPolyReady] = useState(false);

  // Street View
  const [svPos,setSvPos]         = useState(null); // {lat, lng}

  // Drag pin
  const [pinDragging,setPinDragging] = useState(false);
  const [pinXY,setPinXY]             = useState({ x: 0, y: 0 });
  const wasEnabledRef                = useRef(null);

  /* sidebar */
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const toggleSidebar=()=>setSidebarOpen(o=>!o);

  /* cargar prefs + permisos */
  useEffect(()=>{
    if(!user) return;
    (async()=>{
      const prefs=await loadPrefs(user.uid);
      setStyleUrl(MAP_STYLES[prefs.mapStyle]??MAP_STYLES.Satélite);
      setActivas(prefs.capas??[]);
      setVisible(prefs.visibleFields??[]);
      const snap=await getDoc(doc(db,'usuarios',user.uid));
      const d=snap.data()??{};
      setPerms({
        canPrint  :d.canPrint  !==false||isAdmin||isSuper,
        canDown   :d.canDown   !==false||isAdmin||isSuper,
        allowPopup:d.allowPopup!==false||isAdmin||isSuper,
        showPdf   :d.showPdf   !==false||isAdmin||isSuper,
      });
      setReady(true);
    })();
  },[user,isAdmin,isSuper]);

  /* mantener refs actualizados */
  useEffect(()=>{actRef.current     = activas;},[activas]);
  useEffect(()=>{visibleRef.current = visible; },[visible]);
  useEffect(()=>{permsRef.current   = perms;   },[perms]);

  /* (des)activar interacciones del mapa */
  const disableMapInteractions = ()=>{
    const map=mapRef.current; if(!map) return;
    wasEnabledRef.current = {
      boxZoom: map.boxZoom.isEnabled(),
      dragPan: map.dragPan.isEnabled(),
      scrollZoom: map.scrollZoom.isEnabled(),
      dblClick: map.doubleClickZoom.isEnabled(),
      touchZoomRotate: map.touchZoomRotate.isEnabled(),
    };
    map.boxZoom.disable(); map.dragPan.disable(); map.scrollZoom.disable();
    map.doubleClickZoom.disable(); map.touchZoomRotate.disable();
  };
  const restoreMapInteractions = ()=>{
    const map=mapRef.current; if(!map||!wasEnabledRef.current) return;
    const w=wasEnabledRef.current;
    if(w.boxZoom) map.boxZoom.enable();
    if(w.dragPan) map.dragPan.enable();
    if(w.scrollZoom) map.scrollZoom.enable();
    if(w.dblClick) map.doubleClickZoom.enable();
    if(w.touchZoomRotate) map.touchZoomRotate.enable();
    wasEnabledRef.current=null;
  };

  /* abre el modal en el siguiente ciclo para evitar “click fantasma” del drop */
  const OPEN_DELAY_MS = 40;
  const openStreetView = (lat, lng)=>{
    setTimeout(()=>{ requestAnimationFrame(()=> setSvPos({ lat, lng })) }, OPEN_DELAY_MS);
  };

  /* SNAP + mover marker visible durante el drag */
  const updateSnapFromLocalPoint = (localPt)=>{
    const map=mapRef.current; if(!map) return;

    const pad = 14;
    const bbox = [[localPt.x - pad, localPt.y - pad],[localPt.x + pad, localPt.y + pad]];
    const feats = map.queryRenderedFeatures(bbox, { layers:[SV_COVER_LINE] });

    const rawLngLat = map.unproject([localPt.x, localPt.y]);
    let target = { lng: rawLngLat.lng, lat: rawLngLat.lat };

    if(feats && feats.length){
      const refPt  = turf.point([rawLngLat.lng, rawLngLat.lat]);
      let best=null, bestDist=Infinity;
      for(const f of feats){
        const g = f.geometry; if(!g) continue;
        const sets = g.type==='LineString' ? [g.coordinates] :
                     g.type==='MultiLineString' ? g.coordinates : [];
        for(const coords of sets){
          if(!coords || coords.length<2) continue;
          const ls = turf.lineString(coords);
          const n  = turf.nearestPointOnLine(ls, refPt, {units:'meters'});
          const d  = n.properties?.dist ?? Infinity;
          if(d < bestDist){ bestDist=d; best=n; }
        }
      }
      if(best){ target = { lng: best.geometry.coordinates[0], lat: best.geometry.coordinates[1] }; }
    }

    // marker visible durante el drag
    if(!dragMarkerRef.current){
      const el = document.createElement('div');
      el.className = 'sv-drag-marker';
      const img = document.createElement('img');
      img.src = '/sv-pin.png'; img.alt = ''; img.draggable = false;
      el.appendChild(img);
      dragMarkerRef.current = new mapboxgl.Marker({ element: el, anchor:'bottom' })
        .setLngLat(target).addTo(map);
    }else{
      dragMarkerRef.current.setLngLat(target);
    }

    // anillo de destino
    map.getSource(SV_TARGET_SRC)?.setData({
      type:'FeatureCollection',
      features:[{ type:'Feature', geometry:{ type:'Point', coordinates:[target.lng, target.lat] }, properties:{} }]
    });

    snapRef.current = target;
  };

  /* Drag del pin con Pointer Events (mouse/touch/pen) */
  const startDragPin = (e)=>{
    e.preventDefault();
    // captura el puntero para que los eventos continúen incluso fuera del botón
    (e.currentTarget && e.currentTarget.setPointerCapture)
      ? e.currentTarget.setPointerCapture(e.pointerId) : null;

    const map=mapRef.current; if(!map) return;

    const rect = map.getContainer().getBoundingClientRect();
    const toLocal = (client)=>({ x: client.x - rect.left, y: client.y - rect.top });

    const p = { x: e.clientX, y: e.clientY };
    const local = toLocal(p);
    setPinXY(p);
    setPinDragging(true);
    disableMapInteractions();

    ensureSvDragLayers(map);
    pinBtnRef.current?.classList.add('dragging');
    pinBtnRef.current?.style.setProperty('--x', `${p.x}px`);
    pinBtnRef.current?.style.setProperty('--y', `${p.y}px`);

    updateSnapFromLocalPoint(local);

    const onMove=(ev)=>{
      const q = { x: ev.clientX, y: ev.clientY };
      setPinXY(q);
      pinBtnRef.current?.style.setProperty('--x', `${q.x}px`);
      pinBtnRef.current?.style.setProperty('--y', `${q.y}px`);
      updateSnapFromLocalPoint(toLocal(q));
    };

    const onUp=(ev)=>{
      // limpiar listeners
      window.removeEventListener('pointermove',onMove);
      window.removeEventListener('pointerup',onUp);

      setPinDragging(false);
      pinBtnRef.current?.classList.remove('dragging');
      restoreMapInteractions();

      // limpiar capas/marker
      const map = mapRef.current;
      removeSvDragLayers(map);
      dragMarkerRef.current?.remove();
      dragMarkerRef.current = null;

      // validar que soltaste dentro del mapa
      const inside =
        ev.clientX >= rect.left && ev.clientX <= rect.right &&
        ev.clientY >= rect.top  && ev.clientY <= rect.bottom;

      if(!inside){ snapRef.current = null; return; }

      // 1) punto con snap si hubo; 2) si no, el punto exacto
      const rawLocal = toLocal({ x: ev.clientX, y: ev.clientY });
      const rawLngLat = map.unproject([rawLocal.x, rawLocal.y]);
      const snapped = snapRef.current ?? { lng: rawLngLat.lng, lat: rawLngLat.lat };

      // abrir modal en siguiente tick
      openStreetView(snapped.lat, snapped.lng);

      // limpiar
      snapRef.current = null;
    };

    window.addEventListener('pointermove',onMove, { passive:true });
    window.addEventListener('pointerup',  onUp,   { passive:true });
  };

  /* listeners del contenido del popup (solo PDF) */
  const attachPopupHandlers = ()=>{
    const root = popupRef.current?.getElement();
    if(!root) return;
    const pdfLink = root.querySelector('.pop-pdf');
    if(pdfLink){
      pdfLink.addEventListener('click',async ev=>{
        ev.preventDefault();ev.stopPropagation();
        try{
          const clave=pdfLink.getAttribute('data-id');
          const url  =await obtenerUrlPdf(clave);
          setPdfUrl(url);
        }catch(err){
          const msg=err.code===404?'Expediente no encontrado'
                   :err.code===401||err.code===403?'Sin permiso'
                   :'Error al descargar';
          Swal.fire(msg,'',err.code===404?'warning':'error');
        }
      }, { once:true });
    }
  };

  /* inicializar mapa */
  useEffect(()=>{
    if(!ready||mapRef.current||!divRef.current) return;

    const map=new mapboxgl.Map({
      container:divRef.current,
      style:styleUrl,
      center:[-99.506,27.48],
      zoom:13,
    });
    mapRef.current=map;
    requestAnimationFrame(()=>map.resize());

    map.on('load',async()=>{
      ensureHighlight(map);
      ensureClickIndex(map);

      /* Controles (sin fullscreen) */
      try{
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch:true }), 'top-right');
        map.addControl(new mapboxgl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserHeading: true
        }), 'top-right');
        map.addControl(new mapboxgl.ScaleControl({ unit:'metric' }), 'bottom-left');
        map.addControl(new StreetViewPinControl({ onStart:startDragPin, btnRef:pinBtnRef }), 'top-right');
      }catch{}

      /* Capas WMS */
      const lista=await obtenerCapasWMS();
      capasRef.current=lista;
      setCapas(lista);

      await Promise.all(
        lista.filter(x=>actRef.current.includes(x.name)).map(x=>addLayer(map,x.name,false))
      );

      /* GeoJSON para SearchBar + índice clic */
      try{
        const allFeatures = [];
        for(const l of lista){
          const url = `${process.env.NEXT_PUBLIC_GEOSERVER_BASE}/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${l.name}&outputFormat=application/json&srsName=EPSG:4326`;
          const fc  = await (await fetch(url)).json();
          for(const f of (fc.features||[])){
            f.properties = { ...f.properties, __layer: l.name };
            allFeatures.push(f);
          }
        }
        setPolyData(allFeatures);
        setPolyReady(true);
        const activeSet = new Set(actRef.current);
        setClickIndexData(map, allFeatures.filter(f=>activeSet.has(f.properties.__layer)));
      }catch(err){ console.error(err); }
    });

    /* click → popup (hit-test local; fallback WMS GFI) */
    map.on('click', async e=>{
      let feature=null;

      try{
        const pad = 3;
        const rendered = map.queryRenderedFeatures(
          [[e.point.x - pad, e.point.y - pad],[e.point.x + pad, e.point.y + pad]],
          { layers:[CLICK_FILL] }
        );
        if(rendered && rendered.length) feature = rendered[0];
      }catch{}

      if(!feature && actRef.current.length){
        const tasks = actRef.current.map(layer=>{
          try{
            const url = getFeatureInfoURL({layer,lngLat:e.lngLat,map});
            return fetch(url).then(r=>r.text()).then(txt=>{
              const t=txt?.trim()||'';
              if(t.startsWith('{')){
                const f = JSON.parse(t).features?.[0];
                if(f) return f;
              }
              throw new Error('sin feature');
            });
          }catch(err){ return Promise.reject(err); }
        });
        try{ feature = await Promise.any(tasks); }catch{ feature = null; }
      }

      if(!feature){
        map.getSource(H_SRC)?.setData(emptyFC);
        popupRef.current?.remove();
        return;
      }

      const feat = feature.type==='Feature' ? feature : {
        type:'Feature', geometry:feature.geometry, properties:feature.properties
      };
      map.getSource(H_SRC)?.setData({ type:'FeatureCollection', features:[feat] });

      if(permsRef.current.allowPopup){
        const puedePdf=(permsRef.current.canPrint||permsRef.current.canDown)&&permsRef.current.showPdf;
        fastOpenPopup(map, e.lngLat, buildHTML(feat.properties,visibleRef.current,puedePdf), popupRef);
        attachPopupHandlers();
      }
    });

    return ()=>{ map.remove(); mapRef.current=null; };
  },[ready,styleUrl]);

  /* helpers WMS */
  const idSrc=n=>`src-${n.replace(':','_')}`;
  const idLay=n=>`lay-${n.replace(':','_')}`;
  const addLayer=async(map,name,fit)=>{
    const c=capasRef.current.find(x=>x.name===name);
    if(!c||map.getSource(idSrc(name))) return;
    map.addSource(idSrc(name),{type:'raster',tiles:[wmsTileURL({layer:c.name,style:c.style})],tileSize:256});
    map.addLayer({id:idLay(name),type:'raster',source:idSrc(name)});
    if(fit&&Array.isArray(c.bbox)) map.fitBounds(c.bbox,{padding:50});
  };
  const removeLayer=(map,name)=>{
    if(map.getLayer(idLay(name)))  map.removeLayer(idLay(name));
    if(map.getSource(idSrc(name))) map.removeSource(idSrc(name));
  };

  /* reconstruir índice de clic tras cambiar activas */
  const refreshClickIndex=()=>{
    const map=mapRef.current; if(!map||!polyReady) return;
    ensureClickIndex(map);
    const active = new Set(actRef.current);
    const feats  = polyData.filter(f=>active.has(f.properties?.__layer));
    setClickIndexData(map,feats);
  };
  useEffect(()=>{ refreshClickIndex(); },[activas,polyReady,polyData]);

  /* toggle capa */
  const toggleCapa=async n=>{
    const map=mapRef.current, act=activas.includes(n);
    const next=act ? activas.filter(x=>x!==n) : [...activas,n];
    setActivas(next);
    await savePrefs(user.uid,{capas:next});
    act ? removeLayer(map,n) : await addLayer(map,n,true);
    refreshClickIndex();
  };

  /* guardar campos visibles */
  const saveFields=async f=>{
    setVisible(f);
    await savePrefs(user.uid,{visibleFields:f});
  };

  /* cambiar estilo (restaura WMS, highlight, índice, controles y pin) */
  const cambiarEstiloMapa=async lbl=>{
    const nuevo=MAP_STYLES[lbl]; if(!nuevo||nuevo===styleUrl) return;
    const map=mapRef.current;
    setStyleUrl(nuevo);
    map.setStyle(nuevo);

    map.once('style.load', async ()=>{
      ensureHighlight(map);
      ensureClickIndex(map);
      await Promise.all(
        capasRef.current.filter(c=>actRef.current.includes(c.name)).map(c=>addLayer(map,c.name,false))
      );
      refreshClickIndex();
      try{
        map.addControl(new mapboxgl.NavigationControl({ visualizePitch:true }), 'top-right');
        map.addControl(new mapboxgl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserHeading: true
        }), 'top-right');
        map.addControl(new mapboxgl.ScaleControl({ unit:'metric' }), 'bottom-left');
        map.addControl(new StreetViewPinControl({ onStart:startDragPin, btnRef:pinBtnRef }), 'top-right');
      }catch{}
    });
    await savePrefs(user.uid,{mapStyle:lbl});
  };

  /* centrar desde SearchBar */
  const focusFeature=feat=>{
    const map=mapRef.current; if(!map) return;
    map.getSource(H_SRC)?.setData({type:'FeatureCollection',features:[feat]});
    const [minLng,minLat,maxLng,maxLat]=feat.bbox??turf.bbox(feat);
    const centerLng=(minLng+maxLng)/2;
    const centerLat=(minLat+maxLat)/2;
    map.fitBounds([[minLng,minLat],[maxLng,maxLat]],{padding:60});
    if(permsRef.current.allowPopup){
      const puedePdf=(permsRef.current.canPrint||permsRef.current.canDown)&&permsRef.current.showPdf;
      fastOpenPopup(map, [centerLng,centerLat], buildHTML(feat.properties,visibleRef.current,puedePdf), popupRef);
      attachPopupHandlers();
    }
  };

  if(!user||!ready) return null;

  return (
    <div className={pinDragging ? 'sv-dragging' : ''}>
      <SidebarEnge
        open={sidebarOpen}
        onClose={toggleSidebar}
        user={user} isAdmin={isAdmin} isSuper={isSuper}
        mapStyles={MAP_STYLES} mapStyleActual={styleUrl}
        cambiarEstiloMapa={cambiarEstiloMapa}
        capas={capas} activas={activas} toggleCapa={toggleCapa}
        visibleFields={visible} saveVisibleFields={saveFields}
      />

      <div ref={divRef} className="map-wrap" />

      <SearchBar
        map={mapRef.current}
        data={polyData}
        ready={polyReady}
        onFeature={focusFeature}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={toggleSidebar}
      />

      {pdfUrl&&(
        <PdfModal
          key={pdfUrl}
          url={pdfUrl}
          canPrint={perms.canPrint}
          canDownload={perms.canDown}
          onClose={()=>setPdfUrl(null)}
        />
      )}

      {svPos && (
        <StreetViewModal
          key={`${svPos.lat},${svPos.lng}`}  /* recarga iframe al cambiar coords */
          lat={svPos.lat}
          lng={svPos.lng}
          apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
          onClose={()=>setSvPos(null)}
        />
      )}

      {pinDragging && (
        <div
          className="sv-pin-tip"
          style={{ ['--x']: pinXY.x+'px', ['--y']: pinXY.y+'px' }}
        >
          Suelta para abrir Street View
        </div>
      )}
    </div>
  );
}
