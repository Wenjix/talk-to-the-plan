import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';

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
    upstream.headers.forEach((value, key) => {
      // Skip headers that Node sets automatically or that would confuse the client
      if (key === 'content-encoding' || key === 'content-length' || key === 'transfer-encoding') return;
      res.setHeader(key, value);
    });

    if (upstream.body) {
      // Pipe the upstream web ReadableStream to the Node response to preserve SSE streaming
      Readable.fromWeb(upstream.body as WebReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Proxy error' });
  }
}
