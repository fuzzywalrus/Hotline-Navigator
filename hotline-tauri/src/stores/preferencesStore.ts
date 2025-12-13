import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface PreferencesState {
  username: string;
  userIconId: number;
  fileCacheDepth: number;
  enablePrivateMessaging: boolean;
  
  // Sound preferences
  playSounds: boolean;
  playChatSound: boolean;
  playFileTransferCompleteSound: boolean;
  playPrivateMessageSound: boolean;
  playJoinSound: boolean;
  playLeaveSound: boolean;
  playLoggedInSound: boolean;
  playErrorSound: boolean;
  playServerMessageSound: boolean;
  playNewNewsSound: boolean;
  
  // Actions
  setUsername: (username: string) => void;
  setUserIconId: (iconId: number) => void;
  setFileCacheDepth: (depth: number) => void;
  setEnablePrivateMessaging: (enabled: boolean) => void;
  setPlaySounds: (enabled: boolean) => void;
  setPlayChatSound: (enabled: boolean) => void;
  setPlayFileTransferCompleteSound: (enabled: boolean) => void;
  setPlayPrivateMessageSound: (enabled: boolean) => void;
  setPlayJoinSound: (enabled: boolean) => void;
  setPlayLeaveSound: (enabled: boolean) => void;
  setPlayLoggedInSound: (enabled: boolean) => void;
  setPlayErrorSound: (enabled: boolean) => void;
  setPlayServerMessageSound: (enabled: boolean) => void;
  setPlayNewNewsSound: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      username: 'guest',
      userIconId: 191, // Default icon from Swift code
      fileCacheDepth: 8, // Default to 8 layers deep
      enablePrivateMessaging: true, // Private messaging enabled by default
      
      // Sound preferences (all enabled by default)
      playSounds: true,
      playChatSound: true,
      playFileTransferCompleteSound: true,
      playPrivateMessageSound: true,
      playJoinSound: true,
      playLeaveSound: true,
      playLoggedInSound: true,
      playErrorSound: true,
      playServerMessageSound: true,
      playNewNewsSound: true,
      
      setUsername: (username) => set({ username }),
      setUserIconId: (userIconId) => set({ userIconId }),
      setFileCacheDepth: (fileCacheDepth) => set({ fileCacheDepth }),
      setEnablePrivateMessaging: (enablePrivateMessaging) => set({ enablePrivateMessaging }),
      setPlaySounds: (playSounds) => set({ playSounds }),
      setPlayChatSound: (playChatSound) => set({ playChatSound }),
      setPlayFileTransferCompleteSound: (playFileTransferCompleteSound) => set({ playFileTransferCompleteSound }),
      setPlayPrivateMessageSound: (playPrivateMessageSound) => set({ playPrivateMessageSound }),
      setPlayJoinSound: (playJoinSound) => set({ playJoinSound }),
      setPlayLeaveSound: (playLeaveSound) => set({ playLeaveSound }),
      setPlayLoggedInSound: (playLoggedInSound) => set({ playLoggedInSound }),
      setPlayErrorSound: (playErrorSound) => set({ playErrorSound }),
      setPlayServerMessageSound: (playServerMessageSound) => set({ playServerMessageSound }),
      setPlayNewNewsSound: (playNewNewsSound) => set({ playNewNewsSound }),
    }),
    {
      name: 'hotline-preferences',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

