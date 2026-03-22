type OnlineCallback = (isOnline: boolean) => void;
const listeners: Set<OnlineCallback> = new Set();

export function isOnline(): boolean {
  return navigator.onLine;
}

export function onOnlineStatusChange(callback: OnlineCallback): () => void {
  listeners.add(callback);

  const handleOnline = () => { for (const cb of listeners) cb(true); };
  const handleOffline = () => { for (const cb of listeners) cb(false); };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    listeners.delete(callback);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
