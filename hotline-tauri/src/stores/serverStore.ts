import { create } from 'zustand';
import {
  User,
  ChatMessage,
  PrivateMessage,
  FileItem,
  Transfer,
  NewsCategory,
  BoardPost,
  ServerInfo,
  Permissions,
  ConnectionStatus,
} from '../types';

interface ServerState {
  // Connection state
  serverId: string;
  status: ConnectionStatus;
  serverInfo: ServerInfo | null;
  permissions: Permissions | null;
  error: string | null;

  // Chat
  chatMessages: ChatMessage[];
  privateMessages: Map<number, PrivateMessage[]>;

  // Users
  users: User[];

  // Files
  currentPath: string[];
  files: FileItem[];

  // Transfers
  transfers: Transfer[];

  // News
  newsCategories: NewsCategory[];

  // Message Board
  boardPosts: BoardPost[];

  // Actions
  setStatus: (status: ConnectionStatus) => void;
  setServerInfo: (info: ServerInfo) => void;
  setPermissions: (permissions: Permissions) => void;
  setError: (error: string | null) => void;

  addChatMessage: (message: ChatMessage) => void;
  addPrivateMessage: (userId: number, message: PrivateMessage) => void;

  setUsers: (users: User[]) => void;
  addUser: (user: User) => void;
  removeUser: (userId: number) => void;
  updateUser: (userId: number, user: Partial<User>) => void;

  setCurrentPath: (path: string[]) => void;
  setFiles: (files: FileItem[]) => void;

  addTransfer: (transfer: Transfer) => void;
  updateTransfer: (id: string, transfer: Partial<Transfer>) => void;
  removeTransfer: (id: string) => void;

  setNewsCategories: (categories: NewsCategory[]) => void;
  setBoardPosts: (posts: BoardPost[]) => void;

  reset: () => void;
}

const initialState = {
  status: 'disconnected' as ConnectionStatus,
  serverInfo: null,
  permissions: null,
  error: null,
  chatMessages: [],
  privateMessages: new Map(),
  users: [],
  currentPath: [],
  files: [],
  transfers: [],
  newsCategories: [],
  boardPosts: [],
};

export const createServerStore = (serverId: string) =>
  create<ServerState>((set) => ({
    serverId,
    ...initialState,

    setStatus: (status) => set({ status }),
    setServerInfo: (serverInfo) => set({ serverInfo }),
    setPermissions: (permissions) => set({ permissions }),
    setError: (error) => set({ error }),

    addChatMessage: (message) =>
      set((state) => ({
        chatMessages: [...state.chatMessages, message],
      })),

    addPrivateMessage: (userId, message) =>
      set((state) => {
        const userMessages = state.privateMessages.get(userId) || [];
        const newMap = new Map(state.privateMessages);
        newMap.set(userId, [...userMessages, message]);
        return { privateMessages: newMap };
      }),

    setUsers: (users) => set({ users }),

    addUser: (user) =>
      set((state) => ({
        users: [...state.users, user],
      })),

    removeUser: (userId) =>
      set((state) => ({
        users: state.users.filter((u) => u.id !== userId),
      })),

    updateUser: (userId, user) =>
      set((state) => ({
        users: state.users.map((u) => (u.id === userId ? { ...u, ...user } : u)),
      })),

    setCurrentPath: (currentPath) => set({ currentPath }),
    setFiles: (files) => set({ files }),

    addTransfer: (transfer) =>
      set((state) => ({
        transfers: [...state.transfers, transfer],
      })),

    updateTransfer: (id, transfer) =>
      set((state) => ({
        transfers: state.transfers.map((t) => (t.id === id ? { ...t, ...transfer } : t)),
      })),

    removeTransfer: (id) =>
      set((state) => ({
        transfers: state.transfers.filter((t) => t.id !== id),
      })),

    setNewsCategories: (newsCategories) => set({ newsCategories }),
    setBoardPosts: (boardPosts) => set({ boardPosts }),

    reset: () => set(initialState),
  }));

// Global store to hold references to all server stores
const serverStores = new Map<string, ReturnType<typeof createServerStore>>();

export const useServerStore = (serverId: string) => {
  if (!serverStores.has(serverId)) {
    serverStores.set(serverId, createServerStore(serverId));
  }
  return serverStores.get(serverId)!;
};
