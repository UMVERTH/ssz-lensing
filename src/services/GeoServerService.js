/* ---------------------------------------------------------------------------
 * GeoServerService.js  •  v7.1  (ago-2025)
 *  - Capabilities via proxy /api/wms/capabilities para evitar CORS/mixed content
 * ---------------------------------------------------------------------------
 */

const WORKSPACE = 'SICDI';

/* ─ Dominio GeoServer ─ */
const GS_BASE =
  (process.env.NEXT_PUBLIC_GEOSERVER_BASE || 'https://geo.sic-di.com/geoserver').replace(/\/+$/, '');
const WMS_URL = `${GS_BASE}/wms`;

/* Ruta proxy local (Next.js) */
const CAPABILITIES_PROXY = '/api/wms/capabilities';

/* --------------------------------------------------------------------------- */
export async function obtenerCapasWMS() {
  // 1) intenta por el proxy
  let xmlText;
  try {
    const res = await fetch(CAPABILITIES_PROXY, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Proxy error ${res.status}`);
    xmlText = await res.text();
  } catch (e) {
    // 2) fallback directo (puede fallar por CORS si estás en navegador)
    console.warn('[GeoServerService] Proxy falló, intento directo:', e?.message);
    const direct = `${WMS_URL}?service=WMS&version=1.3.0&request=GetCapabilities`;
    const r2 = await fetch(direct);
    if (!r2.ok) throw new Error(`GeoServer error ${r2.status}`);
    xmlText = await r2.text();
  }

  const xml = new DOMParser().parseFromString(xmlText, 'text/xml');

  return Array.from(xml.querySelectorAll('Layer > Layer'))
    .map((l) => {
      const name  = l.querySelector('Name') ?.textContent.trim();
      const title = l.querySelector('Title')?.textContent.trim();
      const style = l.querySelector('Style > Name')?.textContent.trim() ?? '';
      const legend = l
        .querySelector('Style LegendURL OnlineResource')
        ?.getAttribute('xlink:href') ?? '';

      const bb = l.querySelector('EX_GeographicBoundingBox');
      const bbox = bb
        ? [
            +bb.querySelector('westBoundLongitude')?.textContent ?? -180,
            +bb.querySelector('southBoundLatitude')?.textContent ?? -90,
            +bb.querySelector('eastBoundLongitude')?.textContent ?? 180,
            +bb.querySelector('northBoundLatitude')?.textContent ?? 90,
          ]
        : null;

      return { name, title, style, legend, bbox };
    })
    .filter((c) => c.name?.startsWith(`${WORKSPACE}:SECTOR_`));
}

/* --------------------------------------------------------------------------- */
export function wmsTileURL({ layer, style }) {
  const p = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetMap',
    layers: layer,
    styles: style || '',
    format: 'image/png',
    transparent: 'true',
    srs: 'EPSG:3857',
    width: 256,
    height: 256,
    tiled: 'true',
  });
  return `${WMS_URL}?${p}&bbox={bbox-epsg-3857}`;
}

/* --------------------------------------------------------------------------- */
export function getFeatureInfoURL({
  layer,
  lngLat,
  map,
  fmt = 'application/json',
  featureCount = 5,
  tolerancePX = 15,
}) {
  const [sw, ne] = map.getBounds().toArray();
  const bbox = [...sw, ...ne].join(',');
  const { width, height } = map.getCanvas();
  const { x, y } = map.project(lngLat);

  const p = new URLSearchParams({
    service: 'WMS',
    version: '1.1.1',
    request: 'GetFeatureInfo',
    layers: layer,
    query_layers: layer,
    bbox,
    width,
    height,
    srs: 'EPSG:4326',
    x: Math.round(x),
    y: Math.round(y),
    info_format: fmt,
    feature_count: featureCount,
    buffer: tolerancePX,
  });

  return `${WMS_URL}?${p}`;
}
