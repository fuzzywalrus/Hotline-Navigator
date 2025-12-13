import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import BookmarkList from './BookmarkList';
import ConnectDialog from './ConnectDialog';
import SettingsView from '../settings/SettingsView';
import AboutView from '../about/AboutView';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import type { Bookmark } from '../../types';

export default function TrackerWindow() {
  const [showConnect, setShowConnect] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { bookmarks, setBookmarks } = useAppStore();

  // Load bookmarks from disk on mount - replace entire array to avoid duplicates
  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const savedBookmarks = await invoke<Bookmark[]>('get_bookmarks');
        setBookmarks(savedBookmarks);
      } catch (error) {
        console.error('Failed to load bookmarks:', error);
      }
    };

    loadBookmarks();
  }, [setBookmarks]);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'K',
      modifiers: { meta: true },
      description: 'Connect to Server',
      action: () => setShowConnect(true),
    },
  ]);

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header - matches Swift toolbar style */}
      <div className="flex flex-col border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            {/* Hotline logo placeholder */}
            <div className="w-6 h-6 flex items-center justify-center">
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">H</span>
            </div>
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">
              Servers
            </h1>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={() => {
              // Refresh all expanded trackers - this will be handled by BookmarkList
              // We could emit an event or use a ref, but for now this is a placeholder
            }}
            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-1.5"
            title="Refresh Trackers"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowConnect(true)}
            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-1.5"
            title="Connect to Server"
          >
            <span>🌐</span>
            <span>Connect</span>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="Settings"
          >
            ⚙️
          </button>
          <button
            onClick={() => setShowAbout(true)}
            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            title="About"
          >
            ℹ️
          </button>
        </div>
        </div>
        {/* Search bar */}
        <div className="px-4 pb-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search servers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg
              className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                title="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content - list style */}
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <p className="text-base mb-1">No bookmarks yet</p>
            <p className="text-sm">Click "Connect" to add a server</p>
          </div>
        ) : (
          <BookmarkList bookmarks={bookmarks} searchQuery={searchQuery} />
        )}
      </div>

      {/* Connect dialog */}
      {showConnect && <ConnectDialog onClose={() => setShowConnect(false)} />}
      
      {/* Settings dialog */}
      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
      
      {/* About dialog */}
      {showAbout && <AboutView onClose={() => setShowAbout(false)} />}
    </div>
  );
}
