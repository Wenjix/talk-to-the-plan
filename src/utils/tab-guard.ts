const TAB_KEY = 'fuda_plan_active_tab';
const HEARTBEAT_INTERVAL = 2000; // ms

let intervalId: ReturnType<typeof setInterval> | null = null;
let tabId: string = '';

export function getTabId(): string {
  return tabId;
}

export function startTabGuard(): { tabId: string; cleanup: () => void } {
  tabId = crypto.randomUUID();

  // Check for existing tab
  const existing = localStorage.getItem(TAB_KEY);
  if (existing) {
    try {
      const parsed: { tabId: string; timestamp: number } = JSON.parse(existing);
      const age = Date.now() - parsed.timestamp;
      if (age < HEARTBEAT_INTERVAL * 3) {
        // Another tab is active
        console.warn('Another FUDA Plan tab is active');
      }
    } catch {
      // Corrupted entry, ignore
    }
  }

  // Start heartbeat
  const beat = () => {
    localStorage.setItem(TAB_KEY, JSON.stringify({ tabId, timestamp: Date.now() }));
  };
  beat();
  intervalId = setInterval(beat, HEARTBEAT_INTERVAL);

  const cleanup = () => {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    const current = localStorage.getItem(TAB_KEY);
    if (current) {
      try {
        const parsed: { tabId: string; timestamp: number } = JSON.parse(current);
        if (parsed.tabId === tabId) {
          localStorage.removeItem(TAB_KEY);
        }
      } catch {
        // Corrupted entry, remove it
        localStorage.removeItem(TAB_KEY);
      }
    }
  };

  return { tabId, cleanup };
}

export function isOtherTabActive(): boolean {
  const existing = localStorage.getItem(TAB_KEY);
  if (!existing) return false;
  try {
    const parsed: { tabId: string; timestamp: number } = JSON.parse(existing);
    if (parsed.tabId === tabId) return false;
    const age = Date.now() - parsed.timestamp;
    return age < HEARTBEAT_INTERVAL * 3;
  } catch {
    return false;
  }
}
