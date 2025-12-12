import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import BookmarkList from './BookmarkList';
import ConnectDialog from './ConnectDialog';
import type { Bookmark } from '../../types';

export default function TrackerWindow() {
  const [showConnect, setShowConnect] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const { bookmarks, addBookmark } = useAppStore();

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult('');
    try {
      const result = await invoke<string>('test_connection', {
        address: 'hotline.semihosted.xyz',
        port: 5500,
      });
      setTestResult(`✅ ${result}`);
    } catch (error) {
      setTestResult(`❌ ${error}`);
    } finally {
      setTesting(false);
    }
  };

  // Load bookmarks from disk on mount
  useEffect(() => {
    const loadBookmarks = async () => {
      try {
        const savedBookmarks = await invoke<Bookmark[]>('get_bookmarks');
        savedBookmarks.forEach(bookmark => addBookmark(bookmark));
      } catch (error) {
        console.error('Failed to load bookmarks:', error);
      }
    };

    loadBookmarks();
  }, []);

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
          Hotline
        </h1>
        <div className="flex gap-2">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-md text-sm font-medium transition-colors"
          >
            {testing ? 'Testing...' : 'Test Server'}
          </button>
          <button
            onClick={() => setShowConnect(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Connect
          </button>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm font-mono">{testResult}</p>
        </div>
      )}

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
    </div>
  );
}
