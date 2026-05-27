import { describe, it, expect, beforeEach } from 'vitest';
import { useTranscriptStore, TRANSCRIPT_WINDOW_MS } from '../../store/transcript-store';

beforeEach(() => {
  useTranscriptStore.getState().clear();
});

describe('transcript-store', () => {
  it('appends interim text and overwrites on each update', () => {
    const s = useTranscriptStore.getState();
    s.appendInterim('hello');
    expect(useTranscriptStore.getState().interimText).toBe('hello');
    s.appendInterim('hello world');
    expect(useTranscriptStore.getState().interimText).toBe('hello world');
  });

  it('clears interim on commitFinal and records segment with lastFinalAt', () => {
    const s = useTranscriptStore.getState();
    s.appendInterim('pending speech');
    const committed = s.commitFinal({ text: 'pending speech', startMs: 0, endMs: 1200 });
    const state = useTranscriptStore.getState();
    expect(state.interimText).toBe('');
    expect(state.segments).toHaveLength(1);
    expect(state.segments[0].text).toBe('pending speech');
    expect(state.lastFinalAt).toBe(committed.committedAt);
    expect(committed.id).toBeTruthy();
  });

  it('prunes segments older than window on each commit', () => {
    const s = useTranscriptStore.getState();
    const stale = s.commitFinal({ text: 'stale', startMs: 0, endMs: 100 });
    // backdate it beyond the window
    useTranscriptStore.setState({
      segments: [{ ...stale, committedAt: Date.now() - (TRANSCRIPT_WINDOW_MS + 1000) }],
    });
    s.commitFinal({ text: 'fresh', startMs: 0, endMs: 100 });
    const kept = useTranscriptStore.getState().segments;
    expect(kept.map((x) => x.text)).toEqual(['fresh']);
  });

  it('getWindowText composes finals plus interim in parenthetical tail', () => {
    const s = useTranscriptStore.getState();
    s.commitFinal({ text: 'First thought.', startMs: 0, endMs: 1000 });
    s.commitFinal({ text: 'Second idea.', startMs: 1000, endMs: 2000 });
    s.appendInterim('mid sentence');
    const windowText = s.getWindowText(Date.now() - 60_000);
    expect(windowText).toContain('First thought.');
    expect(windowText).toContain('Second idea.');
    expect(windowText).toContain('(…mid sentence)');
  });

  it('start resets segments, interim and lastFinalAt', () => {
    const s = useTranscriptStore.getState();
    s.commitFinal({ text: 'before', startMs: 0, endMs: 100 });
    s.appendInterim('dangling');
    s.start();
    const after = useTranscriptStore.getState();
    expect(after.segments).toHaveLength(0);
    expect(after.interimText).toBe('');
    expect(after.lastFinalAt).toBeNull();
    expect(after.sessionStartedAt).not.toBeNull();
  });
});
