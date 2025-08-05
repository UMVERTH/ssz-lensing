/* --------------------------------------------------------------
 * pages/mapa.jsx · Visor Mapbox + GeoServer + buscador único
 * ------------------------------------------------------------ */
'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl                        from 'mapbox-gl';
import AnimatedPopup                   from 'mapbox-gl-animated-popup';

import 'mapbox-gl/dist/mapbox-gl.css';
import 'sweetalert2/dist/sweetalert2.min.css';


import SidebarEnge           from '@/components/SidebarEnge';
import PdfModal              from '@/components/PdfModal';
import SearchBar             from '@/components/SearchBar';

import { useAuth }           from '@/hooks/useAuth';
import { loadPrefs, savePrefs } from '@/services/Prefs';
import { doc, getDoc }       from 'firebase/firestore';
import { db }                from '@/auth/firebase';

import {
  obtenerCapasWMS,
  wmsTileURL,
  getFeatureInfoURL,
} from '@/services/GeoServerService';
import { obtenerUrlPdf }     from '@/utils/expediente';

import Swal                  from 'sweetalert2';
import * as turf             from '@turf/turf';
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
const fmt={
  moneda:v=>`$ ${Number(v).toLocaleString('es-MX',{minimumFractionDigits:2})}`,
  area  :v=>`${Number(v).toLocaleString('es-MX')} m²`,
  fecha :v=>{const d=new Date(v);return isNaN(d)?v:d.toLocaleDateString('es-MX');},
  numero:v=>v,
  texto :v=>v,
};
const pdfIcon='<svg xmlns="http://www.w3.org/2000/svg" fill="#d4382d" viewBox="0 0 24 24" width="20" height="20"><path d="M6 2a2 2 0 0 0-2 2v16c0 1.1.9 2 2 2h12a2 2 0 0 0 2-2V8l-6-6H6z" opacity=".15"/><path d="M8 13h1.5a1.5 1.5 0 0 1 0 3H8v-3zm4 0v3m-2-1.5H8m6-1.5h2a1 1 0 0 1 0 2h-2v-2zM14 2v6h6" stroke="#d4382d" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';

