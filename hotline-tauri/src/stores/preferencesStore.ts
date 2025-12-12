import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PreferencesState {
  username: string;
  userIconId: number;
  
  // Actions
  setUsername: (username: string) => void;
  setUserIconId: (iconId: number) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      username: 'guest',
      userIconId: 191, // Default icon from Swift code
      
      setUsername: (username) => set({ username }),
      setUserIconId: (userIconId) => set({ userIconId }),
    }),
    {
      name: 'hotline-preferences',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

