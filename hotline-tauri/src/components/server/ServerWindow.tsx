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

interface NewsCategory {
  type: number;
  count: number;
  name: string;
  path: string[];
}

interface NewsArticle {
  id: number;
  parent_id: number;
  flags: number;
  title: string;
  poster: string;
  date?: string;
  path: string[];
}

type ViewTab = 'chat' | 'board' | 'news' | 'files';

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
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());
  const [boardPosts, setBoardPosts] = useState<string[]>([]);
  const [boardMessage, setBoardMessage] = useState('');
  const [postingBoard, setPostingBoard] = useState(false);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [newsCategories, setNewsCategories] = useState<NewsCategory[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [newsPath, setNewsPath] = useState<string[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [articleContent, setArticleContent] = useState<string>('');
  const [loadingNews, setLoadingNews] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [composerTitle, setComposerTitle] = useState('');
  const [composerBody, setComposerBody] = useState('');
  const [postingNews, setPostingNews] = useState(false);
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

  // Request message board when Board tab is activated
  useEffect(() => {
    if (activeTab === 'board' && !loadingBoard && boardPosts.length === 0) {
      setLoadingBoard(true);
      invoke<string[]>('get_message_board', {
        serverId,
      }).then((posts) => {
        console.log('Received board posts:', posts);
        posts.forEach((post, i) => {
          console.log(`Post ${i}:`, JSON.stringify(post));
        });
        setBoardPosts(posts);
        setLoadingBoard(false);
      }).catch((error) => {
        console.error('Failed to get message board:', error);
        setLoadingBoard(false);
      });
    }
  }, [activeTab, serverId, loadingBoard, boardPosts.length]);

  // Listen for new message board posts
  useEffect(() => {
    const unlisten = listen<{ message: string }>(
      `message-board-post-${serverId}`,
      (event) => {
        // Refresh the board when a new post arrives
        invoke<string[]>('get_message_board', {
          serverId,
        }).then((posts) => {
          setBoardPosts(posts);
        }).catch((error) => {
          console.error('Failed to refresh message board:', error);
        });
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

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen<{ fileName: string; bytesRead: number; totalBytes: number; progress: number }>(
      `download-progress-${serverId}`,
      (event) => {
        const { fileName, progress } = event.payload;
        setDownloadProgress((prev) => new Map(prev).set(fileName, progress));
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [serverId]);

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

  const handlePostBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardMessage.trim() || postingBoard) return;

    const messageText = boardMessage.trim();
    setPostingBoard(true);
    try {
      await invoke('post_message_board', {
        serverId,
        message: messageText,
      });

      // Refresh the board to show new post
      const posts = await invoke<string[]>('get_message_board', {
        serverId,
      });
      setBoardPosts(posts);

      setBoardMessage('');
    } catch (error) {
      console.error('Failed to post to board:', error);
      alert(`Failed to post to board: ${error}`);
    } finally {
      setPostingBoard(false);
    }
  };

  // Load news when News tab is activated or path changes
  useEffect(() => {
    if (activeTab === 'news') {
      setLoadingNews(true);
      setSelectedArticle(null);
      setArticleContent('');

      // Load categories and articles in parallel
      Promise.all([
        invoke<NewsCategory[]>('get_news_categories', {
          serverId,
          path: newsPath,
        }).catch((error) => {
          console.error('Failed to get news categories:', error);
          return [];
        }),
        invoke<NewsArticle[]>('get_news_articles', {
          serverId,
          path: newsPath,
        }).catch((error) => {
          console.error('Failed to get news articles:', error);
          return [];
        })
      ]).then(([categories, articles]) => {
        setNewsCategories(categories);
        setNewsArticles(articles);
        setLoadingNews(false);
      });
    }
  }, [activeTab, newsPath, serverId]);

  const handleNavigateNews = (category: NewsCategory) => {
    if (category.type === 2 || category.type === 3) {
      // Bundle or category - navigate into it
      setNewsPath(category.path);
    }
  };

  const handleNewsBack = () => {
    if (newsPath.length > 0) {
      setNewsPath(newsPath.slice(0, -1));
    }
  };

  const handleSelectArticle = async (article: NewsArticle) => {
    setSelectedArticle(article);
    setArticleContent('Loading...');

    try {
      const content = await invoke<string>('get_news_article_data', {
        serverId,
        articleId: article.id,
        path: article.path,
      });
      setArticleContent(content);
    } catch (error) {
      console.error('Failed to get article content:', error);
      setArticleContent(`Error loading article: ${error}`);
    }
  };

  const handlePostNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerTitle.trim() || !composerBody.trim() || postingNews) return;

    setPostingNews(true);
    try {
      await invoke('post_news_article', {
        serverId,
        title: composerTitle,
        text: composerBody,
        path: newsPath,
        parentId: selectedArticle?.id || 0,
      });

      // Clear form and close composer
      setComposerTitle('');
      setComposerBody('');
      setShowComposer(false);

      // Refresh articles
      const articles = await invoke<NewsArticle[]>('get_news_articles', {
        serverId,
        path: newsPath,
      });
      setNewsArticles(articles);
    } catch (error) {
      console.error('Failed to post news:', error);
      const errorMsg = String(error);
      // Check if it's a permission error
      if (errorMsg.includes('Error code: 1') || errorMsg.toLowerCase().includes('permission')) {
        alert(`Unable to post news article:\n\n${error}\n\nYou may not have posting privileges on this server. Contact the server administrator to request access.`);
      } else {
        alert(`Failed to post news: ${error}`);
      }
    } finally {
      setPostingNews(false);
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
              onClick={() => setActiveTab('board')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'board'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              Board
            </button>
            <button
              onClick={() => setActiveTab('news')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'news'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              News
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

          {/* Board view */}
          {activeTab === 'board' && (
            <div className="flex-1 flex flex-col">
              {/* Posts list */}
              <div className="flex-1 overflow-y-auto p-4">
                {loadingBoard ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    Loading message board...
                  </div>
                ) : boardPosts.length === 0 ? (
                  <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                    No posts on message board
                  </div>
                ) : (
                  <div className="space-y-4">
                    {boardPosts.map((post, index) => (
                      <div
                        key={index}
                        className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <pre className="text-sm text-gray-900 dark:text-gray-100 font-mono whitespace-pre-wrap break-words m-0">
                          {post}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Post composer */}
              <form onSubmit={handlePostBoard} className="border-t border-gray-200 dark:border-gray-700 p-4">
                <div className="flex flex-col gap-2">
                  <textarea
                    value={boardMessage}
                    onChange={(e) => setBoardMessage(e.target.value)}
                    placeholder="Write a message to the board..."
                    disabled={postingBoard}
                    rows={3}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 resize-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={!boardMessage.trim() || postingBoard}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed"
                    >
                      {postingBoard ? 'Posting...' : 'Post to Board'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* News view */}
          {activeTab === 'news' && (
            <div className="flex-1 flex">
              {/* Left panel: Categories and Articles */}
              <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                {/* Path breadcrumb */}
                <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
                  <button
                    onClick={() => setNewsPath([])}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    News
                  </button>
                  {newsPath.map((segment, index) => (
                    <span key={index} className="flex items-center gap-2">
                      <span className="text-gray-400 dark:text-gray-500">/</span>
                      <button
                        onClick={() => setNewsPath(newsPath.slice(0, index + 1))}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {segment}
                      </button>
                    </span>
                  ))}
                  {newsPath.length > 0 && (
                    <button
                      onClick={handleNewsBack}
                      className="ml-auto text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      ← Back
                    </button>
                  )}
                </div>

                {/* Categories list */}
                {newsCategories.length > 0 && (
                  <div className="border-b border-gray-200 dark:border-gray-700">
                    <div className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-xs font-semibold text-gray-600 dark:text-gray-400">
                      CATEGORIES
                    </div>
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {newsCategories.map((category, index) => (
                        <button
                          key={index}
                          onClick={() => handleNavigateNews(category)}
                          className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              📁 {category.name}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {category.count} {category.count === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Articles list */}
                <div className="flex-1 overflow-y-auto">
                  {loadingNews ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      Loading news...
                    </div>
                  ) : newsArticles.length === 0 ? (
                    <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
                      No articles in this category
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {newsArticles.map((article) => (
                        <button
                          key={article.id}
                          onClick={() => handleSelectArticle(article)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                            selectedArticle?.id === article.id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                          }`}
                        >
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {article.title}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            by {article.poster}
                            {article.parent_id > 0 && <span className="ml-2 text-blue-600 dark:text-blue-400">↳ Reply</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Post button */}
                <div className="border-t border-gray-200 dark:border-gray-700 p-4">
                  <button
                    onClick={() => setShowComposer(!showComposer)}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium"
                  >
                    {showComposer ? 'Cancel' : selectedArticle ? 'Reply to Article' : 'Post Article'}
                  </button>
                </div>
              </div>

              {/* Right panel: Article viewer or composer */}
              <div className="w-1/2 flex flex-col">
                {showComposer ? (
                  /* Composer */
                  <form onSubmit={handlePostNews} className="flex-1 flex flex-col p-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                      {selectedArticle ? `Reply to: ${selectedArticle.title}` : 'Post New Article'}
                    </h3>
                    <input
                      type="text"
                      value={composerTitle}
                      onChange={(e) => setComposerTitle(e.target.value)}
                      placeholder="Article title..."
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
                    />
                    <textarea
                      value={composerBody}
                      onChange={(e) => setComposerBody(e.target.value)}
                      placeholder="Article content..."
                      rows={20}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"
                    />
                    <button
                      type="submit"
                      disabled={!composerTitle.trim() || !composerBody.trim() || postingNews}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md font-medium disabled:cursor-not-allowed"
                    >
                      {postingNews ? 'Posting...' : 'Post'}
                    </button>
                  </form>
                ) : selectedArticle ? (
                  /* Article viewer */
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="border-b border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {selectedArticle.title}
                      </h2>
                      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        by {selectedArticle.poster}
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                      <pre className="text-sm text-gray-900 dark:text-gray-100 font-mono whitespace-pre-wrap break-words">
                        {articleContent}
                      </pre>
                    </div>
                  </div>
                ) : (
                  /* No article selected */
                  <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                    Select an article to read
                  </div>
                )}
              </div>
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
                          <div className="flex items-center gap-2">
                            {downloadProgress.has(file.name) && downloadProgress.get(file.name)! < 100 ? (
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-blue-600 transition-all duration-300"
                                    style={{ width: `${downloadProgress.get(file.name)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-600 dark:text-gray-400">
                                  {downloadProgress.get(file.name)}%
                                </span>
                              </div>
                            ) : (
                              <button
                                onClick={async () => {
                                  try {
                                    // Initialize progress for this file
                                    setDownloadProgress((prev) => new Map(prev).set(file.name, 0));

                                    const result = await invoke<string>('download_file', {
                                      serverId,
                                      path: currentPath,
                                      fileName: file.name,
                                      fileSize: file.size,
                                    });

                                    // Remove this file from progress map
                                    setDownloadProgress((prev) => {
                                      const next = new Map(prev);
                                      next.delete(file.name);
                                      return next;
                                    });

                                    alert(`✅ ${result}`);
                                  } catch (error) {
                                    console.error('Download failed:', error);

                                    // Remove this file from progress map on error
                                    setDownloadProgress((prev) => {
                                      const next = new Map(prev);
                                      next.delete(file.name);
                                      return next;
                                    });

                                    alert(`❌ Download failed: ${error}`);
                                  }
                                }}
                                className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-opacity"
                              >
                                Download
                              </button>
                            )}
                          </div>
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
