// src/pages/api/wms/capabilities.js
export default async function handler(req, res) {
  try {
    const BASE =
      (process.env.GEOSERVER_BASE || process.env.NEXT_PUBLIC_GEOSERVER_BASE || 'https://geo.sic-di.com/geoserver')
        .replace(/\/+$/, '');

    const url = `${BASE}/wms?service=WMS&version=1.3.0&request=GetCapabilities`;

    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      res.status(502).json({ error: 'GeoServer respondió con error', status: r.status });
      return;
    }

    const xml = await r.text();
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).send(xml);
  } catch (err) {
    res.status(500).json({ error: err?.message || 'fetch failed' });
  }
}
