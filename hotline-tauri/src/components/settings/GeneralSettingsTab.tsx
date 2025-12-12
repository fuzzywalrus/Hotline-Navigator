import { useState, useEffect } from 'react';
import { usePreferencesStore } from '../../stores/preferencesStore';

export default function GeneralSettingsTab() {
  const { username, setUsername } = usePreferencesStore();
  const [localUsername, setLocalUsername] = useState(username);

  useEffect(() => {
    setLocalUsername(username);
  }, [username]);

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
    </div>
  );
}

