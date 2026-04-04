import type { VercelRequest, VercelResponse } from '@vercel/node';

const TARGET = 'https://api.mistral.ai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path ?? '';
  const url = `${TARGET}/${path}`;

  const headers: Record<string, string> = { 'Content-Type': req.headers['content-type'] ?? 'application/json' };
  if (req.headers.authorization) headers['Authorization'] = req.headers.authorization;

  try {
    const upstream = await fetch(url, {
      method: req.method ?? 'POST',
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });

    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const body = await upstream.arrayBuffer();
    res.send(Buffer.from(body));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Proxy error' });
  }
}
