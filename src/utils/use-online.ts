import { useState, useEffect } from 'react';
import { isOnline, onOnlineStatusChange } from './online-status';

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline);

  useEffect(() => {
    const cleanup = onOnlineStatusChange((status) => {
      setOnline(status);
    });
    return cleanup;
  }, []);

  return online;
}
