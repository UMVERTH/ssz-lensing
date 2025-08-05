/* PdfModal.jsx – mismo visor directo, con opción de ocultar toolbar  */
'use client';
import { useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

export default function PdfModal({ url, canPrint=true, canDownload=true, onClose }) {
  const [loading, setLoading] = useState(true);

  /* ▶️ Aplica #toolbar=0 cuando NO hay permiso de descargar/imprimir */
  const iframeURL = useMemo(() => {
    if (!url) return '';
    const hide = !canPrint && !canDownload;
    return hide ? `${url}#toolbar=0` : url;
  }, [url, canPrint, canDownload]);

  /* Loader SweetAlert */
  useEffect(() => {
    if (!url) return;
    Swal.fire({
      title: 'Cargando…',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });
    setLoading(true);
    return () => Swal.close();
  }, [url]);

  const handleLoad = () => { setLoading(false); Swal.close(); };

  if (!url) return null;

  return (
    <div className="pdf-backdrop" onClick={onClose}>
      <div className="pdf-window" onClick={e => e.stopPropagation()}>
        <iframe
          src={iframeURL}
          title="Expediente"
          onLoad={handleLoad}
          className="w-full h-full"
        />
        <button className="pdf-close" onClick={onClose}>×</button>
        {loading && <div className="overlay" />}
        <style jsx>{`
          .pdf-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);
            display:flex;align-items:center;justify-content:center;z-index:1000;}
          .pdf-window{width:90vw;height:90vh;background:#000;position:relative;
            border-radius:.5rem;overflow:hidden;}
          .pdf-close{position:absolute;top:.25rem;right:.65rem;font-size:2rem;
            color:#fff;background:none;border:none;cursor:pointer;}
          .overlay{position:absolute;inset:0;background:rgba(0,0,0,.25);}
        `}</style>
      </div>
    </div>
  );
}
