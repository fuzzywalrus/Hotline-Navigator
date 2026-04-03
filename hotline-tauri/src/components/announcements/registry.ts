import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import type { Bookmark } from '../../types';

export interface Announcement {
  id: string;
  order: number;
  title: string;
  body: string;
  acceptLabel: string;
  dismissLabel?: string;
  onAccept: () => Promise<void>;
  condition: () => boolean;
}

export const announcements: Announcement[] = [
  {
    id: 'mnemosyne-search',
    order: 1,
    title: 'Enable Server Search',
    body: 'Hotline Navigator can now search servers through Mnemosyne indexes. Add tracker.vespernet.net to enable search. This is a new feature that servers can choose to opt into.',
    acceptLabel: 'Add Search',
    onAccept: async () => {
      const store = useAppStore.getState();
      const hasSearchBookmark = store.mnemosyneBookmarks.some(
        (b) => b.url === 'http://tracker.vespernet.net:8980'
      );
      if (!hasSearchBookmark) {
        store.addMnemosyneBookmark({
          id: 'default-mnemosyne-vespernet',
          name: 'vespernet.net',
          url: 'http://tracker.vespernet.net:8980',
        });
      }
    },
    condition: () => {
      const { mnemosyneBookmarks } = useAppStore.getState();
      return mnemosyneBookmarks.length === 0;
    },
  },
  {
    id: 'v3-trackers',
    order: 2,
    title: 'V3 Trackers Available!',
    body: 'Hotline Navigator now supports V3 Trackers! These allow servers to broadcast features like TLS + HOPE (encryption) and domain names instead of IPs. Start experiencing the future!',
    acceptLabel: 'Add V3 Trackers',
    onAccept: async () => {
      const store = useAppStore.getState();
      const { bookmarks } = store;

      const trackersToAdd: { id: string; name: string; address: string }[] = [];

      if (!bookmarks.some((b: Bookmark) => b.address === 'track.bigredh.com')) {
        trackersToAdd.push({
          id: 'default-tracker-bigredh',
          name: 'Big Red H',
          address: 'track.bigredh.com',
        });
      }

      if (!bookmarks.some((b: Bookmark) => b.address === 'tracker.vespernet.net')) {
        trackersToAdd.push({
          id: 'default-tracker-vespernet',
          name: 'Vespernet',
          address: 'tracker.vespernet.net',
        });
      }

      for (const tracker of trackersToAdd) {
        const bookmark: Bookmark = {
          id: tracker.id,
          name: tracker.name,
          address: tracker.address,
          port: 5498,
          login: 'guest',
          tls: false,
          hope: false,
          type: 'tracker',
        };
        await invoke('save_bookmark', { bookmark });
        store.addBookmark(bookmark);
      }
    },
    condition: () => {
      const { bookmarks } = useAppStore.getState();
      const hasBigredh = bookmarks.some((b: Bookmark) => b.address === 'track.bigredh.com');
      const hasVespernet = bookmarks.some((b: Bookmark) => b.address === 'tracker.vespernet.net');
      return !hasBigredh && !hasVespernet;
    },
  },
];