const val=(k,v)=>{
  if(v===''||v==null) return '';
  if(/^https?:\/\//i.test(v))
    return `<a href="${v}" target="_blank" class="pop-link">${/\.pdf$/i.test(v)?pdfIcon:'🔗'}</a>`;
  return (fmt[tipoCampo[k]||'texto']||fmt.texto)(v);
};
const buildHTML=(props,visible,allowPdf)=>{
  const pdfId=props.cve_cat??null;
  const head=`<div class="pop-head">
    <span class="pop-key">${props.cve_cat??''}</span>
    ${allowPdf&&pdfId?`<a href="#" data-id="${pdfId}" class="pop-pdf">${pdfIcon}</a>`:''}
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

/* -------- highlight layer -------- */
const H_SRC='hl', H_FILL='hl-fill', H_LINE='hl-line';
const ensureHighlight=map=>{
  if(!map.getSource(H_SRC))
    map.addSource(H_SRC,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  if(!map.getLayer(H_FILL))
    map.addLayer({id:H_FILL,type:'fill',source:H_SRC,paint:{'fill-color':'#FF3333','fill-opacity':0.25}});
  if(!map.getLayer(H_LINE))
    map.addLayer({id:H_LINE,type:'line',source:H_SRC,paint:{'line-color':'#FF3333','line-width':3}});
};
const openPopup=(map,lngLat,html,ref)=>{
  ref.current?.remove();
  ref.current=new AnimatedPopup({
    offset:25,className:'ge-balloon',closeButton:true,
    openingAnimation:{duration:750,easing:'easeOutElastic',transform:'scale'},
    closingAnimation:{duration:300,easing:'easeInBack',transform:'scale'},
    maxWidth:'340px',
  }).setLngLat(lngLat).setHTML(html).addTo(map);
};

export default function MapaPage(){
  const {user,isAdmin,isSuper}=useAuth();

  /* refs */
  const mapRef=useRef(null),divRef=useRef(null),popupRef=useRef(null);
  const capasRef=useRef([]),actRef=useRef([]);

  /* state */
  const [ready,setReady]         =useState(false);
  const [styleUrl,setStyleUrl]   =useState(MAP_STYLES.Satélite);
  const [capas,setCapas]         =useState([]);
  const [activas,setActivas]     =useState([]);
  const [visible,setVisible]     =useState([]);
  const [perms,setPerms]         =useState({canPrint:true,canDown:true,allowPopup:true,showPdf:true});
  const [pdfUrl,setPdfUrl]       =useState(null);
  const [polyData,setPolyData]   =useState([]);
  const [polyReady,setPolyReady] =useState(false);

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
  useEffect(()=>{actRef.current=activas;},[activas]);

  /* init map */
  useEffect(()=>{
    if(!ready||mapRef.current||!divRef.current) return;
    const map=new mapboxgl.Map({
      container:divRef.current,
      style:styleUrl,
      center:[-99.506,27.48],
      zoom:13,
    });
    mapRef.current=map; requestAnimationFrame(()=>map.resize());

    map.on('load',async()=>{
      ensureHighlight(map);

      /* capas WMS */
      const lista=await obtenerCapasWMS();
      capasRef.current=lista; setCapas(lista);
      await Promise.all(
        lista.filter(x=>activas.includes(x.name)).map(x=>addLayer(map,x.name,false))
      );

      /* cargar features para SearchBar */
      try{
        const all=await Promise.all(lista.map(async l=>{
          const url=`${process.env.NEXT_PUBLIC_GEOSERVER_BASE}/wfs?service=WFS&version=1.1.0&request=GetFeature&typeName=${l.name}&outputFormat=application/json&srsName=EPSG:4326`;
          return (await fetch(url)).json();
        }));
        setPolyData(all.flatMap(fc=>fc.features));
        setPolyReady(true);
      }catch(err){console.error(err);}
    });

    /* click → popup */
    map.on('click',async e=>{
      popupRef.current?.remove();
      let feature=null;
      for(const layer of actRef.current){
        try{
          const url=getFeatureInfoURL({layer,lngLat:e.lngLat,map});
          const txt=await (await fetch(url)).text();
          feature=txt.trim().startsWith('{')
            ? JSON.parse(txt).features?.[0]??null
            : null;
          if(feature) break;
        }catch{}
      }
      if(!feature){
        map.getSource(H_SRC)?.setData({type:'FeatureCollection',features:[]});
        return;
      }
      map.getSource(H_SRC)?.setData({type:'FeatureCollection',features:[feature]});

      if(perms.allowPopup){
        const puedePdf=(perms.canPrint||perms.canDown)&&perms.showPdf;
        openPopup(map,e.lngLat,buildHTML(feature.properties,visible,puedePdf),popupRef);

        const link=popupRef.current.getElement().querySelector('.pop-pdf');
        if(link){
          link.addEventListener('click',async ev=>{
            ev.preventDefault();ev.stopPropagation();
            try{
              const clave=link.getAttribute('data-id');
              const url  =await obtenerUrlPdf(clave);
              setPdfUrl(url);
            }catch(err){
              const msg=err.code===404?'Expediente no encontrado'
                       :err.code===401||err.code===403?'Sin permiso'
                       :'Error al descargar';
              Swal.fire(msg,'',err.code===404?'warning':'error');
            }
          });
        }
      }
    });

    return()=>map.remove();
  },[ready,visible,perms,styleUrl]);

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

  /* ---- toggleCapa (◀‑ corregido) ---- */
  const toggleCapa=async n=>{
    const map=mapRef.current, act=activas.includes(n);
    const next=act ? activas.filter(x=>x!==n) : [...activas,n];
    setActivas(next);
    await savePrefs(user.uid,{capas:next});
    act ? removeLayer(map,n) : await addLayer(map,n,true);
  };

  /* ---- guardar campos visibles ---- */
  const saveFields=async f=>{
    setVisible(f);
    await savePrefs(user.uid,{visibleFields:f});
  };

  /* ---- cambiar estilo de mapa ---- */
  const cambiarEstiloMapa=async lbl=>{
    const nu=MAP_STYLES[lbl]; if(!nu||nu===styleUrl) return;
    const map=mapRef.current; setStyleUrl(nu); map.setStyle(nu);
    map.once('styledata',async()=>{
      ensureHighlight(map);
      await Promise.all(
        capasRef.current.filter(c=>activas.includes(c.name))
                        .map(c=>addLayer(map,c.name,false))
      );
    });
    await savePrefs(user.uid,{mapStyle:lbl});
  };

  /* centrar / popup desde SearchBar */
  const focusFeature=feat=>{
    const map=mapRef.current; if(!map) return;
    map.getSource(H_SRC)?.setData({type:'FeatureCollection',features:[feat]});
    const [minLng,minLat,maxLng,maxLat]=feat.bbox??turf.bbox(feat);
    map.fitBounds([[minLng,minLat],[maxLng,maxLat]],{padding:60});
    if(perms.allowPopup)
      openPopup(map,[(minLng+maxLng)/2,(minLat+maxLat)/2],buildHTML(feat.properties,visible,perms.showPdf),popupRef);
  };

  if(!user||!ready) return null;

  return (
    <>
      <SidebarEnge
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
    </>
  );
}
