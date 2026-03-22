// Timeout constants
export const NON_STREAMING_TIMEOUT_MS = 90_000;
export const STREAMING_INACTIVITY_TIMEOUT_MS = 15_000;
export const HARD_CEILING_MS = 120_000;

// Exponential backoff: 2s, 4s, 8s
export const BACKOFF_BASE_MS = 2_000;
export const MAX_RETRIES = 2;

export function createTimeoutController(timeoutMs: number): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    clear: () => clearTimeout(timer),
  };
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label = 'API',
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const { controller, clear } = createTimeoutController(timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      clear();

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`${label} error: ${response.status} ${response.statusText}`);
        if (attempt < MAX_RETRIES - 1) {
          const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      if (!response.ok) {
        throw new Error(`${label} error: ${response.status} ${response.statusText}`);
      }

      return response;
    } catch (err) {
      clear();
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new Error(`${label} timeout after ${timeoutMs}ms`);
      } else if (err instanceof Error) {
        lastError = err;
      } else {
        lastError = new Error('Unknown fetch error');
      }
      if (attempt < MAX_RETRIES - 1) {
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError ?? new Error(`${label} request failed after retries`);
}
