import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Quota management tests
// ---------------------------------------------------------------------------

import {
  checkStorageQuota,
  isNearQuota,
  isQuotaExceeded,
  formatBytes,
} from '../../persistence/quota';
import type { QuotaInfo } from '../../persistence/quota';

describe('Quota management', () => {
  it('checkStorageQuota returns QuotaInfo shape', async () => {
    const info = await checkStorageQuota();
    expect(info).toHaveProperty('used');
    expect(info).toHaveProperty('quota');
    expect(info).toHaveProperty('percentage');
    expect(typeof info.used).toBe('number');
    expect(typeof info.quota).toBe('number');
    expect(typeof info.percentage).toBe('number');
  });

  it('isNearQuota returns true when usage exceeds 50MB', () => {
    const info: QuotaInfo = { used: 60 * 1024 * 1024, quota: 200 * 1024 * 1024, percentage: 30 };
    expect(isNearQuota(info)).toBe(true);
  });

  it('isNearQuota returns false when usage is below 50MB', () => {
    const info: QuotaInfo = { used: 10 * 1024 * 1024, quota: 200 * 1024 * 1024, percentage: 5 };
    expect(isNearQuota(info)).toBe(false);
  });

  it('isQuotaExceeded returns true when percentage >= 95', () => {
    const info: QuotaInfo = { used: 190 * 1024 * 1024, quota: 200 * 1024 * 1024, percentage: 95 };
    expect(isQuotaExceeded(info)).toBe(true);
  });

  it('isQuotaExceeded returns false when percentage < 95', () => {
    const info: QuotaInfo = { used: 100 * 1024 * 1024, quota: 200 * 1024 * 1024, percentage: 50 };
    expect(isQuotaExceeded(info)).toBe(false);
  });

  it('formatBytes formats bytes correctly', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formatBytes formats KB correctly', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formatBytes formats MB correctly', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});

// ---------------------------------------------------------------------------
// 2. Online status tests
// ---------------------------------------------------------------------------

import { isOnline, onOnlineStatusChange } from '../../utils/online-status';

describe('Online status', () => {
  it('isOnline returns navigator.onLine value', () => {
    // jsdom defaults navigator.onLine to true
    expect(isOnline()).toBe(navigator.onLine);
  });

  it('onOnlineStatusChange callback fires on online event', () => {
    const callback = vi.fn();
    const cleanup = onOnlineStatusChange(callback);

    window.dispatchEvent(new Event('online'));
    expect(callback).toHaveBeenCalledWith(true);

    cleanup();
  });

  it('onOnlineStatusChange callback fires on offline event', () => {
    const callback = vi.fn();
    const cleanup = onOnlineStatusChange(callback);

    window.dispatchEvent(new Event('offline'));
    expect(callback).toHaveBeenCalledWith(false);

    cleanup();
  });

  it('cleanup removes listeners so callback no longer fires', () => {
    const callback = vi.fn();
    const cleanup = onOnlineStatusChange(callback);
    cleanup();

    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('offline'));
    // The callback should not have been called after cleanup
    expect(callback).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Tab guard tests
// ---------------------------------------------------------------------------

import { startTabGuard, isOtherTabActive } from '../../utils/tab-guard';

describe('Tab guard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('startTabGuard sets localStorage entry', () => {
    const { cleanup } = startTabGuard();
    const stored = localStorage.getItem('fuda_plan_active_tab');
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed).toHaveProperty('tabId');
    expect(parsed).toHaveProperty('timestamp');
    cleanup();
  });

  it('isOtherTabActive returns false for the current tab', () => {
    const { cleanup } = startTabGuard();
    expect(isOtherTabActive()).toBe(false);
    cleanup();
  });

  it('isOtherTabActive returns true when a different tab wrote a recent heartbeat', () => {
    // Simulate another tab's heartbeat
    localStorage.setItem(
      'fuda_plan_active_tab',
      JSON.stringify({ tabId: 'other-tab-id', timestamp: Date.now() }),
    );
    // Start our own tab guard (which will overwrite) — but first check
    // before starting our own guard, the other tab is detected
    expect(isOtherTabActive()).toBe(true);
  });

  it('cleanup removes localStorage entry when owned by same tab', () => {
    const { cleanup } = startTabGuard();
    expect(localStorage.getItem('fuda_plan_active_tab')).not.toBeNull();
    cleanup();
    expect(localStorage.getItem('fuda_plan_active_tab')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Demo provider tests
// ---------------------------------------------------------------------------

import { DemoProvider } from '../../generation/providers/demo-provider';

describe('DemoProvider', () => {
  const provider = new DemoProvider();

  it('generate returns valid JSON for an answer prompt', async () => {
    const result = await provider.generate('Tell me about this topic');
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.summary).toBeTruthy();
    expect(Array.isArray(parsed.bullets)).toBe(true);
    expect(parsed.bullets.length).toBeGreaterThan(0);
  });

  it('generate returns valid JSON for a branch prompt', async () => {
    const result = await provider.generate('Generate follow-up questions to branch from this');
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed.branches).toBeDefined();
    expect(Array.isArray(parsed.branches)).toBe(true);
    expect(parsed.branches.length).toBeGreaterThan(0);
    expect(parsed.branches[0]).toHaveProperty('question');
    expect(parsed.branches[0]).toHaveProperty('pathType');
    expect(parsed.branches[0]).toHaveProperty('quality');
  });

  it('generate returns valid JSON for path_questions prompt', async () => {
    const result = await provider.generate('Generate path_questions for the Conversation Compass');
    const parsed = JSON.parse(result);
    expect(parsed.paths).toBeDefined();
    expect(parsed.paths['clarify']).toBeDefined();
    expect(parsed.paths['go-deeper']).toBeDefined();
    expect(parsed.paths['challenge']).toBeDefined();
    expect(parsed.paths['apply']).toBeDefined();
    expect(parsed.paths['connect']).toBeDefined();
    expect(parsed.paths['surprise']).toBeDefined();
  });

  it('generate returns valid JSON for dialogue_turn prompt', async () => {
    const result = await provider.generate('Generate a dialogue_turn response');
    const parsed = JSON.parse(result);
    expect(parsed.content).toBeTruthy();
    expect(parsed.turnType).toBeTruthy();
    expect(Array.isArray(parsed.suggestedResponses)).toBe(true);
  });

  it('generateStream calls onChunk multiple times', async () => {
    const chunks: string[] = [];
    const result = await provider.generateStream('test prompt', (delta) => chunks.push(delta));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(result);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('response content varies based on prompt content', async () => {
    const answerResult = await provider.generate('Tell me about this topic');
    const branchResult = await provider.generate('Generate follow-up questions to branch');
    expect(answerResult).not.toBe(branchResult);
  });
});
