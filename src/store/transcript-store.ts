import { create } from 'zustand';

export interface TranscriptSegment {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  committedAt: number;
}

const WINDOW_MS = 90_000;

interface TranscriptState {
  segments: TranscriptSegment[];
  interimText: string;
  sessionStartedAt: number | null;
  lastFinalAt: number | null;
  appendInterim(text: string): void;
  commitFinal(segment: Omit<TranscriptSegment, 'id' | 'committedAt'>): TranscriptSegment;
  getWindowText(sinceMs?: number): string;
  getSegmentsSince(sinceMs: number): TranscriptSegment[];
  clear(): void;
  start(): void;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `t${Date.now().toString(36)}${counter.toString(36)}`;
}

export const useTranscriptStore = create<TranscriptState>()((set, get) => ({
  segments: [],
  interimText: '',
  sessionStartedAt: null,
  lastFinalAt: null,

  appendInterim: (text) => {
    // Suppress no-op updates so listener subscribers don't re-debounce on
    // identical interim re-sends from the STT layer.
    if (text === get().interimText) return;
    set({ interimText: text });
  },

  commitFinal: (segment) => {
    const committed: TranscriptSegment = {
      ...segment,
      id: nextId(),
      committedAt: Date.now(),
    };
    const cutoff = Date.now() - WINDOW_MS;
    const kept = get().segments.filter((s) => s.committedAt >= cutoff);
    set({
      segments: [...kept, committed],
      interimText: '',
      lastFinalAt: committed.committedAt,
    });
    return committed;
  },

  getWindowText: (sinceMs) => {
    const threshold = sinceMs ?? Date.now() - WINDOW_MS;
    const parts = get().segments
      .filter((s) => s.committedAt >= threshold)
      .map((s) => s.text.trim())
      .filter(Boolean);
    const interim = get().interimText.trim();
    if (interim) parts.push(`(…${interim})`);
    return parts.join(' ');
  },

  getSegmentsSince: (sinceMs) =>
    get().segments.filter((s) => s.committedAt >= sinceMs),

  clear: () => set({ segments: [], interimText: '', lastFinalAt: null }),

  start: () => set({
    segments: [],
    interimText: '',
    sessionStartedAt: Date.now(),
    lastFinalAt: null,
  }),
}));

export const TRANSCRIPT_WINDOW_MS = WINDOW_MS;
