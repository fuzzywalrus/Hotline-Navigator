import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import type { Bookmark } from '../../types';

interface ConnectDialogProps {
  onClose: () => void;
}

export default function ConnectDialog({ onClose }: ConnectDialogProps) {
  const { addBookmark, bookmarks, addActiveServer, addTab, tabs, serverInfo, setActiveTab } = useAppStore();
  const { username, userIconId, autoDetectTls } = usePreferencesStore();
  const [visible, setVisible] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLFormElement>(null);
  const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto');
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    port: '5500',
    login: 'guest',
    password: '',
    tls: false,
    type: 'server' as 'server' | 'tracker' | 'url',
    saveAsBookmark: true,
    url: '',
  });

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  // Measure content height when form layout changes
  const measureContent = useCallback(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, []);

  useEffect(() => {
    requestAnimationFrame(measureContent);
  }, [formData.type, formData.tls, error, measureContent]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const parseHotlineUrl = (raw: string): { address: string; port: number; tls: boolean; filePath?: string[] } | null => {
    const trimmed = raw.trim();
    const match = trimmed.match(/^hotline:\/\/([^/:]+)(?::(\d+))?(\/.*)?$/i);
    if (!match) return null;
    const address = match[1];
    const port = match[2] ? parseInt(match[2]) : 5500;
    const tls = port === 5600;
    // Parse file path: /files/folder1/folder2 → ['folder1', 'folder2']
    let filePath: string[] | undefined;
    if (match[3]) {
      const pathStr = match[3].replace(/^\/files\/?/i, '').replace(/\/$/, '');
      if (pathStr) {
        filePath = pathStr.split('/').map(s => decodeURIComponent(s));
      }
    }
    return { address, port, tls, filePath };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let address = formData.address;
    let port = parseInt(formData.port);
    let tls = formData.tls;
    let bookmarkType: 'server' | 'tracker' = formData.type === 'tracker' ? 'tracker' : 'server';
    let filePath: string[] | undefined;

    if (formData.type === 'url') {
      const parsed = parseHotlineUrl(formData.url);
      if (!parsed) return;
      address = parsed.address;
      port = parsed.port;
      tls = parsed.tls;
      filePath = parsed.filePath;
    }

    const bookmark: Bookmark = {
      id: crypto.randomUUID(),
      name: formData.type === 'url' ? address : (formData.name || `${address}:${port}`),
      address,
      port,
      login: formData.login,
      password: formData.password || undefined,
      tls,
      type: bookmarkType,
    };

    try {
      // Save bookmark if requested (not for URL type)
      if (formData.type !== 'url' && formData.saveAsBookmark) {
        await invoke('save_bookmark', { bookmark });
        if (!bookmarks.some((b: Bookmark) => b.id === bookmark.id)) {
          addBookmark(bookmark);
        }
      }

      // For trackers, just save the bookmark - don't try to connect
      if (bookmarkType === 'tracker') {
        handleClose();
        return;
      }

      // Check if already connected to this server
      const existingTab = tabs.find(t => {
        if (t.type !== 'server' || !t.serverId) return false;
        const info = serverInfo.get(t.serverId);
        return info?.address === address;
      });
      if (existingTab) {
        setActiveTab(existingTab.id);
        handleClose();
        return;
      }

      // Connect to the server
      setConnecting(true);
      const result = await invoke<{ serverId: string; tls: boolean; port: number }>('connect_to_server', {
        bookmark,
        username,
        userIconId,
        autoDetectTls: autoDetectTls && !tls,
      });

      addActiveServer(result.serverId, {
        id: result.serverId,
        name: bookmark.name,
        address: bookmark.address,
        port: result.port,
        tls: result.tls,
      });

      addTab({
        id: `server-${result.serverId}`,
        type: 'server',
        serverId: result.serverId,
        title: bookmark.name,
        unreadCount: 0,
        ...(filePath && filePath.length > 0 ? { initialFilePath: filePath } : {}),
      });

      handleClose();
    } catch (err) {
      console.error('Failed to connect:', err);
      const errorMessage = String(err);
      if (errorMessage.includes('nodename nor servname provided') || errorMessage.includes('not known')) {
        setError('Unable to resolve server address.');
      } else if (errorMessage.includes('Connection refused')) {
        setError('Connection refused. The server may be offline.');
      } else if (errorMessage.includes('timeout')) {
        setError('Connection timed out.');
      } else {
        setError(errorMessage);
      }
    } finally {
      setConnecting(false);
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
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col transition-all duration-300 ease-in-out ${
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Connect to Server
          </h2>
        </div>

        <div
          className="overflow-hidden transition-[height] duration-300 ease-in-out"
          style={{ height: typeof contentHeight === 'number' ? contentHeight : 'auto' }}
        >
          <form ref={contentRef} onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Type
            </label>
            <select
              value={formData.type}
              onChange={(e) => {
                const newType = e.target.value as 'server' | 'tracker' | 'url';
                if (newType === 'url') {
                  setFormData({ ...formData, type: newType });
                } else {
                  const newPort = newType === 'tracker' ? '5498' : (formData.tls ? '5600' : '5500');
                  setFormData({ ...formData, type: newType, port: newPort, tls: newType === 'tracker' ? false : formData.tls });
                }
              }}
              className="w-full px-3 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="server">Server</option>
              <option value="tracker">Tracker</option>
              <option value="url">Hotline URL</option>
            </select>
          </div>
          {formData.type === 'url' ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Hotline URL *
                </label>
                <input
                  type="text"
                  required
                  value={formData.url}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="hotline://server.example.com:5500"
                />
                {formData.url && !parseHotlineUrl(formData.url) && (
                  <p className="mt-1 text-xs text-red-500">Invalid URL. Use format: hotline://address or hotline://address:port</p>
                )}
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
          ) : (
            <>
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
            </>
          )}

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={connecting}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={connecting}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors disabled:cursor-not-allowed"
            >
              {connecting ? 'Connecting...' : (formData.type === 'tracker' ? 'Save' : 'Connect')}
            </button>
          </div>
          </form>
        </div>
      </div>
    </div>
  );
}
