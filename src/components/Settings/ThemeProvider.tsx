import { useEffect, useState } from 'react';
import { loadSettings } from '../../persistence/settings-store.ts';
import type { Theme } from '../../persistence/settings-store.ts';
import './theme.css';

export function useTheme(): void {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    let cancelled = false;
    loadSettings().then((s) => {
      if (!cancelled) setTheme(s.theme);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [theme]);
}
