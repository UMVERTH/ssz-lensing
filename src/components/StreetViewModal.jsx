'use client';

import React, { useEffect, useState } from 'react';

export default function StreetViewModal({ lat, lng, onClose, apiKey, title = 'SIC-DI' }) {
  const hasKey = Boolean(apiKey && apiKey.trim() !== '');
  const [loading, setLoading] = useState(true);
  const [failed,  setFailed]  = useState(false);

  // Colores/estilo (tema oscuro vidrio + acento)
  const ACCENT = '#6366F1';

  const iframeSrc = hasKey
    ? `https://www.google.com/maps/embed/v1/streetview?key=${apiKey}&location=${lat},${lng}&fov=80&pitch=0`
    : '';

  // Teclas: Esc cierra · "P" imprime (además de Ctrl/Cmd+P)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      const k = e.key?.toLowerCase?.() ?? '';
      if (k === 'p' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); window.print(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Bloquear scroll del fondo
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Ocultar título del navegador durante la impresión (quitar encabezado con el title)
  useEffect(() => {
    const prevTitle = document.title;
    const before = () => { document.title = ' '; document.body.classList.add('sv-printing'); };
    const after  = () => { document.title = prevTitle; document.body.classList.remove('sv-printing'); };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint',  after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint',  after);
      document.title = prevTitle;
      document.body.classList.remove('sv-printing');
    };
  }, []);

  const S = {
    backdrop:{
      position:'fixed', inset:0, zIndex: 2147483647,
      background:'rgba(2,6,23,.55)',
      backdropFilter:'saturate(140%) blur(3px)',
      WebkitBackdropFilter:'saturate(140%) blur(3px)',
      display:'grid', placeItems:'center',
    },
    modal:{
      width: 'min(1500px, 99vw)',
      height:'min(900px, 95vh)',
      color:'#EAF2FF',
      borderRadius:16,
      border:'1px solid rgba(255,255,255,.08)',
      boxShadow:'0 30px 80px rgba(0,0,0,.55)',
      display:'grid', gridTemplateRows:'52px 3px 1fr',
      overflow:'hidden',
      background: 'linear-gradient(180deg, rgba(15,23,42,.85), rgba(11,17,32,.88))',
    },
    header:{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'0 12px', height:52, userSelect:'none',
    },
    titleRow:{ display:'flex', alignItems:'center', gap:12 },
    titleTxt:{ fontWeight:700, letterSpacing:.2, fontSize:15 },
    chip:{
      fontSize:12, opacity:.92, padding:'2px 10px', borderRadius:999,
      color:'#DCE7FF', background:'rgba(255,255,255,.10)', border:'1px solid rgba(255,255,255,.08)'
    },
    actions:{ display:'flex', alignItems:'center', gap:10 },
    printBtn:{
      display:'inline-grid', placeItems:'center',
      height:34, padding:'0 12px', borderRadius:10, cursor:'pointer',
      background:'rgba(255,255,255,.09)', border:'1px solid rgba(255,255,255,.12)',
      color:'#F5FAFF', fontWeight:600, fontSize:13
    },
    closeBtn:{
      width:36, height:36, borderRadius:999, cursor:'pointer',
      display:'grid', placeItems:'center',
      background:'rgba(255,255,255,.10)',
      border:'1px solid rgba(255,255,255,.14)',
      color:'#F8FBFF',
      boxShadow:'0 6px 16px rgba(0,0,0,.28), inset 0 0 0 1px rgba(255,255,255,.04)'
    },
    accentBar:{ height:3, background:`linear-gradient(90deg, ${ACCENT}, transparent)` },
    frameWrap:{ position:'relative', background:'#0b1220' },
    frame:{ width:'100%', height:'100%', border:0 },
    loader:{
      position:'absolute', inset:0, display:'grid', placeItems:'center',
      background:'linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.10))',
      pointerEvents:'none'
    },
    fallback:{
      height:'100%', display:'grid', placeItems:'center', gap:14, textAlign:'center', padding:20,
      color:'#D3E1FF'
    }
  };

  return (
    <div style={S.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      {/* PRINT: solo el visor, sin título, sin barra de acento y sin márgenes */}
      <style>{`
        @page { size: landscape; margin: 0; }
        @media print {
          /* página negra y sin márgenes */
          html, body { background: #000 !important; margin: 0 !important; }
          /* ocultar header (título) y barra de acento */
          [data-sv="header"], [data-sv="accent"] { display: none !important; }
          /* modal y visor a pantalla completa */
          [data-sv="modal"] { position: static !important; width: 100vw !important; height: 100vh !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; background: #000 !important; }
          [data-sv="frame"] { width: 100vw !important; height: 100vh !important; }
          /* mejora de contraste de impresión (puede variar por navegador) */
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .sv-xbtn:hover { background: rgba(255,255,255,.16) !important; transform: translateY(-1px); }
        .sv-xbtn:active{ transform: translateY(0); }
        .sv-print:hover{ background: rgba(255,255,255,.14) !important; }
      `}</style>

      <div
        data-sv="modal"
        style={S.modal}
        onClick={(e)=>e.stopPropagation()}
      >
        {/* Header (NO se imprime) */}
        <div data-sv="header" style={S.header}>
          <div style={S.titleRow}>
            <span style={S.titleTxt}>{title}</span>
            <span style={S.chip}>{Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}</span>
          </div>
          <div style={S.actions}>
            <button
              className="sv-print"
              style={S.printBtn}
              title="Imprimir (P)"
              aria-label="Imprimir"
              onClick={()=>{
                // redundante al before/afterprint, pero asegura el “title vacío”
                const prev = document.title;
                document.title = ' ';
                document.body.classList.add('sv-printing');
                setTimeout(()=>window.print(), 10);
                setTimeout(()=>{ document.title = prev; document.body.classList.remove('sv-printing'); }, 600);
              }}
            >
              <span style={{display:'inline-flex', alignItems:'center', gap:8}}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                  <path d="M7 7V3h10v4h2a3 3 0 0 1 3 3v5h-4v4H6v-4H2v-5a3 3 0 0 1 3-3h2Zm2-2h6v2H9V5Zm8 12H7v2h10v-2Z"></path>
                </svg>
                Imprimir
              </span>
            </button>

            <button
              className="sv-xbtn"
              style={S.closeBtn}
              onClick={onClose}
              title="Cerrar (Esc)"
              aria-label="Cerrar"
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                <path strokeLinecap="round" d="M6 6 L18 18 M18 6 L6 18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Barra de acento (NO se imprime) */}
        <div data-sv="accent" style={S.accentBar} />

        {/* Contenido */}
        <div style={S.frameWrap}>
          {hasKey && !failed ? (
            <>
              <iframe
                data-sv="frame"
                key={`${lat},${lng}`}
                style={S.frame}
                src={iframeSrc}
                title={`${title} en ${lat}, ${lng}`}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                onLoad={()=>setLoading(false)}
                onError={()=>{ setFailed(true); setLoading(false); }}
              />
              {loading && (
                <div style={S.loader}>
                  <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke={ACCENT} strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" opacity=".25"/>
                    <path d="M21 12a9 9 0 0 1-9 9" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
                    </path>
                  </svg>
                </div>
              )}
            </>
          ) : (
            <div style={S.fallback}>
              <p>Necesitas configurar <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> o hubo un problema al cargar la vista.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
