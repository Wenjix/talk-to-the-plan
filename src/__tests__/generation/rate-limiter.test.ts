import { describe, it, expect, vi } from 'vitest'
import {
  TokenBucketRateLimiter,
  ConcurrencyController,
  parseRetryAfter,
} from '../../generation/rate-limiter'

describe('TokenBucketRateLimiter', () => {
  it('starts with burst capacity tokens', () => {
    const limiter = new TokenBucketRateLimiter(12, 3)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
  })

  it('rejects after burst capacity exhausted', () => {
    const limiter = new TokenBucketRateLimiter(12, 3)
    limiter.tryAcquire()
    limiter.tryAcquire()
    limiter.tryAcquire()
    expect(limiter.tryAcquire()).toBe(false)
  })

  it('refills tokens over time', async () => {
    vi.useFakeTimers()
    const limiter = new TokenBucketRateLimiter(12, 3)
    // Exhaust all tokens
    limiter.tryAcquire()
    limiter.tryAcquire()
    limiter.tryAcquire()
    expect(limiter.tryAcquire()).toBe(false)

    // Advance 5s = 1 token at 12 RPM (1 token per 5s)
    vi.advanceTimersByTime(5000)
    expect(limiter.tryAcquire()).toBe(true)
    vi.useRealTimers()
  })

  it('caps tokens at burst capacity', async () => {
    vi.useFakeTimers()
    const limiter = new TokenBucketRateLimiter(12, 3)
    // Wait a long time — should still cap at 3
    vi.advanceTimersByTime(60000)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)
    vi.useRealTimers()
  })

  it('getWaitTime returns 0 when tokens available', () => {
    const limiter = new TokenBucketRateLimiter(12, 3)
    expect(limiter.getWaitTime()).toBe(0)
  })

  it('getWaitTime returns positive value when tokens exhausted', () => {
    const limiter = new TokenBucketRateLimiter(12, 3)
    limiter.tryAcquire()
    limiter.tryAcquire()
    limiter.tryAcquire()
    expect(limiter.getWaitTime()).toBeGreaterThan(0)
  })

  it('acquire resolves when token becomes available', async () => {
    vi.useFakeTimers()
    const limiter = new TokenBucketRateLimiter(12, 1)
    limiter.tryAcquire() // exhaust the single token

    const acquirePromise = limiter.acquire()

    // Advance time to refill
    vi.advanceTimersByTime(5100)

    await acquirePromise // should resolve
    vi.useRealTimers()
  })
})

describe('ConcurrencyController', () => {
  it('allows up to maxConcurrent slots', async () => {
    const controller = new ConcurrencyController(2)
    await controller.acquire()
    await controller.acquire()
    expect(controller.getRunning()).toBe(2)
  })

  it('queues when at capacity', async () => {
    const controller = new ConcurrencyController(2)
    await controller.acquire()
    await controller.acquire()

    let resolved = false
    const pending = controller.acquire().then(() => {
      resolved = true
    })

    // Should not resolve immediately
    await new Promise((r) => setTimeout(r, 10))
    expect(resolved).toBe(false)

    // Release a slot
    controller.release()
    await pending
    expect(resolved).toBe(true)
    expect(controller.getRunning()).toBe(2)
  })

  it('release decrements running count', async () => {
    const controller = new ConcurrencyController(2)
    await controller.acquire()
    expect(controller.getRunning()).toBe(1)
    controller.release()
    expect(controller.getRunning()).toBe(0)
  })

  it('isAvailable returns true when below capacity', async () => {
    const controller = new ConcurrencyController(2)
    expect(controller.isAvailable()).toBe(true)
    await controller.acquire()
    expect(controller.isAvailable()).toBe(true)
    await controller.acquire()
    expect(controller.isAvailable()).toBe(false)
  })

  it('processes queue in FIFO order', async () => {
    const controller = new ConcurrencyController(1)
    await controller.acquire()

    const order: number[] = []
    const p1 = controller.acquire().then(() => order.push(1))
    const p2 = controller.acquire().then(() => order.push(2))

    controller.release()
    await p1
    controller.release()
    await p2

    expect(order).toEqual([1, 2])
  })
})

describe('parseRetryAfter', () => {
  it('parses integer seconds', () => {
    expect(parseRetryAfter('15')).toBe(15000)
  })

  it('parses zero seconds', () => {
    expect(parseRetryAfter('0')).toBe(0)
  })

  it('returns default for invalid value', () => {
    expect(parseRetryAfter('not-a-number')).toBe(5000)
  })

  it('parses HTTP-date format', () => {
    const futureDate = new Date(Date.now() + 10000).toUTCString()
    const result = parseRetryAfter(futureDate)
    // Should be approximately 10000ms (±1000ms for test timing)
    expect(result).toBeGreaterThan(8000)
    expect(result).toBeLessThan(12000)
  })

  it('returns 0 for past HTTP-date', () => {
    const pastDate = new Date(Date.now() - 10000).toUTCString()
    expect(parseRetryAfter(pastDate)).toBe(0)
  })
})
