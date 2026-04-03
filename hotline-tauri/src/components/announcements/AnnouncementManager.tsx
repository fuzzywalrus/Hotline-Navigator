import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '../../stores/appStore';
import { announcements, type Announcement } from './registry';
import FeatureAnnouncement from './FeatureAnnouncement';

const DISMISSED_KEY = 'feature-announcements-dismissed';
const LEGACY_SEARCH_KEY = 'mnemosyne-search-prompt-seen';
const MAX_PENDING = 5;

function getDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* invalid JSON, treat as empty */ }
  return [];
}

function addDismissed(id: string) {
  const dismissed = getDismissed();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  }
}

function migrateLegacySearchPrompt() {
  const legacySeen = localStorage.getItem(LEGACY_SEARCH_KEY);
  if (legacySeen === 'true') {
    addDismissed('mnemosyne-search');
  }
}

export default function AnnouncementManager() {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const initialized = useRef(false);
  const { bookmarks, mnemosyneBookmarks } = useAppStore();

  useEffect(() => {
    // Only evaluate once after bookmarks have loaded
    if (initialized.current) return;

    // Wait until bookmarks have loaded from Rust
    if (bookmarks.length === 0) return;

    initialized.current = true;

    // New installs never see announcements
    const hasExistingInstall = localStorage.getItem('hotline-preferences') !== null;
    if (!hasExistingInstall) return;

    // Migrate legacy search prompt key
    migrateLegacySearchPrompt();

    // Build the queue
    const dismissed = getDismissed();
    const pending = announcements
      .filter((a) => !dismissed.includes(a.id))
      .filter((a) => a.condition())
      .sort((a, b) => b.order - a.order)
      .slice(0, MAX_PENDING);

    if (pending.length > 0) {
      setQueue(pending);
    }
  }, [bookmarks, mnemosyneBookmarks]);

  const current = queue[currentIndex];
  if (!current) return null;

  const handleDismiss = () => {
    addDismissed(current.id);
    setCurrentIndex((i) => i + 1);
  };

  const handleAccept = async () => {
    await current.onAccept();
    addDismissed(current.id);
    setCurrentIndex((i) => i + 1);
  };

  return (
    <FeatureAnnouncement
      title={current.title}
      body={current.body}
      acceptLabel={current.acceptLabel}
      dismissLabel={current.dismissLabel}
      onAccept={handleAccept}
      onClose={handleDismiss}
    />
  );
}
