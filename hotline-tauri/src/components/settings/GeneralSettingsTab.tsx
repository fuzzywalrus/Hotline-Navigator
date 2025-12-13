import { useState, useEffect } from 'react';
import { usePreferencesStore } from '../../stores/preferencesStore';

export default function GeneralSettingsTab() {
  const { username, setUsername, fileCacheDepth, setFileCacheDepth, enablePrivateMessaging, setEnablePrivateMessaging, darkMode, setDarkMode } = usePreferencesStore();
  const [localUsername, setLocalUsername] = useState(username);
  const [localFileCacheDepth, setLocalFileCacheDepth] = useState(fileCacheDepth);

  useEffect(() => {
    setLocalUsername(username);
    setLocalFileCacheDepth(fileCacheDepth);
  }, [username, fileCacheDepth]);

  const handleSave = () => {
    setUsername(localUsername.trim() || 'guest');
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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          File Cache Depth
        </label>
        <input
          type="number"
          min="0"
          max="10"
          value={localFileCacheDepth}
          onChange={(e) => setLocalFileCacheDepth(parseInt(e.target.value) || 0)}
          onBlur={() => setFileCacheDepth(Math.max(0, Math.min(10, localFileCacheDepth)))}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Number of folder layers to pre-fetch and cache when connecting to a server. Higher values improve browsing speed but use more memory. (0-10, default: 8)
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
    </div>
  );
}

