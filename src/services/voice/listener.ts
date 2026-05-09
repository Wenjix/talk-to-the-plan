import { useTranscriptStore } from '../../store/transcript-store';
import { useSemanticStore } from '../../store/semantic-store';
import { useSessionStore } from '../../store/session-store';
import { useCompanionStore } from '../../store/companion-store';
import { getProviderById } from '../../generation/providers';
import { buildListenerPrompt } from '../../generation/prompts/listener';
import { parseJSON } from '../../core/validation/schema-gates';
import { extractJSON } from '../../generation/streaming';
import { ListenerResponseSchema } from './listener-schema';
import { enqueueIntent, getRecentlySubmittedQuestions } from '../../store/branch-scheduler';
import type { SemanticNode } from '../../core/types';

interface ListenerConfig {
  anthropicKey: string;
  model: string;
  language: 'English' | 'Chinese';
  minFireIntervalMs: number;
  interimIdleMs: number;
  // Hard max time since the last final for which we will keep resetting the
  // idle timer. Forces a fire even if the user is talking continuously with
  // no explicit utterance-end.
  maxDeferralMs: number;
}

let active = false;
let config: ListenerConfig | null = null;
let idleTimer: number | null = null;
let deferralDeadline = 0;
let lastFireAt = 0;
let unsubscribe: (() => void) | null = null;
let isFiring = false;

export function startListener(cfg: ListenerConfig): void {
  if (active) return;
  active = true;
  config = cfg;
  lastFireAt = 0;
  deferralDeadline = 0;

  unsubscribe = useTranscriptStore.subscribe((state, prev) => {
    if (!active || !config) return;

    const finalJustCommitted =
      state.lastFinalAt !== null && state.lastFinalAt !== prev.lastFinalAt;

    if (finalJustCommitted) {
      // A final ends a user thought — fire promptly. This takes priority
      // over any pending interim-idle schedule.
      deferralDeadline = 0;
      scheduleFire(150, /* decisive */ true);
      return;
    }

    if (state.interimText !== prev.interimText) {
      const now = Date.now();
      if (deferralDeadline === 0) {
        deferralDeadline = now + config.maxDeferralMs;
      }

      const timeLeft = deferralDeadline - now;
      if (timeLeft <= 0) {
        // Hard deferral hit — fire now regardless of interim activity.
        scheduleFire(0, true);
      } else {
        scheduleFire(Math.min(config.interimIdleMs, timeLeft));
      }
    }
  });
}

export function stopListener(): void {
  active = false;
  config = null;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (idleTimer !== null) {
    window.clearTimeout(idleTimer);
    idleTimer = null;
  }
  isPendingDecisive = false;
  deferralDeadline = 0;
}

let isPendingDecisive = false;

function scheduleFire(delayMs: number, decisive = false): void {
  if (idleTimer !== null) {
    // If a decisive (post-final) fire is already pending and this is a
    // non-decisive interim update, don't push it out.
    if (!decisive && isPendingDecisive) {
      return;
    }
    window.clearTimeout(idleTimer);
  }
  isPendingDecisive = decisive;
  idleTimer = window.setTimeout(() => {
    idleTimer = null;
    isPendingDecisive = false;
    void maybeFire();
  }, delayMs);
}

const LISTENER_CALL_TIMEOUT_MS = 15_000;

async function maybeFire(): Promise<void> {
  if (!active || !config || isFiring) return;

  const now = Date.now();
  if (now - lastFireAt < config.minFireIntervalMs) {
    scheduleFire(config.minFireIntervalMs - (now - lastFireAt));
    return;
  }

  const transcript = useTranscriptStore.getState().getWindowText(now - 45_000);
  if (transcript.length < 20) return;

  const session = useSessionStore.getState().session;
  if (!session) return;

  const semantic = useSemanticStore.getState();

  // Gate: don't burn a Haiku call before any landable anchor exists. Until
  // the root (or any node) resolves, the scheduler would just retry-and-drop
  // anything we emit. Re-check on each fire so we start producing branches
  // as soon as the first resolved node appears.
  const hasResolvedAnchor = semantic.nodes.some(
    (n) =>
      n.sessionId === session.id &&
      n.fsmState === 'resolved',
  );
  if (!hasResolvedAnchor) {
    // Re-poll shortly without calling the model.
    scheduleFire(800);
    return;
  }

  const focusedNodeId = useCompanionStore.getState().lastFocusedNodeId;
  const focusedNode =
    (focusedNodeId ? semantic.nodes.find((n) => n.id === focusedNodeId) : null) ??
    pickFallbackFocus(semantic.nodes);

  const recentNodes = [...semantic.nodes]
    .filter((n) => n.fsmState === 'resolved' || n.fsmState === 'idle')
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 10)
    .map((n) => ({ id: n.id, question: n.question, pathType: n.pathType }));

  const prompt = buildListenerPrompt({
    topic: session.topic,
    transcriptWindow: transcript,
    focusedNode: focusedNode ?? null,
    recentNodes,
    recentlyCreated: getRecentlySubmittedQuestions(60_000),
    language: config.language,
  });

  isFiring = true;
  lastFireAt = now;
  deferralDeadline = 0;
  useCompanionStore.getState().setListenerActivity('thinking');

  try {
    const provider = getProviderById('anthropic', config.anthropicKey, config.model);

    // Bound the call so a hung provider can't jam the listener forever.
    // Use AbortController pattern for clean cleanup.
    let timeoutId: number | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = window.setTimeout(
        () => reject(new Error('Listener call timed out')),
        LISTENER_CALL_TIMEOUT_MS,
      );
    });

    const raw = await Promise.race([
      provider.generate(prompt),
      timeoutPromise,
    ]);
    // Clean up the timeout if provider won the race
    if (timeoutId !== null) window.clearTimeout(timeoutId);

    const jsonText = extractJSON(raw);
    const jsonResult = parseJSON(jsonText);
    if (!jsonResult.success || !jsonResult.data) {
      return;
    }

    const validated = ListenerResponseSchema.safeParse(jsonResult.data);
    if (!validated.success) {
      return;
    }

    for (const intent of validated.data.intents) {
      if (intent.confidence < 0.6) continue;
      enqueueIntent(intent);
    }
    useCompanionStore.getState().noteListenerFire(validated.data.intents.length);
  } catch (err) {
    // Log transient errors but don't move status to 'error' — a single
    // failed Haiku call shouldn't kill the whole companion session.
    console.warn('[listener] call failed:', err instanceof Error ? err.message : err);
  } finally {
    isFiring = false;
    useCompanionStore.getState().setListenerActivity('idle');
  }
}

function pickFallbackFocus(nodes: SemanticNode[]): SemanticNode | null {
  const resolved = nodes.filter((n) => n.fsmState === 'resolved');
  if (resolved.length > 0) {
    return resolved.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b));
  }
  const root = nodes.find((n) => n.nodeType === 'root');
  return root ?? null;
}

export function __resetListenerForTest(): void {
  stopListener();
  lastFireAt = 0;
  isFiring = false;
  isPendingDecisive = false;
}
