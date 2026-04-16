import { create } from 'zustand';
import { Stronghold } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';
import type { StoredChatMessage } from '../components/server/serverTypes';
import { log, error as logError } from '../utils/logger';

const MAX_MESSAGES_PER_SERVER = 1000;
const SAVE_DEBOUNCE_MS = 2000;
const META_KEY = '__meta';

interface ChatHistoryMeta {
  serverName: string;
  messageCount: number;
  lastUpdated: string;
}

interface ChatHistoryState {
  // Whether the vault is unlocked and ready
  unlocked: boolean;
  // In-memory message cache
  messages: Map<string, StoredChatMessage[]>;
  // Track which servers have been loaded from disk
  loaded: Set<string>;
  // Actions
  unlock: (passphrase: string) => Promise<boolean>;
  lock: () => void;
  addMessage: (serverId: string, serverName: string, msg: StoredChatMessage) => void;
  loadHistory: (serverId: string) => Promise<StoredChatMessage[]>;
  getServersWithHistory: () => Promise<Record<string, ChatHistoryMeta>>;
  clearHistory: (serverId: string) => Promise<void>;
  clearAllHistory: () => Promise<void>;
  flushPending: () => Promise<void>;
}

// --- Stronghold helpers ---

let strongholdInstance: Stronghold | null = null;
let strongholdInitPromise: Promise<Stronghold> | null = null;

async function initStronghold(passphrase: string): Promise<Stronghold> {
  // Reset if re-initializing with new passphrase
  strongholdInstance = null;
  strongholdInitPromise = null;

  strongholdInitPromise = (async () => {
    const dir = await appDataDir();
    const path = `${dir}/chat-history.hold`;
    log('Chat', 'Initializing chat history vault', path);
    const sh = await Stronghold.load(path, passphrase);
    strongholdInstance = sh;
    log('Chat', 'Chat history vault ready');
    return sh;
  })();

  return strongholdInitPromise;
}

function getStronghold(): Stronghold {
  if (!strongholdInstance) throw new Error('Chat history vault is locked');
  return strongholdInstance;
}

