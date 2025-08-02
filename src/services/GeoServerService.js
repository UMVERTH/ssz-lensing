/* ---------------------------------------------------------------------------
 * GeoServerService.js  •  v7  (ago-2025)
 * ---------------------------------------------------------------------------
 */

const WORKSPACE = 'SICDI';

/* ─ Dominio GeoServer ─ */
const GS_BASE =
  process.env.NEXT_PUBLIC_GEOSERVER_BASE?.replace(/\/+$/, '') ||
  'https://geo.sic-di.com/geoserver';
const WMS_URL = `${GS_BASE}/wms`;

/* --------------------------------------------------------------------------- */
export async function obtenerCapasWMS() {
  const url = `${WMS_URL}?service=WMS&version=1.3.0&request=GetCapabilities`;
  const xml = new DOMParser().parseFromString(
    await fetch(url).then((r) => r.text()),
    'text/xml'
  );

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
  tolerancePX = 15, // amplia tolerancia
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
    buffer: tolerancePX, // parámetro que GeoServer sí respeta
  });

  return `${WMS_URL}?${p}`;
}
