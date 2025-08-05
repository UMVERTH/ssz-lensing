/* utils/expediente.js – genera URL firmada del PDF (ruta RESTful) */
import { getAuth } from 'firebase/auth';

const BASE = 'https://exp.sic-di.com';

/**
 * Devuelve la URL del expediente verificada y lista para <iframe>.
 * 
 * @param {string} clave  Clave catastral, p. ej. "260101002001"
 * @returns {Promise<string>} URL firmada: https://exp.sic-di.com/catexp-open/<clave>?token=<ID_TOKEN>
 * @throws {Error}           Si el HEAD devuelve un código ≠ 200/206
 */
export async function obtenerUrlPdf(clave) {
  const token = await getAuth().currentUser.getIdToken(true);
  const url   = `${BASE}/catexp-open/${clave}?token=${token}`;

  /* Comprobación rápida de existencia / permisos (HEAD) */
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) {
    const err = new Error('HTTP ' + res.status);
    err.code  = res.status;
    throw err;
  }
  return url;          // 200 / 206 → OK
}
