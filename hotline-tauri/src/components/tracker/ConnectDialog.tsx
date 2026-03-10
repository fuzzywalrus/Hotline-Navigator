import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import type { Bookmark } from '../../types';

interface ConnectDialogProps {
  onClose: () => void;
}

export default function ConnectDialog({ onClose }: ConnectDialogProps) {
  const { addBookmark, bookmarks } = useAppStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    port: '5500',
    login: 'guest',
    password: '',
    tls: false,
    type: 'server' as 'server' | 'tracker',
    saveAsBookmark: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      name: formData.name || `${formData.address}:${formData.port}`,
      address: formData.address,
      port: parseInt(formData.port),
      login: formData.login,
      password: formData.password || undefined,
      tls: formData.tls,
      type: formData.type,
    };

    try {
      if (formData.saveAsBookmark) {
        await invoke('save_bookmark', { bookmark });
        if (!bookmarks.some((b: Bookmark) => b.id === bookmark.id)) {
          addBookmark(bookmark);
        }
      }
      handleClose();
    } catch (error) {
      console.error('Failed to save bookmark:', error);
    }
  };

  return (
    <div
      onClick={handleClose}
      className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-300 ease-in-out ${
        visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/0 backdrop-blur-none'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 transition-all duration-300 ease-in-out ${
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Connect to Server
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type
            </label>
            <select
              value={formData.type}
              onChange={(e) => {
                const newType = e.target.value as 'server' | 'tracker';
                const newPort = newType === 'tracker' ? '5498' : (formData.tls ? '5600' : '5500');
                setFormData({ ...formData, type: newType, port: newPort, tls: newType === 'tracker' ? false : formData.tls });
              }}
              className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="server">Server</option>
              <option value="tracker">Tracker</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {formData.type === 'tracker' ? 'Tracker Name' : 'Server Name'}
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={formData.type === 'tracker' ? 'My Tracker' : 'My Server'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Address *
            </label>
            <input
              type="text"
              required
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="server.example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Port
            </label>
            <input
              type="number"
              value={formData.port}
              onChange={(e) => setFormData({ ...formData, port: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {formData.type === 'server' && (
            <>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="tls"
                  checked={formData.tls}
                  onChange={(e) => {
                    const newTls = e.target.checked;
                    const newPort = newTls && formData.port === '5500' ? '5600'
                      : !newTls && formData.port === '5600' ? '5500'
                      : formData.port;
                    setFormData({ ...formData, tls: newTls, port: newPort });
                  }}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="tls" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Use TLS (Secure Connection)
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Login
                </label>
                <input
                  type="text"
                  value={formData.login}
                  onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="save-bookmark"
              checked={formData.saveAsBookmark}
              onChange={(e) => setFormData({ ...formData, saveAsBookmark: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="save-bookmark" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Add to Bookmarks
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
            >
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
