import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import MessageDialog from '../chat/MessageDialog';
import UserInfoDialog from '../users/UserInfoDialog';
import UserList from '../users/UserList';
import ChatTab from '../chat/ChatTab';
import BoardTab from '../board/BoardTab';
import FilesTab from '../files/FilesTab';
import NewsTab from '../news/NewsTab';

// Hotline user flag bits
const USER_FLAG_ADMIN = 0x0001;
const USER_FLAG_IDLE = 0x0002;

function parseUserFlags(flags: number) {
  return {
    isAdmin: (flags & USER_FLAG_ADMIN) !== 0,
    isIdle: (flags & USER_FLAG_IDLE) !== 0,
  };
}

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
  flags: number;
  isAdmin: boolean;
  isIdle: boolean;
}

interface PrivateMessage {
  text: string;
  isOutgoing: boolean;
  timestamp: Date;
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
  const [messageDialogUser, setMessageDialogUser] = useState<User | null>(null);
  const [userInfoDialogUser, setUserInfoDialogUser] = useState<User | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Map<number, number>>(new Map());
  const [privateMessageHistory, setPrivateMessageHistory] = useState<Map<number, PrivateMessage[]>>(new Map());

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
      () => {
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
    const unlistenJoin = listen<{ userId: number; userName: string; iconId: number; flags: number }>(
      `user-joined-${serverId}`,
      (event) => {
        setUsers((prev) => {
          // Check if user already exists
          if (prev.some(u => u.userId === event.payload.userId)) {
            return prev;
          }
          const { isAdmin, isIdle } = parseUserFlags(event.payload.flags);
          return [...prev, {
            userId: event.payload.userId,
            userName: event.payload.userName,
            iconId: event.payload.iconId,
            flags: event.payload.flags,
            isAdmin,
            isIdle,
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

    const unlistenChange = listen<{ userId: number; userName: string; iconId: number; flags: number }>(
      `user-changed-${serverId}`,
      (event) => {
        const { isAdmin, isIdle } = parseUserFlags(event.payload.flags);
        setUsers((prev) => prev.map(u =>
          u.userId === event.payload.userId
            ? {
                userId: event.payload.userId,
                userName: event.payload.userName,
                iconId: event.payload.iconId,
                flags: event.payload.flags,
                isAdmin,
                isIdle,
              }
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

  // Listen for private messages to track unread counts and store history
  useEffect(() => {
    const unlisten = listen<{ userId: number; message: string }>(
      `private-message-${serverId}`,
      (event) => {
        const { userId, message } = event.payload;

        // Store message in history
        setPrivateMessageHistory((prev) => {
          const newHistory = new Map(prev);
          const userMessages = newHistory.get(userId) || [];
          newHistory.set(userId, [
            ...userMessages,
            {
              text: message,
              isOutgoing: false,
              timestamp: new Date(),
            },
          ]);
          return newHistory;
        });

        // Only increment unread count if dialog is not open for this user
        if (!messageDialogUser || messageDialogUser.userId !== userId) {
          setUnreadCounts((prev) => {
            const newCounts = new Map(prev);
            newCounts.set(userId, (newCounts.get(userId) || 0) + 1);
            return newCounts;
          });
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [serverId, messageDialogUser]);

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

  const handleUserClick = (user: User) => {
    // Open user info dialog
    setUserInfoDialogUser(user);
  };

  const handleOpenMessageDialog = (user: User) => {
    // Reset unread count for this user
    setUnreadCounts((prev) => {
      const newCounts = new Map(prev);
      newCounts.delete(user.userId);
      return newCounts;
    });
    // Open the dialog
    setMessageDialogUser(user);
  };

  const handleSendPrivateMessage = async (userId: number, message: string) => {
    try {
      await invoke('send_private_message', {
        serverId,
        userId,
        message,
      });

      // Store message in history
      setPrivateMessageHistory((prev) => {
        const newHistory = new Map(prev);
        const userMessages = newHistory.get(userId) || [];
        newHistory.set(userId, [
          ...userMessages,
          {
            text: message,
            isOutgoing: true,
            timestamp: new Date(),
          },
        ]);
        return newHistory;
      });
    } catch (error) {
      console.error('Failed to send private message:', error);
      throw error;
    }
  };

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

  const handleDownloadFile = async (fileName: string, fileSize: number) => {
    try {
      // Initialize progress for this file
      setDownloadProgress((prev) => new Map(prev).set(fileName, 0));

      const result = await invoke<string>('download_file', {
        serverId,
        path: currentPath,
        fileName,
        fileSize,
      });

      // Remove this file from progress map
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(fileName);
        return next;
      });

      alert(`✅ ${result}`);
    } catch (error) {
      console.error('Download failed:', error);

      // Remove this file from progress map on error
      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(fileName);
        return next;
      });

      alert(`❌ Download failed: ${error}`);
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
        <UserList
          users={users}
          unreadCounts={unreadCounts}
          onUserClick={handleUserClick}
        />

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
            <ChatTab
              serverName={serverName}
              messages={messages}
              message={message}
              sending={sending}
              onMessageChange={setMessage}
              onSendMessage={handleSendMessage}
            />
          )}

          {/* Board view */}
          {activeTab === 'board' && (
            <BoardTab
              boardPosts={boardPosts}
              loadingBoard={loadingBoard}
              boardMessage={boardMessage}
              postingBoard={postingBoard}
              onBoardMessageChange={setBoardMessage}
              onPostBoard={handlePostBoard}
            />
          )}

          {/* News view */}
          {activeTab === 'news' && (
            <NewsTab
              newsPath={newsPath}
              newsCategories={newsCategories}
              newsArticles={newsArticles}
              selectedArticle={selectedArticle}
              articleContent={articleContent}
              loadingNews={loadingNews}
              showComposer={showComposer}
              composerTitle={composerTitle}
              composerBody={composerBody}
              postingNews={postingNews}
              onNewsPathChange={setNewsPath}
              onNewsBack={handleNewsBack}
              onNavigateNews={handleNavigateNews}
              onSelectArticle={handleSelectArticle}
              onToggleComposer={() => setShowComposer(!showComposer)}
              onComposerTitleChange={setComposerTitle}
              onComposerBodyChange={setComposerBody}
              onPostNews={handlePostNews}
            />
          )}

          {/* Files view */}
          {activeTab === 'files' && (
            <FilesTab
              files={files}
              currentPath={currentPath}
              downloadProgress={downloadProgress}
              onPathChange={setCurrentPath}
              onDownloadFile={handleDownloadFile}
            />
          )}
        </div>
      </div>

      {/* User Info Dialog */}
      {userInfoDialogUser && (
        <UserInfoDialog
          user={userInfoDialogUser}
          onClose={() => setUserInfoDialogUser(null)}
          onSendMessage={handleOpenMessageDialog}
        />
      )}

      {/* Message Dialog */}
      {messageDialogUser && (
        <MessageDialog
          userId={messageDialogUser.userId}
          userName={messageDialogUser.userName}
          messages={privateMessageHistory.get(messageDialogUser.userId) || []}
          onSendMessage={handleSendPrivateMessage}
          onClose={() => setMessageDialogUser(null)}
        />
      )}
    </div>
  );
}
