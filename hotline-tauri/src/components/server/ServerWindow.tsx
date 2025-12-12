import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import MessageDialog from '../chat/MessageDialog';
import UserInfoDialog from '../users/UserInfoDialog';
import UserList from '../users/UserList';
import ChatTab from '../chat/ChatTab';
import BoardTab from '../board/BoardTab';
import FilesTab from '../files/FilesTab';
import NewsTab from '../news/NewsTab';
import { ServerInfo } from '../../types';

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
  const [agreementText, setAgreementText] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);

  // Debug: log when bannerUrl changes
  useEffect(() => {
    if (bannerUrl) {
      console.log('🎨 Banner URL state updated:', bannerUrl);
    } else {
      console.log('🎨 Banner URL state is null');
    }
  }, [bannerUrl]);

  // Check for pending agreement when component mounts
  useEffect(() => {
    const checkPendingAgreement = async () => {
      try {
        const pending = await invoke<string | null>('get_pending_agreement', { serverId });
        if (pending) {
          console.log('✅ Found pending agreement on mount, length:', pending.length);
          setAgreementText(pending);
        } else {
          console.log('No pending agreement found on mount');
        }
      } catch (error) {
        console.error('Failed to check pending agreement:', error);
      }
    };
    checkPendingAgreement();
  }, [serverId]);

  // Listen for incoming chat messages
  useEffect(() => {
    const unlisten = listen<ChatMessage>(`chat-message-${serverId}`, (event) => {
      setMessages((prev) => [...prev, {
        ...event.payload,
        timestamp: new Date(),
      }]);
    });

    return () => {
      unlisten.then((fn) => fn()).catch(() => {
        // Ignore cleanup errors
      });
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
      unlisten.then((fn) => fn()).catch(() => {
        // Ignore cleanup errors
      });
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
      unlisten.then((fn) => fn()).catch(() => {
        // Ignore cleanup errors
      });
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
      unlistenJoin.then((fn) => fn()).catch(() => {});
      unlistenLeave.then((fn) => fn()).catch(() => {});
      unlistenChange.then((fn) => fn()).catch(() => {});
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
      unlisten.then((fn) => fn()).catch(() => {
        // Ignore cleanup errors
      });
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
      unlisten.then((fn) => fn()).catch(() => {
        // Ignore cleanup errors
      });
    };
  }, [serverId]);

  // Listen for agreement required events
  const agreementUnlistenRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    console.log(`Setting up agreement listener for server: ${serverId}`);
    const eventName = `agreement-required-${serverId}`;
    console.log(`Listening for event: ${eventName}`);
    
    let isMounted = true;
    
    const unlistenPromise = listen<{ agreement: string }>(
      eventName,
      (event) => {
        if (!isMounted) return;
        console.log('✅ Agreement required event received in frontend!');
        console.log('Event payload:', event.payload);
        console.log('Agreement text length:', event.payload.agreement?.length || 0);
        if (event.payload.agreement) {
          console.log('Agreement text (first 100 chars):', event.payload.agreement.substring(0, 100));
          setAgreementText(event.payload.agreement);
        } else {
          console.warn('Agreement text is missing from event payload');
        }
      }
    );

    unlistenPromise
      .then((fn) => {
        if (isMounted) {
          agreementUnlistenRef.current = fn;
        } else {
          // Component unmounted before listener was set up, clean up immediately
          try {
            fn();
          } catch (e) {
            // Ignore cleanup errors
          }
        }
      })
      .catch((err) => {
        console.error('Failed to set up agreement listener:', err);
      });

    return () => {
      isMounted = false;
      if (agreementUnlistenRef.current) {
        try {
          agreementUnlistenRef.current();
          agreementUnlistenRef.current = null;
        } catch (err) {
          // Ignore cleanup errors
        }
      } else {
        // Listener not set up yet, try to clean up via promise
        unlistenPromise
          .then((fn) => {
            try {
              fn();
            } catch (e) {
              // Ignore cleanup errors
            }
          })
          .catch(() => {
            // Ignore if promise was rejected
          });
      }
    };
  }, [serverId]);

  // Download banner after connection (only once)
  useEffect(() => {
    let cancelled = false;
    
    const downloadBanner = async () => {
      try {
        console.log('Starting banner download for server:', serverId);
        // Wait a bit for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        if (cancelled) {
          console.log('Banner download cancelled (component unmounted)');
          return;
        }
        
        console.log('Requesting banner download from backend...');
        const dataUrl = await invoke<string>('download_banner', { serverId });
        console.log('Banner data URL received, length:', dataUrl.length);
        
        if (cancelled) {
          console.log('Banner download cancelled after receiving data');
          return;
        }
        
        console.log('✅ Banner downloaded and converted to data URL!');
        console.log('  Data URL preview:', dataUrl.substring(0, 50) + '...');
        
        if (!cancelled) {
          setBannerUrl(dataUrl);
          console.log('✅ Banner URL set in state');
        }
      } catch (error) {
        console.error('❌ Banner download failed:', error);
        // Banner download failure is not critical, just log it
      }
    };

    // Only download if we have users (connection is established) and haven't downloaded yet
    if (users.length > 0 && !bannerUrl) {
      console.log('Conditions met for banner download: users.length =', users.length, 'bannerUrl =', bannerUrl);
      downloadBanner();
    } else {
      console.log('Banner download skipped: users.length =', users.length, 'bannerUrl =', bannerUrl);
    }

    return () => {
      cancelled = true;
    };
  }, [serverId, users.length]);

  // Fetch server info after connection
  useEffect(() => {
    if (users.length > 0 && !serverInfo) {
      const fetchServerInfo = async () => {
        try {
          const info = await invoke<ServerInfo>('get_server_info', { serverId });
          console.log('Server info fetched:', info);
          setServerInfo(info);
        } catch (error) {
          console.error('Failed to fetch server info:', error);
        }
      };
      fetchServerInfo();
    }
  }, [serverId, users.length, serverInfo]);

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

  const handleAcceptAgreement = async () => {
    try {
      await invoke('accept_agreement', { serverId });
      setAgreementText(null);
    } catch (error) {
      console.error('Failed to accept agreement:', error);
      alert(`Failed to accept agreement: ${error}`);
    }
  };

  const handleDeclineAgreement = () => {
    setAgreementText(null);
    // Optionally disconnect on decline
    handleDisconnect();
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
      {/* Server Banner */}
      {bannerUrl && (
        <div className="bg-gray-900 dark:bg-black border-b border-gray-700 flex items-center justify-center py-2 px-4 min-h-[60px]">
          <img
            src={bannerUrl}
            alt={`${serverName} Banner`}
            className="max-w-full h-auto max-h-[60px] object-contain"
            style={{ imageRendering: 'auto' }}
            onLoad={() => {
              console.log('✅ Banner image loaded successfully!');
              console.log('  URL:', bannerUrl);
            }}
            onError={(e) => {
              console.error('❌ Failed to load banner image');
              console.error('  URL:', bannerUrl);
              console.error('  Error event:', e);
              // Hide banner on error
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Header */}
      <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {serverInfo?.name || serverName}
            </h1>
            {serverInfo?.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {serverInfo.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {serverInfo && (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="font-medium">{users.length}</span>
                <span>user{users.length !== 1 ? 's' : ''}</span>
              </div>
            )}
            <button
              onClick={handleDisconnect}
              className="px-3 py-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Tab navigation and Users */}
        <div className="w-[200px] bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          {/* Tab navigation */}
          <div className="flex flex-col gap-1 p-2">
            <button
              onClick={() => setActiveTab('chat')}
              className={`flex items-center gap-2 px-2 py-2 rounded transition-colors ${
                activeTab === 'chat'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
              title="Public Chat"
            >
              <img 
                src="/icons/section-chat.png" 
                alt="Chat" 
                className="w-5 h-5"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              <span className="text-sm font-medium">Chat</span>
            </button>
            <button
              onClick={() => setActiveTab('board')}
              className={`flex items-center gap-2 px-2 py-2 rounded transition-colors ${
                activeTab === 'board'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
              title="Message Board"
            >
              <img 
                src="/icons/section-board.png" 
                alt="Board" 
                className="w-5 h-5"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              <span className="text-sm font-medium">Board</span>
            </button>
            <button
              onClick={() => setActiveTab('news')}
              className={`flex items-center gap-2 px-2 py-2 rounded transition-colors ${
                activeTab === 'news'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
              title="News"
            >
              <img 
                src="/icons/section-news.png" 
                alt="News" 
                className="w-5 h-5"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              <span className="text-sm font-medium">News</span>
            </button>
            <button
              onClick={() => setActiveTab('files')}
              className={`flex items-center gap-2 px-2 py-2 rounded transition-colors ${
                activeTab === 'files'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
              title="Files"
            >
              <img 
                src="/icons/section-files.png" 
                alt="Files" 
                className="w-5 h-5"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
              <span className="text-sm font-medium">Files</span>
            </button>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-200 dark:border-gray-700 my-2"></div>

          {/* User list below tabs */}
          <div className="flex-1 overflow-auto">
            <UserList
              users={users}
              unreadCounts={unreadCounts}
              onUserClick={handleUserClick}
            />
          </div>
        </div>

        {/* Main area with content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Content area */}
          <div className="flex-1 overflow-auto">
            {/* Chat view */}
            {activeTab === 'chat' && (
            <ChatTab
              serverName={serverName}
              messages={messages}
              message={message}
              sending={sending}
              bannerUrl={bannerUrl}
              agreementText={agreementText}
              onMessageChange={setMessage}
              onSendMessage={handleSendMessage}
              onAcceptAgreement={handleAcceptAgreement}
              onDeclineAgreement={handleDeclineAgreement}
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
