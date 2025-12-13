import { create } from 'zustand';
import { Bookmark, TrackerBookmark, Transfer } from '../types';

interface ServerInfo {
  id: string;
  name: string;
  address: string;
  port: number;
}

interface FileItem {
  name: string;
  size: number;
  isFolder: boolean;
  fileType?: string;
  creator?: string;
}

// File cache key is the path joined with '/'
type FileCache = Map<string, FileItem[]>;

interface AppState {
  // Tracker bookmarks
  bookmarks: Bookmark[];
  trackers: TrackerBookmark[];

  // Active servers
  activeServers: string[];
  serverInfo: Map<string, ServerInfo>;
  focusedServer: string | null;

  // File cache per server
  fileCache: Map<string, FileCache>;

  // Transfers
  transfers: Transfer[];

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

  // File cache actions
  setFileCache: (serverId: string, path: string[], files: FileItem[]) => void;
  getFileCache: (serverId: string, path: string[]) => FileItem[] | null;
  clearFileCache: (serverId: string) => void;
  clearFileCachePath: (serverId: string, path: string[]) => void;

  // Transfer actions
  addTransfer: (transfer: Transfer) => void;
  updateTransfer: (id: string, updates: Partial<Transfer>) => void;
  removeTransfer: (id: string) => void;
  clearCompletedTransfers: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  bookmarks: [],
  trackers: [],
  activeServers: [],
  serverInfo: new Map(),
  focusedServer: null,
  showAbout: false,
  showUpdate: false,
  fileCache: new Map(),
  transfers: [],

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

  // File cache actions
  setFileCache: (serverId, path, files) => set((state) => {
    const cache = state.fileCache.get(serverId) || new Map();
    const pathKey = path.join('/');
    cache.set(pathKey, files);
    const newCache = new Map(state.fileCache);
    newCache.set(serverId, cache);
    return { fileCache: newCache };
  }),

  getFileCache: (serverId: string, path: string[]): FileItem[] | null => {
    const cache = useAppStore.getState().fileCache.get(serverId);
    if (!cache) return null;
    const pathKey = path.join('/');
    return cache.get(pathKey) || null;
  },

  clearFileCache: (serverId) => set((state) => {
    const newCache = new Map(state.fileCache);
    newCache.delete(serverId);
    return { fileCache: newCache };
  }),

  clearFileCachePath: (serverId, path) => set((state) => {
    const cache = state.fileCache.get(serverId);
    if (!cache) return state;
    const pathKey = path.join('/');
    const newCache = new Map(cache);
    newCache.delete(pathKey);
    const newFileCache = new Map(state.fileCache);
    newFileCache.set(serverId, newCache);
    return { fileCache: newFileCache };
  }),

  // Transfer actions
  addTransfer: (transfer) => set((state) => ({
    transfers: [...state.transfers, transfer],
  })),

  updateTransfer: (id, updates) => set((state) => ({
    transfers: state.transfers.map((t) =>
      t.id === id ? { ...t, ...updates } : t
    ),
  })),

  removeTransfer: (id) => set((state) => ({
    transfers: state.transfers.filter((t) => t.id !== id),
  })),

  clearCompletedTransfers: () => set((state) => ({
    transfers: state.transfers.filter((t) => t.status === 'active'),
  })),
}));
