import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import type { Bookmark } from '../../types';
import EditBookmarkDialog from './EditBookmarkDialog';

interface BookmarkListProps {
  bookmarks: Bookmark[];
}

export default function BookmarkList({ bookmarks }: BookmarkListProps) {
  const { removeBookmark, addActiveServer, setFocusedServer } = useAppStore();
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_bookmark', { id });
      removeBookmark(id);
      setDeletingId(null);
    } catch (error) {
      console.error('Failed to delete bookmark:', error);
    }
  };

  const handleConnect = async (bookmark: Bookmark) => {
    setConnectingId(bookmark.id);
    try {
      const serverId = await invoke<string>('connect_to_server', { bookmark });
      console.log('Connected to server:', serverId);

      // Add to active servers and open window
      addActiveServer(serverId, {
        id: serverId,
        name: bookmark.name,
        address: bookmark.address,
        port: bookmark.port,
      });
      setFocusedServer(serverId);
    } catch (error) {
      console.error('Failed to connect:', error);
      alert(`Failed to connect: ${error}`);
    } finally {
      setConnectingId(null);
    }
  };

  return (
    <>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {bookmarks.map((bookmark) => (
          <div
            key={bookmark.id}
            className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  {bookmark.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {bookmark.address}:{bookmark.port} • {bookmark.login}
                </p>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditingBookmark(bookmark)}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30"
                >
                  Edit
                </button>
                <button
                  onClick={() => setDeletingId(bookmark.id)}
                  className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  Delete
                </button>
                <button
                  onClick={() => handleConnect(bookmark)}
                  disabled={connectingId === bookmark.id}
                  className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium px-3 py-1 rounded bg-blue-50 dark:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connectingId === bookmark.id ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit dialog */}
      {editingBookmark && (
        <EditBookmarkDialog
          bookmark={editingBookmark}
          onClose={() => setEditingBookmark(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Delete Bookmark
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to delete this bookmark? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900/50 rounded-b-lg">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
