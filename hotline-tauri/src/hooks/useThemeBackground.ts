import { useEffect, useState } from 'react';
import { usePreferencesStore } from '../stores/preferencesStore';

// Match the values in App.css (html / body / #root background colors).
const LIGHT_BG = '#f3f4f6'; // Tailwind gray-100
const DARK_BG = '#111827';  // Tailwind gray-900

function resolveSystemDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Returns the current theme background hex, mirroring the resolution logic in
 * useDarkMode (system preference falls through to OS). Tracks system changes
 * when the user has selected 'system' so the value reflows on OS theme toggle.
 */
export function useThemeBackground(): string {
  const darkMode = usePreferencesStore((s) => s.darkMode);
  const [systemDark, setSystemDark] = useState<boolean>(resolveSystemDark);

  useEffect(() => {
    if (darkMode !== 'system') return;
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handle = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', handle);
      return () => mq.removeEventListener('change', handle);
    }
    mq.addListener(handle);
    return () => mq.removeListener(handle);
  }, [darkMode]);

  const isDark = darkMode === 'dark' || (darkMode === 'system' && systemDark);
  return isDark ? DARK_BG : LIGHT_BG;
}
