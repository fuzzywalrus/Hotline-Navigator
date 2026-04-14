import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type DarkModePreference = 'system' | 'light' | 'dark';
export type ChatDisplayMode = 'retro' | 'discord';

interface PreferencesState {
  username: string;
  userIconId: number;
  enablePrivateMessaging: boolean;
  darkMode: DarkModePreference;
  
  // Download preferences
  downloadFolder: string | null;
  setDownloadFolder: (folder: string | null) => void;

  // Banner preferences
  showServerBanner: boolean;
  setShowServerBanner: (enabled: boolean) => void;

  // Link preferences
  clickableLinks: boolean;
  setClickableLinks: (enabled: boolean) => void;
  showInlineImages: boolean;
  setShowInlineImages: (enabled: boolean) => void;

  // Markdown preferences
  renderMarkdown: boolean;
  setRenderMarkdown: (enabled: boolean) => void;
  renderMarkdownAgreements: boolean;
  setRenderMarkdownAgreements: (enabled: boolean) => void;

  // Mention preferences
  mentionPopup: boolean;
  setMentionPopup: (enabled: boolean) => void;
  mutedUsers: string[];
  addMutedUser: (username: string) => void;
  removeMutedUser: (username: string) => void;
  watchWords: string[];
  addWatchWord: (word: string) => void;
  removeWatchWord: (word: string) => void;

  // Icon preferences
  useRemoteIcons: boolean;
  setUseRemoteIcons: (enabled: boolean) => void;
  showRemoteBanners: boolean;
  setShowRemoteBanners: (enabled: boolean) => void;

  // Chat history
  enableChatHistory: boolean;
  setEnableChatHistory: (enabled: boolean) => void;
  showTimestamps: boolean;
  setShowTimestamps: (enabled: boolean) => void;

  // Chat display mode
  chatDisplayMode: ChatDisplayMode;
  setChatDisplayMode: (mode: ChatDisplayMode) => void;

  // Connection preferences
  autoDetectTls: boolean;
  setAutoDetectTls: (enabled: boolean) => void;
  allowLegacyTls: boolean;
  setAllowLegacyTls: (enabled: boolean) => void;

  // Auto-reconnect preferences
  autoReconnect: boolean;
  setAutoReconnect: (enabled: boolean) => void;
  autoReconnectInterval: number;
  setAutoReconnectInterval: (minutes: number) => void;
  autoReconnectMaxRetries: number;
  setAutoReconnectMaxRetries: (retries: number) => void;
  autoReconnectSliding: boolean;
  setAutoReconnectSliding: (enabled: boolean) => void;

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
  setEnablePrivateMessaging: (enabled: boolean) => void;
  setDarkMode: (mode: DarkModePreference) => void;
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
      enablePrivateMessaging: true, // Private messaging enabled by default
      darkMode: 'system', // Default to system preference

      // Download preferences
      downloadFolder: null,
      setDownloadFolder: (downloadFolder) => set({ downloadFolder }),

      // Banner preferences
      showServerBanner: true,
      setShowServerBanner: (showServerBanner) => set({ showServerBanner }),

      // Link preferences
      clickableLinks: true,
      setClickableLinks: (clickableLinks) => set({ clickableLinks }),
      showInlineImages: false,
      setShowInlineImages: (showInlineImages) => set({ showInlineImages }),

      // Markdown preferences
      renderMarkdown: true,
      setRenderMarkdown: (renderMarkdown) => set({ renderMarkdown }),
      renderMarkdownAgreements: false,
      setRenderMarkdownAgreements: (renderMarkdownAgreements) => set({ renderMarkdownAgreements }),

      // Mention preferences
      mentionPopup: true,
      setMentionPopup: (mentionPopup) => set({ mentionPopup }),
      mutedUsers: [],
      addMutedUser: (username) => set((state) => ({
        mutedUsers: state.mutedUsers.includes(username) ? state.mutedUsers : [...state.mutedUsers, username],
      })),
      removeMutedUser: (username) => set((state) => ({
        mutedUsers: state.mutedUsers.filter((u) => u !== username),
      })),
      watchWords: [],
      addWatchWord: (word) => set((state) => ({
        watchWords: state.watchWords.includes(word) ? state.watchWords : [...state.watchWords, word],
      })),
      removeWatchWord: (word) => set((state) => ({
        watchWords: state.watchWords.filter((w) => w !== word),
      })),

      // Icon preferences
      useRemoteIcons: true,
      setUseRemoteIcons: (useRemoteIcons) => set({ useRemoteIcons }),
      showRemoteBanners: true,
      setShowRemoteBanners: (showRemoteBanners) => set({ showRemoteBanners }),

      // Chat history
      enableChatHistory: true,
      setEnableChatHistory: (enableChatHistory) => set({ enableChatHistory }),
      showTimestamps: true,
      setShowTimestamps: (showTimestamps) => set({ showTimestamps }),

      // Chat display mode
      chatDisplayMode: 'discord' as ChatDisplayMode,
      setChatDisplayMode: (chatDisplayMode) => set({ chatDisplayMode }),

      // Connection preferences
      autoDetectTls: false,
      setAutoDetectTls: (autoDetectTls) => set({ autoDetectTls }),
      allowLegacyTls: false,
      setAllowLegacyTls: (allowLegacyTls) => set({ allowLegacyTls }),

      // Auto-reconnect preferences
      autoReconnect: false,
      setAutoReconnect: (autoReconnect) => set({ autoReconnect }),
      autoReconnectInterval: 3,
      setAutoReconnectInterval: (autoReconnectInterval) => set({ autoReconnectInterval: Math.max(1, Math.min(999, autoReconnectInterval)) }),
      autoReconnectMaxRetries: 10,
      setAutoReconnectMaxRetries: (autoReconnectMaxRetries) => set({ autoReconnectMaxRetries: Math.max(1, Math.min(99, autoReconnectMaxRetries)) }),
      autoReconnectSliding: false,
      setAutoReconnectSliding: (autoReconnectSliding) => set({ autoReconnectSliding }),

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
      setEnablePrivateMessaging: (enablePrivateMessaging) => set({ enablePrivateMessaging }),
      setPlaySounds: (playSounds) => set({ playSounds }),
      setPlayChatSound: (playChatSound) => set({ playChatSound }),
      setPlayFileTransferCompleteSound: (playFileTransferCompleteSound) => set({ playFileTransferCompleteSound }),
      setPlayPrivateMessageSound: (playPrivateMessageSound) => set({ playPrivateMessageSound }),
      setPlayJoinSound: (playJoinSound) => set({ playJoinSound }),
      setPlayLeaveSound: (playLeaveSound) => set({ playLeaveSound }),
      setPlayLoggedInSound: (playLoggedInSound) => set({ playLoggedInSound }),
      setPlayErrorSound: (playErrorSound) => set({ playErrorSound }),
      setDarkMode: (darkMode) => set({ darkMode }),
      setPlayServerMessageSound: (playServerMessageSound) => set({ playServerMessageSound }),
      setPlayNewNewsSound: (playNewNewsSound) => set({ playNewNewsSound }),
    }),
    {
      name: 'hotline-preferences',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