async function getStore() {
  const sh = getStronghold();
  let client;
  try {
    client = await sh.loadClient('chat');
  } catch {
    client = await sh.createClient('chat');
  }
  return client.getStore();
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBytes(data: string): number[] {
  return Array.from(encoder.encode(data));
}

async function storeGet(key: string): Promise<string | null> {
  try {
    const store = await getStore();
    const data = await store.get(key);
    if (!data) return null;
    return decoder.decode(data);
  } catch {
    return null;
  }
}

async function storeSet(key: string, value: string): Promise<void> {
  const store = await getStore();
  await store.insert(key, toBytes(value));
}

async function storeRemove(key: string): Promise<void> {
  const store = await getStore();
  await store.remove(key);
}

async function strongholdSave(): Promise<void> {
  const sh = getStronghold();
  await sh.save();
}

// --- Meta helpers ---

async function loadMeta(): Promise<Record<string, ChatHistoryMeta>> {
  const raw = await storeGet(META_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function saveMeta(meta: Record<string, ChatHistoryMeta>): Promise<void> {
  await storeSet(META_KEY, JSON.stringify(meta));
}

// --- Debounce tracking ---

const pendingSaves = new Map<string, { serverName: string; timer: ReturnType<typeof setTimeout> }>();

function debouncedSave(serverId: string, serverName: string, messages: StoredChatMessage[]) {
  const existing = pendingSaves.get(serverId);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(async () => {
    pendingSaves.delete(serverId);
    try {
      await storeSet(`history:${serverId}`, JSON.stringify(messages));
      const meta = await loadMeta();
      meta[serverId] = {
        serverName,
        messageCount: messages.length,
        lastUpdated: new Date().toISOString(),
      };
      await saveMeta(meta);
      await strongholdSave();
      log('Chat', `History saved for ${serverName}`, { count: messages.length });
    } catch (e) {
      logError('Chat', 'History save failed', e);
    }
  }, SAVE_DEBOUNCE_MS);

  pendingSaves.set(serverId, { serverName, timer });
}

// --- Store ---

export const useChatHistoryStore = create<ChatHistoryState>((set, get) => ({
  unlocked: false,
  messages: new Map(),
  loaded: new Set(),

  unlock: async (passphrase: string) => {
    try {
      await initStronghold(passphrase);
      // Verify we can actually access the store (wrong passphrase throws)
      await getStore();
      set({ unlocked: true });
      return true;
    } catch (e) {
      logError('Chat', 'Failed to unlock vault', e);
      strongholdInstance = null;
      strongholdInitPromise = null;
      set({ unlocked: false });
      return false;
    }
  },

  lock: () => {
    // Cancel pending saves
    for (const [, { timer }] of pendingSaves) clearTimeout(timer);
    pendingSaves.clear();
    strongholdInstance = null;
    strongholdInitPromise = null;
    set({ unlocked: false, messages: new Map(), loaded: new Set() });
  },

  addMessage: (serverId, serverName, msg) => {
    if (!get().unlocked) return; // Silently skip if vault is locked

    const { messages } = get();
    const existing = messages.get(serverId) || [];
    const updated = [...existing, msg];
    // Trim to max
    const trimmed = updated.length > MAX_MESSAGES_PER_SERVER
      ? updated.slice(updated.length - MAX_MESSAGES_PER_SERVER)
      : updated;

    const next = new Map(messages);
    next.set(serverId, trimmed);
    set({ messages: next });

    debouncedSave(serverId, serverName, trimmed);
  },

  loadHistory: async (serverId) => {
    if (!get().unlocked) return [];

    const { loaded, messages } = get();
    if (loaded.has(serverId)) {
      log('Chat', 'History already loaded (cached)', serverId);
      return messages.get(serverId) || [];
    }

    log('Chat', 'Loading history from vault', serverId);
    try {
      const raw = await storeGet(`history:${serverId}`);
      if (raw) {
        const parsed: StoredChatMessage[] = JSON.parse(raw);
        log('Chat', `Loaded ${parsed.length} messages from history`, serverId);
        const next = new Map(get().messages);
        next.set(serverId, parsed);
        const nextLoaded = new Set(get().loaded);
        nextLoaded.add(serverId);
        set({ messages: next, loaded: nextLoaded });
        return parsed;
      }
      log('Chat', 'No history found for server', serverId);
    } catch (e) {
      logError('Chat', 'History load failed', e);
    }

    // Mark as loaded even if empty
    const nextLoaded = new Set(get().loaded);
    nextLoaded.add(serverId);
    set({ loaded: nextLoaded });
    return [];
  },

  getServersWithHistory: async () => {
    if (!get().unlocked) return {};
    return loadMeta();
  },

  clearHistory: async (serverId) => {
    log('Chat', 'Clearing history for server', serverId);
    // Cancel pending save
    const pending = pendingSaves.get(serverId);
    if (pending) {
      clearTimeout(pending.timer);
      pendingSaves.delete(serverId);
    }

    try {
      await storeRemove(`history:${serverId}`);
      const meta = await loadMeta();
      delete meta[serverId];
      await saveMeta(meta);
      await strongholdSave();
      log('Chat', 'History cleared for server', serverId);
    } catch (e) {
      logError('Chat', 'History clear failed', e);
    }

    const next = new Map(get().messages);
    next.delete(serverId);
    const nextLoaded = new Set(get().loaded);
    nextLoaded.delete(serverId);
    set({ messages: next, loaded: nextLoaded });
  },

  clearAllHistory: async () => {
    log('Chat', 'Clearing all chat history');
    // Cancel all pending saves
    for (const [, { timer }] of pendingSaves) clearTimeout(timer);
    pendingSaves.clear();

    try {
      const meta = await loadMeta();
      const count = Object.keys(meta).length;
      for (const serverId of Object.keys(meta)) {
        await storeRemove(`history:${serverId}`);
      }
      await storeRemove(META_KEY);
      await strongholdSave();
      log('Chat', `All chat history cleared (${count} servers)`);
    } catch (e) {
      logError('Chat', 'Clear all history failed', e);
    }

    set({ messages: new Map(), loaded: new Set() });
  },

  flushPending: async () => {
    if (!get().unlocked) return;

    // Force-save all pending debounced writes (call on app close)
    for (const [serverId, { serverName, timer }] of pendingSaves) {
      clearTimeout(timer);
      const messages = get().messages.get(serverId);
      if (messages) {
        try {
          await storeSet(`history:${serverId}`, JSON.stringify(messages));
          const meta = await loadMeta();
          meta[serverId] = {
            serverName,
            messageCount: messages.length,
            lastUpdated: new Date().toISOString(),
          };
          await saveMeta(meta);
        } catch (e) {
          logError('Chat', 'History flush failed', e);
        }
      }
    }
    pendingSaves.clear();
    try {
      await strongholdSave();
    } catch (e) {
      logError('Chat', 'History final save failed', e);
    }
  },
}));

// Flush on window close
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    useChatHistoryStore.getState().flushPending();
  });
}
