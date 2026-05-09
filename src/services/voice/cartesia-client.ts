export class CartesiaAuthError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CartesiaAuthError';
    this.status = status;
  }
}

export const CARTESIA_VERSION = '2026-03-01';

// Security note: in dev, /api/cartesia/* is a Vite proxy that forwards the
// Authorization header (with sk_car_) straight to api.cartesia.ai. In prod,
// api/cartesia/[...path].ts is a Vercel function that does the same — in
// both environments the long-lived key briefly crosses a single trusted hop
// (our own origin) to mint a short-lived access_token that is then used on
// the WebSocket URL. The goal is "key never on the WS URL" which holds in
// both environments; it is NOT a server-side-only key store.
const ACCESS_TOKEN_URL = '/api/cartesia/access-token';

export interface CartesiaAccessToken {
  token: string;
  expiresAt: number; // epoch ms
}

/**
 * Mint a short-lived access token for browser WS STT. The sk_car_ key is
 * passed via Authorization; the proxy forwards it to Cartesia and only the
 * short-lived token is used on the WebSocket URL.
 */
export async function mintStreamingStttToken(
  apiKey: string,
  expiresInSec = 3600,
): Promise<CartesiaAccessToken> {
  const res = await fetch(ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'Cartesia-Version': CARTESIA_VERSION,
    },
    body: JSON.stringify({
      grants: { stt: true },
      expires_in: expiresInSec,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    if (res.status === 401) {
      throw new CartesiaAuthError('Invalid Cartesia API key', 401);
    }
    throw new CartesiaAuthError(`Token mint failed (${res.status}): ${body}`, res.status);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new CartesiaAuthError('Token response missing "token" field');
  }

  return {
    token: data.token,
    // Clamp buffer to at least 1 second to avoid negative expiresAt
    expiresAt: Date.now() + Math.max(1, expiresInSec - 60) * 1000,
  };
}
