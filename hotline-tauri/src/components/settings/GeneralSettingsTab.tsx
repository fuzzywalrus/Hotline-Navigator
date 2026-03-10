import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useAppStore } from '../../stores/appStore';
import { showNotification } from '../../stores/notificationStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import type { Bookmark } from '../../types';

export default function GeneralSettingsTab() {
  const { username, setUsername, enablePrivateMessaging, setEnablePrivateMessaging, darkMode, setDarkMode, downloadFolder, setDownloadFolder, showServerBanner, setShowServerBanner, clickableLinks, setClickableLinks, autoDetectTls, setAutoDetectTls, mentionPopup, setMentionPopup, mutedUsers, addMutedUser, removeMutedUser, watchWords, addWatchWord, removeWatchWord } = usePreferencesStore();
  const { setBookmarks } = useAppStore();
  const isMobile = useIsMobile();
  const [localUsername, setLocalUsername] = useState(username);
  const [isAddingDefaults, setIsAddingDefaults] = useState(false);
  const [muteInput, setMuteInput] = useState('');
  const [watchInput, setWatchInput] = useState('');

  useEffect(() => {
    setLocalUsername(username);
  }, [username]);

  const handleSave = () => {
    setUsername(localUsername.trim() || 'guest');
  };

  const handlePickDownloadFolder = async () => {
    try {
      const folder = await invoke<string | null>('pick_download_folder');
      if (folder) {
        setDownloadFolder(folder);
      }
    } catch (error) {
      console.error('Failed to pick download folder:', error);
    }
  };

  const handleAddDefaults = async () => {
    setIsAddingDefaults(true);
    try {
      const updatedBookmarks = await invoke<Bookmark[]>('add_default_bookmarks');
      setBookmarks(updatedBookmarks);
      showNotification.success('Default bookmarks added successfully', 'Bookmarks Updated');
    } catch (error) {
      console.error('Failed to add default bookmarks:', error);
      showNotification.error(
        `Failed to add default bookmarks: ${error instanceof Error ? error.message : String(error)}`,
        'Error'
      );
    } finally {
      setIsAddingDefaults(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Your Name
        </label>
        <input
          type="text"
          value={localUsername}
          onChange={(e) => setLocalUsername(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSave();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="guest"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          This name will be displayed to other users on servers you connect to.
        </p>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Enable Private Messaging
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Allow other users to send you private messages and enable private messaging features.
            </p>
          </div>
          <input
            type="checkbox"
            checked={enablePrivateMessaging}
            onChange={(e) => setEnablePrivateMessaging(e.target.checked)}
            className="ml-4 toggle toggle-primary"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Server Banner
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Show the server's banner image at the top of the server window.
            </p>
          </div>
          <input
            type="checkbox"
            checked={showServerBanner}
            onChange={(e) => setShowServerBanner(e.target.checked)}
            className="ml-4 toggle toggle-primary"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Clickable Links
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Make URLs in chat, board posts, news articles, and server agreements clickable.
            </p>
          </div>
          <input
            type="checkbox"
            checked={clickableLinks}
            onChange={(e) => setClickableLinks(e.target.checked)}
            className="ml-4 toggle toggle-primary"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Auto-Detect TLS
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              When connecting from tracker listings, probe for TLS support and use a secure connection if available.
            </p>
          </div>
          <input
            type="checkbox"
            checked={autoDetectTls}
            onChange={(e) => setAutoDetectTls(e.target.checked)}
            className="ml-4 toggle toggle-primary"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mention Pop-up Notifications
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Show a pop-up when someone @mentions you in chat. Mentions are always logged to notification history.
            </p>
          </div>
          <input
            type="checkbox"
            checked={mentionPopup}
            onChange={(e) => setMentionPopup(e.target.checked)}
            className="ml-4 toggle toggle-primary"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Muted Users
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          No notifications or sounds from these usernames.
        </p>
        {mutedUsers.length > 0 && (
          <div className="mb-3 space-y-1">
            {mutedUsers.map((u) => (
              <div key={u} className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-md">
                <span className="text-sm text-gray-900 dark:text-gray-100">{u}</span>
                <button
                  onClick={() => removeMutedUser(u)}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={muteInput}
            onChange={(e) => setMuteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && muteInput.trim()) {
                addMutedUser(muteInput.trim());
                setMuteInput('');
              }
            }}
            placeholder="Username to mute"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            onClick={() => { if (muteInput.trim()) { addMutedUser(muteInput.trim()); setMuteInput(''); } }}
            disabled={!muteInput.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md text-sm font-medium disabled:cursor-not-allowed transition-colors"
          >
            Mute
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Watch Words
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Highlight and notify when any of these words appear in chat (case-insensitive, whole word).
        </p>
        {watchWords.length > 0 && (
          <div className="mb-3 space-y-1">
            {watchWords.map((w) => (
              <div key={w} className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-md">
                <span className="text-sm text-gray-900 dark:text-gray-100">{w}</span>
                <button
                  onClick={() => removeWatchWord(w)}
                  className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={watchInput}
            onChange={(e) => setWatchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && watchInput.trim()) {
                addWatchWord(watchInput.trim());
                setWatchInput('');
              }
            }}
            placeholder="Word to watch for"
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            onClick={() => { if (watchInput.trim()) { addWatchWord(watchInput.trim()); setWatchInput(''); } }}
            disabled={!watchInput.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md text-sm font-medium disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Appearance
        </label>
        <div className="space-y-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="darkMode"
              value="system"
              checked={darkMode === 'system'}
              onChange={() => setDarkMode('system')}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div className="flex-1">
              <span className="text-sm text-gray-900 dark:text-white">System</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Follow system preference</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="darkMode"
              value="light"
              checked={darkMode === 'light'}
              onChange={() => setDarkMode('light')}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div className="flex-1">
              <span className="text-sm text-gray-900 dark:text-white">Light</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Always use light mode</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="darkMode"
              value="dark"
              checked={darkMode === 'dark'}
              onChange={() => setDarkMode('dark')}
              className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
            />
            <div className="flex-1">
              <span className="text-sm text-gray-900 dark:text-white">Dark</span>
              <p className="text-xs text-gray-500 dark:text-gray-400">Always use dark mode</p>
            </div>
          </label>
        </div>
      </div>

      {!isMobile && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Download Folder
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {downloadFolder ? downloadFolder : 'System Downloads folder'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handlePickDownloadFolder}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
            >
              Choose...
            </button>
            {downloadFolder && (
              <button
                onClick={() => setDownloadFolder(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Reset to Default
              </button>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Bookmarks
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Re-add default trackers and servers if you've deleted them.
        </p>
        <button
          onClick={handleAddDefaults}
          disabled={isAddingDefaults}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed transition-colors"
        >
          {isAddingDefaults ? 'Adding...' : 'Re-add Default Servers & Trackers'}
        </button>
      </div>
    </div>
  );
}

