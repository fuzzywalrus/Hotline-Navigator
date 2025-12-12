import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import BookmarkList from './BookmarkList';
import ConnectDialog from './ConnectDialog';
import SettingsView from '../settings/SettingsView';
import type { Bookmark } from '../../types';

export default function TrackerWindow() {
  const [showConnect, setShowConnect] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header - matches Swift toolbar style */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
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
          <BookmarkList bookmarks={bookmarks} />
        )}
      </div>

      {/* Connect dialog */}
      {showConnect && <ConnectDialog onClose={() => setShowConnect(false)} />}
      
      {/* Settings dialog */}
      {showSettings && <SettingsView onClose={() => setShowSettings(false)} />}
    </div>
  );
}
