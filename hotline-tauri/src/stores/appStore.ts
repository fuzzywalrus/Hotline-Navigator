import { create } from 'zustand';
import { Bookmark, TrackerBookmark } from '../types';

interface ServerInfo {
  id: string;
  name: string;
  address: string;
  port: number;
}

interface AppState {
  // Tracker bookmarks
  bookmarks: Bookmark[];
  trackers: TrackerBookmark[];

  // Active servers
  activeServers: string[];
  serverInfo: Map<string, ServerInfo>;
  focusedServer: string | null;

  // UI state
  showAbout: boolean;
  showUpdate: boolean;

  // Actions
  addBookmark: (bookmark: Bookmark) => void;
  setBookmarks: (bookmarks: Bookmark[]) => void;
  removeBookmark: (id: string) => void;
  updateBookmark: (id: string, bookmark: Partial<Bookmark>) => void;

  addTracker: (tracker: TrackerBookmark) => void;
  removeTracker: (id: string) => void;

  setFocusedServer: (serverId: string | null) => void;
  addActiveServer: (serverId: string, info: ServerInfo) => void;
  removeActiveServer: (serverId: string) => void;

  setShowAbout: (show: boolean) => void;
  setShowUpdate: (show: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  bookmarks: [],
  trackers: [],
  activeServers: [],
  serverInfo: new Map(),
  focusedServer: null,
  showAbout: false,
  showUpdate: false,

  addBookmark: (bookmark) => set((state) => {
    // Check if bookmark already exists to prevent duplicates
    if (state.bookmarks.some((b) => b.id === bookmark.id)) {
      return state;
    }
    return {
      bookmarks: [...state.bookmarks, bookmark],
    };
  }),

  setBookmarks: (bookmarks) => set({ bookmarks }),

  removeBookmark: (id) => set((state) => ({
    bookmarks: state.bookmarks.filter((b) => b.id !== id),
  })),

  updateBookmark: (id, bookmark) => set((state) => ({
    bookmarks: state.bookmarks.map((b) =>
      b.id === id ? { ...b, ...bookmark } : b
    ),
  })),

  addTracker: (tracker) => set((state) => ({
    trackers: [...state.trackers, tracker],
  })),

  removeTracker: (id) => set((state) => ({
    trackers: state.trackers.filter((t) => t.id !== id),
  })),

  setFocusedServer: (serverId) => set({ focusedServer: serverId }),

  addActiveServer: (serverId, info) => set((state) => {
    const newServerInfo = new Map(state.serverInfo);
    newServerInfo.set(serverId, info);
    return {
      activeServers: [...state.activeServers, serverId],
      serverInfo: newServerInfo,
    };
  }),

  removeActiveServer: (serverId) => set((state) => {
    const newServerInfo = new Map(state.serverInfo);
    newServerInfo.delete(serverId);
    return {
      activeServers: state.activeServers.filter((id) => id !== serverId),
      serverInfo: newServerInfo,
    };
  }),

  setShowAbout: (show) => set({ showAbout: show }),
  setShowUpdate: (show) => set({ showUpdate: show }),
}));
