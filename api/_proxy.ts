import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import type { ReadableStream as WebReadableStream } from 'stream/web';

// Headers that should never be forwarded from upstream to client
const BLOCKED_RESPONSE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'set-cookie',
  'strict-transport-security',
  'x-frame-options',
]);

export interface ProxyConfig {
  target: string;
  /** Headers to forward from the client request (e.g. 'authorization', 'x-api-key') */
  forwardHeaders: string[];
  /** Additional headers to add to the upstream request */
  extraHeaders?: Record<string, string>;
}

export async function proxyRequest(
  req: VercelRequest,
  res: VercelResponse,
  config: ProxyConfig,
): Promise<void> {
  const path = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path ?? '';

  // Prevent path traversal: reject paths with '..' segments
  const normalizedPath = path.replace(/\/+/g, '/');
  if (normalizedPath.includes('..')) {
    res.status(400).json({ error: 'Invalid path' });
    return;
  }

  // Preserve query string
  const search = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const url = `${config.target}/${normalizedPath}${search}`;

  // Build headers: forward only allowed headers
  const headers: Record<string, string> = {};
  const contentType = req.headers['content-type'] ?? 'application/json';
  headers['Content-Type'] = contentType;

  for (const headerName of config.forwardHeaders) {
    const value = req.headers[headerName];
    if (value) {
      // HTTP/2 normalizes header names to lowercase and HTTP/1.1 treats them
      // as case-insensitive (RFC 7230 §3.2). Pass through lowercase to avoid
      // the misleading half-capitalization (`X-api-key`) of the previous code.
      headers[headerName.toLowerCase()] = typeof value === 'string' ? value : value[0];
    }
  }

  if (config.extraHeaders) {
    Object.assign(headers, config.extraHeaders);
  }

  // Handle body: respect content-type
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let body: string | Buffer | undefined;
  if (hasBody) {
    if (contentType.includes('application/json')) {
      body = JSON.stringify(req.body);
    } else if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      body = req.body;
    } else {
      body = JSON.stringify(req.body);
    }
  }

  try {
    const upstream = await fetch(url, {
      method: req.method ?? 'POST',
      headers,
      body,
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (BLOCKED_RESPONSE_HEADERS.has(key)) return;
      res.setHeader(key, value);
    });

    if (upstream.body) {
      const stream = Readable.fromWeb(upstream.body as WebReadableStream<Uint8Array>);
      stream.on('error', () => {
        if (!res.headersSent) {
          res.status(502).json({ error: 'Upstream stream error' });
        } else {
          res.end();
        }
      });
      stream.pipe(res);
    } else {
      res.end();
    }
  } catch {
    res.status(502).json({ error: 'Proxy error' });
  }
}
