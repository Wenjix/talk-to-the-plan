/**
 * Token bucket rate limiter for API calls.
 * - 12 requests per minute (1 token every 5 seconds)
 * - Burst capacity of 3 (can send 3 rapid requests if tokens available)
 */
export class TokenBucketRateLimiter {
  private tokens: number;
  private maxTokens: number;
  private refillRate: number; // tokens per ms
  private lastRefill: number;

  constructor(maxRPM: number = 12, burstCapacity: number = 3) {
    this.maxTokens = burstCapacity;
    this.tokens = burstCapacity;
    this.refillRate = maxRPM / 60000; // tokens per ms
    this.lastRefill = Date.now();
  }

  /** Refill tokens based on elapsed time */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(
      this.maxTokens,
      this.tokens + elapsed * this.refillRate,
    );
    this.lastRefill = now;
  }

  /** Try to consume a token. Returns true if allowed. */
  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Wait until a token is available, then consume it. */
  async acquire(): Promise<void> {
    while (!this.tryAcquire()) {
      // Calculate wait time for next token
      const waitMs = Math.ceil((1 - this.tokens) / this.refillRate);
      await new Promise((r) => setTimeout(r, Math.min(waitMs, 1000)));
    }
  }

  /** Get estimated wait time in ms for next available token */
  getWaitTime(): number {
    this.refill();
    if (this.tokens >= 1) return 0;
    return Math.ceil((1 - this.tokens) / this.refillRate);
  }
}

/**
 * Concurrency controller -- limits how many jobs can run simultaneously.
 */
export class ConcurrencyController {
  private running: number;
  private maxConcurrent: number;
  private waitQueue: Array<() => void>;

  constructor(maxConcurrent: number = 2) {
    this.running = 0;
    this.maxConcurrent = maxConcurrent;
    this.waitQueue = [];
  }

  /** Acquire a slot. Resolves when a slot is available. */
  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
    this.running++;
  }

  /** Release a slot. */
  release(): void {
    this.running--;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  /** Get current running count */
  getRunning(): number {
    return this.running;
  }

  /** Check if a slot is available without consuming it */
  isAvailable(): boolean {
    return this.running < this.maxConcurrent;
  }
}

/**
 * Parse Retry-After header value.
 * Supports both seconds (integer) and HTTP-date formats.
 * Returns wait time in milliseconds.
 */
export function parseRetryAfter(headerValue: string): number {
  // Try parsing as seconds (integer)
  const seconds = parseInt(headerValue, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP-date
  const date = new Date(headerValue);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  // Default: 5 second backoff
  return 5000;
}

/**
 * Handle HTTP 429 response: extract wait time and delay.
 */
export async function handleRateLimit(response: Response): Promise<number> {
  const retryAfter = response.headers.get("Retry-After");
  const waitMs = retryAfter ? parseRetryAfter(retryAfter) : 5000;
  await new Promise((r) => setTimeout(r, waitMs));
  return waitMs;
}

// Singleton instances — burst=4 and maxConcurrent=4 to support 4-lane quadrant burst
export const rateLimiter = new TokenBucketRateLimiter(12, 4);
export const concurrencyController = new ConcurrencyController(4);

/** Reset singletons for testing — refills rate limiter tokens to max. */
export function resetForTesting(): void {
  (rateLimiter as unknown as { tokens: number; lastRefill: number }).tokens = 4;
  (rateLimiter as unknown as { lastRefill: number }).lastRefill = Date.now();
}
