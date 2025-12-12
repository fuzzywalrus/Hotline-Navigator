import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface ChatMessage {
  userId: number;
  userName: string;
  message: string;
  timestamp: Date;
}

interface User {
  userId: number;
  userName: string;
  iconId: number;
}

interface FileItem {
  name: string;
  size: number;
  isFolder: boolean;
  fileType?: string;
  creator?: string;
}

type ViewTab = 'chat' | 'files';

interface ServerWindowProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

export default function ServerWindow({ serverId, serverName, onClose }: ServerWindowProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>('chat');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Listen for incoming chat messages
  useEffect(() => {
    const unlisten = listen<ChatMessage>(`chat-message-${serverId}`, (event) => {
      setMessages((prev) => [...prev, {
        ...event.payload,
        timestamp: new Date(),
      }]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [serverId]);

  // Request file list when Files tab is activated or path changes
  useEffect(() => {
    if (activeTab === 'files') {
      invoke('get_file_list', {
        serverId,
        path: currentPath,
      }).catch((error) => {
        console.error('Failed to get file list:', error);
      });
    }
  }, [activeTab, currentPath, serverId]);

  // Listen for file list events
  useEffect(() => {
    const unlisten = listen<{ files: FileItem[] }>(
      `file-list-${serverId}`,
      (event) => {
        setFiles(event.payload.files);
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [serverId]);

  // Listen for user events
  useEffect(() => {
    const unlistenJoin = listen<{ userId: number; userName: string; iconId: number }>(
      `user-joined-${serverId}`,
      (event) => {
        setUsers((prev) => {
          // Check if user already exists
          if (prev.some(u => u.userId === event.payload.userId)) {
            return prev;
          }
          return [...prev, {
            userId: event.payload.userId,
            userName: event.payload.userName,
            iconId: event.payload.iconId,
          }];
        });
      }
    );

    const unlistenLeave = listen<{ userId: number }>(
      `user-left-${serverId}`,
      (event) => {
        setUsers((prev) => prev.filter(u => u.userId !== event.payload.userId));
      }
    );

    const unlistenChange = listen<{ userId: number; userName: string; iconId: number }>(
      `user-changed-${serverId}`,
      (event) => {
        setUsers((prev) => prev.map(u =>
          u.userId === event.payload.userId
            ? { userId: event.payload.userId, userName: event.payload.userName, iconId: event.payload.iconId }
            : u
        ));
      }
    );

    return () => {
      unlistenJoin.then((fn) => fn());
      unlistenLeave.then((fn) => fn());
      unlistenChange.then((fn) => fn());
    };
  }, [serverId]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    const messageText = message.trim();
    setSending(true);
    try {
      await invoke('send_chat_message', {
        serverId,
        message: messageText,
      });

      // Add our own message to the chat display (server doesn't echo it back)
      setMessages((prev) => [...prev, {
        userId: 0, // Our own user ID (we don't know it yet, use 0)
        userName: 'Me',
        message: messageText,
        timestamp: new Date(),
      }]);

      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      alert(`Failed to send message: ${error}`);
    } finally {
      setSending(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await invoke('disconnect_from_server', { serverId });
      onClose();
    } catch (error) {
      console.error('Failed to disconnect:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
      {/* Header */}
      <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
          {serverName}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDisconnect}
            className="px-3 py-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            Disconnect
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - User list */}
        <div className="w-48 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
            Users ({users.length})
          </h2>
          <div className="space-y-1">
            {users.map((user) => (
              <div
                key={user.userId}
                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 py-1"
              >
                <div className="w-4 h-4 bg-gray-300 dark:bg-gray-600 rounded flex items-center justify-center text-xs">
                  {user.iconId}
                </div>
                <span className="truncate">{user.userName}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Main area with tabs */}
        <div className="flex-1 flex flex-col">
          {/* Tab navigation */}
          <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'chat'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'files'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              Files
            </button>
          </div>

          {/* Chat view */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {messages.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
                Connected to {serverName}
              </div>
            ) : (
              messages.map((msg, index) => {
                const isOwnMessage = msg.userName === 'Me';
                return (
                  <div key={index} className="text-sm">
                    <span className={`font-semibold ${
                      isOwnMessage
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}>
                      {msg.userName}:
                    </span>{' '}
                    <span className="text-gray-900 dark:text-gray-100">
                      {msg.message}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <form onSubmit={handleSendMessage} className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                disabled={sending}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!message.trim() || sending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
            </div>
          )}

          {/* Files view */}
          {activeTab === 'files' && (
            <div className="flex-1 flex flex-col">
              {/* Path breadcrumb */}
              <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
                <button
                  onClick={() => setCurrentPath([])}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Root
                </button>
                {currentPath.map((folder, index) => (
                  <span key={index} className="flex items-center gap-2">
                    <span className="text-gray-400">/</span>
                    <button
                      onClick={() => setCurrentPath(currentPath.slice(0, index + 1))}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {folder}
                    </button>
                  </span>
                ))}
              </div>

              {/* File list */}
              <div className="flex-1 overflow-y-auto p-4">
                {files.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    No files
                  </div>
                ) : (
                  <div className="space-y-1">
                    {files.map((file) => (
                      <div
                        key={file.name}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group"
                      >
                        <div
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            if (file.isFolder) {
                              console.log('Double-clicked folder:', file.name);
                              setCurrentPath((prev) => [...prev, file.name]);
                            }
                          }}
                        >
                          <div className="w-6 h-6 flex items-center justify-center text-lg">
                            {file.isFolder ? '📁' : '📄'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {file.name}
                            </div>
                            {!file.isFolder && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {file.size >= 1024 * 1024
                                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                                  : `${(file.size / 1024).toFixed(1)} KB`}
                              </div>
                            )}
                          </div>
                        </div>
                        {!file.isFolder && (
                          <button
                            onClick={async () => {
                              try {
                                await invoke('download_file', {
                                  serverId,
                                  path: [...currentPath, file.name],
                                  fileName: file.name,
                                  fileSize: file.size,
                                });
                              } catch (error) {
                                console.error('Download failed:', error);
                                alert(`Download failed: ${error}`);
                              }
                            }}
                            className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-opacity"
                          >
                            Download
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
