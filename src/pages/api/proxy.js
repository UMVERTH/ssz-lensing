// src/pages/api/proxy.js
export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    // (Opcional) restringe dominios permitidos
    const u = new URL(url);
    const allowed = ['exp.sic-di.com'];
    if (!allowed.includes(u.hostname)) return res.status(403).json({ error: 'Forbidden host' });

    const r = await fetch(url, { method: 'GET' });
    const ct = r.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.status(r.status);
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: 'Proxy failed' });
  }
}
