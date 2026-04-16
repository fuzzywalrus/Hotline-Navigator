// Secure password storage using Stronghold vault
// Passwords are stored encrypted, keyed by bookmark ID.

import { Stronghold } from '@tauri-apps/plugin-stronghold';
import { appDataDir } from '@tauri-apps/api/path';

const VAULT_PASSWORD = 'hotline-navigator-passwords-v1';

let strongholdInstance: Stronghold | null = null;
let initPromise: Promise<Stronghold> | null = null;

async function getStronghold(): Promise<Stronghold> {
  if (strongholdInstance) return strongholdInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const dir = await appDataDir();
    const path = `${dir}/bookmark-passwords.hold`;
    const sh = await Stronghold.load(path, VAULT_PASSWORD);
    strongholdInstance = sh;
    return sh;
  })();

  return initPromise;
}

async function getStore() {
  const sh = await getStronghold();
  let client;
  try {
    client = await sh.loadClient('passwords');
  } catch {
    client = await sh.createClient('passwords');
  }
  return client.getStore();
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function savePassword(bookmarkId: string, password: string): Promise<void> {
  const store = await getStore();
  await store.insert(bookmarkId, Array.from(encoder.encode(password)));
  const sh = await getStronghold();
  await sh.save();
}

export async function getPassword(bookmarkId: string): Promise<string | null> {
  try {
    const store = await getStore();
    const data = await store.get(bookmarkId);
    if (!data) return null;
    return decoder.decode(data);
  } catch {
    return null;
  }
}

export async function deletePassword(bookmarkId: string): Promise<void> {
  try {
    const store = await getStore();
    await store.remove(bookmarkId);
    const sh = await getStronghold();
    await sh.save();
  } catch {
    // Ignore if key doesn't exist
  }
}
