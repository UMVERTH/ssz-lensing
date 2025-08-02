/**
 * Modal para expedientes PDF basado en pdf.js
 * - Copia la distribución oficial (build + web) en /public/pdfjs
 * - Oculta los botones Imprimir / Descargar según props
 * - Usa sandbox para bloquear descargas si es necesario
 */
import { useEffect } from 'react';
import Swal           from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

export default function PdfModal({ url, canPrint, canDownload, onClose }) {
  if (!url) return null;

  /* Construimos URL al visor pdf.js */
  const viewerURL = (() => {
    const qp = new URLSearchParams({
      file: encodeURIComponent(url),
      ...(canPrint    ? {} : { disablePrint   : 'true' }),
      ...(canDownload ? {} : { disableDownload: 'true' }),
    });
    return `/pdfjs/web/viewer.html?${qp.toString()}`;
  })();

  /* HEAD de validación (404 / CORS) */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(url, { method: 'HEAD' });
        if (!r.ok) throw new Error();
      } catch {
        Swal.fire('Expediente no disponible',
                  'La URL responde con error o CORS.',
                  'error');
        onClose?.();
      }
    })();
  }, [url, onClose]);

  return (
    <div className="pdf-backdrop" onClick={onClose}>
      <div className="pdf-window" onClick={e => e.stopPropagation()}>
        <iframe
          sandbox="allow-scripts allow-same-origin"
          src={viewerURL}
          title="Expediente"
          className="w-full h-full"
        />
        <button className="pdf-close" onClick={onClose}>×</button>
      </div>

      {/* styles in-component */}
      <style jsx>{`
        .pdf-backdrop{
          position:fixed;inset:0;background:rgba(0,0,0,.55);
          display:flex;align-items:center;justify-content:center;
          z-index:1000;
        }
        .pdf-window{
          width:90vw;height:90vh;background:#000;position:relative;
          border-radius:.5rem;overflow:hidden;
        }
        .pdf-close{
          position:absolute;top:.25rem;right:.65rem;
          font-size:2rem;color:#fff;line-height:1;
        }
      `}</style>
    </div>
  );
}
