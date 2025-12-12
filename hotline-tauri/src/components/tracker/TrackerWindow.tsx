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
    <div className="h-full w-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Hotline
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Settings
          </button>
          <button
            onClick={() => setShowConnect(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Connect
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <p className="text-lg mb-2">No bookmarks yet</p>
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
