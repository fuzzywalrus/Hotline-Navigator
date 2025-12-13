import { useEffect } from 'react';
import { usePreferencesStore, DarkModePreference } from '../stores/preferencesStore';

/**
 * Hook to manage dark mode based on user preference and system settings
 * Applies the 'dark' class to the HTML element when dark mode is active
 */
export function useDarkMode() {
  const darkMode = usePreferencesStore((state) => state.darkMode);

  useEffect(() => {
    const htmlElement = document.documentElement;
    
    // Determine if dark mode should be active
    const shouldBeDark = (() => {
      if (darkMode === 'dark') return true;
      if (darkMode === 'light') return false;
      // 'system' - check system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    })();

    // Apply or remove dark class
    if (shouldBeDark) {
      htmlElement.classList.add('dark');
    } else {
      htmlElement.classList.remove('dark');
    }

    // Listen for system preference changes when mode is 'system'
    if (darkMode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => {
        if (e.matches) {
          htmlElement.classList.add('dark');
        } else {
          htmlElement.classList.remove('dark');
        }
      };

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } else {
        // Fallback for older browsers
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }
  }, [darkMode]);
}
