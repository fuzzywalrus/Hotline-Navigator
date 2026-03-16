import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import MessageDialog from '../chat/MessageDialog';
import UserInfoDialog from '../users/UserInfoDialog';
import { useContextMenu, ContextMenuRenderer, type ContextMenuItem } from '../common/ContextMenu';
import ChatTab from '../chat/ChatTab';
import BoardTab from '../board/BoardTab';
import FilesTab from '../files/FilesTab';
import NewsTab from '../news/NewsTab';
import ServerBanner from './ServerBanner';
import ServerHeader from './ServerHeader';
import ServerSidebar from './ServerSidebar';
import MobileTabBar from './MobileTabBar';
import TransferList from '../transfers/TransferList';
import NotificationLog from '../notifications/NotificationLog';
import Linkify from '../common/Linkify';
import { ServerInfo, ConnectionStatus } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useServerEvents } from './hooks/useServerEvents';
import { useServerHandlers } from './hooks/useServerHandlers';
import { parseUserFlags } from './serverUtils';
import type { ChatMessage, User, PrivateMessage, FileItem, NewsCategory, NewsArticle, ViewTab } from './serverTypes';

interface ServerWindowProps {
  serverId: string;
  serverName: string;
  onClose: () => void;
}

export default function ServerWindow({ serverId, serverName, onClose }: ServerWindowProps) {
  const { setFileCache, getFileCache, clearFileCache, clearFileCachePath, addTransfer, updateTransfer, updateTabTitle, serverInfo: serverInfoMap, tabs } = useAppStore();
  const isTls = serverInfoMap.get(serverId)?.tls ?? false;
  const { enablePrivateMessaging, downloadFolder, showServerBanner } = usePreferencesStore();
  const [showTransferList, setShowTransferList] = useState(false);
  const [showNotificationLog, setShowNotificationLog] = useState(false);
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();
  const [activeTab, setActiveTab] = useState<ViewTab>('chat');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [userAccess, setUserAccess] = useState<number>(0); // User access permissions (bitmask)
  const [files, setFiles] = useState<FileItem[]>([]);
  const currentPathRef = useRef<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<Map<string, number>>(new Map());
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
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
  const [agreementDismissing, setAgreementDismissing] = useState(false);
  const [agreementVisible, setAgreementVisible] = useState(false);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  // Check if tab has an initial file path to navigate to (from hotline:// URL)
  const initialFilePath = useRef(
    tabs.find(t => t.type === 'server' && t.serverId === serverId)?.initialFilePath
  );
  const [pendingFilePath, setPendingFilePath] = useState<string[] | undefined>(initialFilePath.current);

  // Navigate to file path once agreement is cleared and connection is ready
  useEffect(() => {
    if (pendingFilePath && pendingFilePath.length > 0 && !agreementText && connectionStatus === 'logged-in') {
      setActiveTab('files');
      setCurrentPath(pendingFilePath);
      currentPathRef.current = pendingFilePath;
      setPendingFilePath(undefined);
    }
  }, [pendingFilePath, agreementText, connectionStatus]);

  // Debug: log when bannerUrl changes
  useEffect(() => {
    if (bannerUrl) {
      console.log('🎨 Banner URL state updated:', bannerUrl);
    } else {
      console.log('🎨 Banner URL state is null');
    }
  }, [bannerUrl]);

  // Trigger entrance animation when agreement appears
  useEffect(() => {
    if (agreementText) {
      // Allow one frame for the DOM to render before starting the transition
      const id = requestAnimationFrame(() => setAgreementVisible(true));
      return () => cancelAnimationFrame(id);
    } else {
      setAgreementVisible(false);
    }
  }, [agreementText]);

  // Check for pending agreement and connection status when component mounts
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

  // Listen for user access permissions
  useEffect(() => {
    let isActive = true;
    
    const unlistenPromise = listen<{ access: number }>(`user-access-${serverId}`, (event) => {
      if (!isActive) return;
      setUserAccess(event.payload.access);
      console.log('User access permissions received:', '0x' + event.payload.access.toString(16));
    });

    return () => {
      isActive = false;
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [serverId]);

  // Helper function to check if user has specific permission
  const hasPermission = (bitIndex: number): boolean => {
    // Hotline access bits are indexed from 63 down to 0
    // bitIndex 22 = canDisconnectUsers (bit 63-22 = 41)
    const bit = 63 - bitIndex;
    // Convert to BigInt for 64-bit operations, then back to boolean
    const accessBigInt = BigInt(userAccess);
    const bitMask = BigInt(1) << BigInt(bit);
    return (accessBigInt & bitMask) !== BigInt(0);
  };
  
  // Update connection status based on users - if we have users, we're logged in
  // Use a ref to track if we've already updated to avoid infinite loops
  const statusUpdatedRef = useRef(false);
  useEffect(() => {
    if (users.length > 0 && !statusUpdatedRef.current && (connectionStatus === 'connecting' || connectionStatus === 'connected')) {
      setConnectionStatus('logged-in');
      statusUpdatedRef.current = true;
    }
    // Reset the ref if users list becomes empty
    if (users.length === 0) {
      statusUpdatedRef.current = false;
    }
  }, [users.length, connectionStatus]);

  // Request file list when Files tab is activated or path changes
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isServerUnresponsive, setIsServerUnresponsive] = useState(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Synchronous guard — set immediately in onPathChange, reset only when file list arrives.
  // Using a ref so it takes effect within the same event loop tick, unlike isLoadingFiles state.
  const navigationBlockedRef = useRef(false);
  // Set to true by handleFileListReceived; tells useEffect([files]) it's safe to release guard
  const serverRespondedRef = useRef(false);
  // Path we navigated FROM, used to restore on cancel
  const previousPathRef = useRef<string[]>([]);

  const pathsEqual = (a: string[], b: string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

  const handleFileListReceived = (path: string[]) => {
    if (pathsEqual(path, currentPathRef.current)) {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      // Signal useEffect([files]) to release guard on next render
      serverRespondedRef.current = true;
    }
  };

  // Release navigation guard only after the SERVER responds and files actually render.
  // Cache hits also call setFiles, so we use serverRespondedRef to distinguish them.
  useEffect(() => {
    if (serverRespondedRef.current) {
      serverRespondedRef.current = false;
      navigationBlockedRef.current = false;
      setIsLoadingFiles(false);
      setIsServerUnresponsive(false);
    }
  }, [files]);

  const handleWaitForServer = () => {
    setIsServerUnresponsive(false);
    // Give 30 more seconds before asking again
    loadingTimeoutRef.current = setTimeout(() => {
      setIsServerUnresponsive(true);
      loadingTimeoutRef.current = null;
    }, 30_000);
  };

  const handleCancelNavigation = () => {
    setIsServerUnresponsive(false);
    setIsLoadingFiles(false);
    navigationBlockedRef.current = false;
    serverRespondedRef.current = false;
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    // Restore path we navigated from
    const prevPath = previousPathRef.current;
    currentPathRef.current = prevPath;
    setCurrentPath(prevPath);
  };

  // Use server events hook (handles all event listeners)
  useServerEvents({
    serverId,
    serverName,
    setMessages, // Used for receiving chat messages from server
    setUsers,
    setFiles,
    setBoardPosts,
    setPrivateMessageHistory,
    setUnreadCounts,
    setDownloadProgress,
    setUploadProgress,
    setAgreementText,
    setConnectionStatus,
    setFileCache,
    currentPathRef,
    parseUserFlags,
    enablePrivateMessaging,
    addTransfer,
    updateTransfer,
    onFileListReceived: handleFileListReceived,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: '1',
      modifiers: { meta: true },
      description: 'Switch to Chat tab',
      action: () => setActiveTab('chat'),
      enabled: connectionStatus === 'logged-in',
    },
    {
      key: '2',
      modifiers: { meta: true },
      description: 'Switch to Board tab',
      action: () => setActiveTab('board'),
      enabled: connectionStatus === 'logged-in',
    },
    {
      key: '3',
      modifiers: { meta: true },
      description: 'Switch to News tab',
      action: () => setActiveTab('news'),
      enabled: connectionStatus === 'logged-in',
    },
    {
      key: '4',
      modifiers: { meta: true },
      description: 'Switch to Files tab',
      action: () => setActiveTab('files'),
      enabled: connectionStatus === 'logged-in',
    },
    {
      key: 'Escape',
      description: 'Close dialogs',
      action: () => {
        if (messageDialogUser) {
          setMessageDialogUser(null);
        }
        if (userInfoDialogUser) {
          setUserInfoDialogUser(null);
        }
      },
    },
  ]);

  // Update ref when currentPath changes
  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    if (activeTab === 'files') {
      // Set loading state immediately to prevent race conditions
      setIsLoadingFiles(true);

      // Safety timeout: if server is slow, ask the user whether to wait or cancel
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      loadingTimeoutRef.current = setTimeout(() => {
        setIsServerUnresponsive(true);
        loadingTimeoutRef.current = null;
      }, 10_000);

      // Check cache first for instant display
      const cached = getFileCache(serverId, currentPath);
      if (cached) {
        setFiles(cached);
      }

      // Always fetch from server to ensure we have the latest data
      // (cache is just for prefetching and instant display)
      invoke('get_file_list', {
        serverId,
        path: currentPath,
      })
        .catch((error) => {
          console.error('Failed to get file list:', error);
          setIsLoadingFiles(false);
          if (loadingTimeoutRef.current) {
            clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
        });
    }

    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [activeTab, currentPath, serverId, getFileCache, setFiles]);


  // Clear cache when disconnecting
  useEffect(() => {
    return () => {
      clearFileCache(serverId);
    };
  }, [serverId, clearFileCache]);

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
          // Update tab title with actual server name
          updateTabTitle(`server-${serverId}`, info.name || serverName);
        } catch (error) {
          console.error('Failed to fetch server info:', error);
        }
      };
      fetchServerInfo();
    }
  }, [serverId, users.length, serverInfo, serverName, updateTabTitle]);


  const handleUserClick = (user: User) => {
    // Open message dialog (chat) directly
    handleOpenMessageDialog(user);
  };
  
  const handleUserRightClick = (user: User, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    
    const items: ContextMenuItem[] = [
      {
        label: 'Message',
        icon: '💬',
        action: () => {
          handleOpenMessageDialog(user);
        },
      },
      { divider: true, label: '', action: () => {} },
      {
        label: 'Get Info',
        icon: 'ℹ️',
        action: () => {
          setUserInfoDialogUser(user);
        },
      },
      { divider: true, label: '', action: () => {} },
      {
        label: `Custom icon: #${user.iconId}`,
        icon: '',
        action: () => {},
        disabled: true,
      },
    ];

    // Add Disconnect option if user has permission
    // canDisconnectUsers is bit 22 (accessIndexToBit(22) = bit 41)
    if (hasPermission(22)) {
      items.push({ divider: true, label: '', action: () => {} });
      items.push({
        label: 'Disconnect',
        icon: '🚫',
        action: async () => {
          if (confirm(`Are you sure you want to disconnect ${user.userName}? They will be disconnected from the server, but may reconnect.`)) {
            try {
              await invoke('disconnect_user', {
                serverId,
                userId: user.userId,
                options: null, // No ban options for now
              });
            } catch (error) {
              console.error('Failed to disconnect user:', error);
            }
          }
        },
      });
    }
    
    showContextMenu(event, items);
  };

  const handleOpenMessageDialog = (user: User) => {
    if (!enablePrivateMessaging) {
      return; // Private messaging is disabled
    }
    // Reset unread count for this user
    setUnreadCounts((prev) => {
      const newCounts = new Map(prev);
      newCounts.delete(user.userId);
      return newCounts;
    });
    // Open the dialog
    setMessageDialogUser(user);
  };

  // Use server handlers hook
  const {
    handleSendMessage,
    handlePostBoard,
    handleDownloadFile,
    handleUploadFile,
    handleSendPrivateMessage,
    handleAcceptAgreement,
    handleDeclineAgreement,
    handleDisconnect,
    handlePostNews,
    handleNavigateNews,
    handleNewsBack,
    handleSelectArticle,
  } = useServerHandlers({
    serverId,
    serverName,
    currentPath,
    downloadFolder,
    setMessage,
    setSending,
    setBoardMessage,
    setPostingBoard,
    setBoardPosts,
    setDownloadProgress,
    setUploadProgress,
    setPrivateMessageHistory,
    setAgreementText,
    setNewsPath,
    setNewsArticles,
    setComposerTitle,
    setComposerBody,
    setShowComposer,
    setPostingNews,
    clearFileCachePath,
    onClose,
  });

  // Permission-gated feature flags
  const canBroadcast = hasPermission(32);
  const canCreateFolder = hasPermission(5);
  const canCreateNewsCategories = hasPermission(34);
  const canDeleteNewsCategories = hasPermission(35);
  const canCreateNewsFolders = hasPermission(36);
  const canDeleteNewsFolders = hasPermission(37);
  const canDeleteNewsArticles = hasPermission(33);

  const handleSendBroadcast = async (msg: string) => {
    try {
      await invoke('send_broadcast', { serverId, message: msg });
    } catch (error) {
      console.error('Failed to send broadcast:', error);
    }
  };

  const handleCreateFolder = async (name: string) => {
    try {
      await invoke('create_folder', { serverId, path: currentPath, name });
      // Refresh file list
      clearFileCachePath(serverId, currentPath);
      invoke('get_file_list', { serverId, path: currentPath }).catch(console.error);
    } catch (error) {
      console.error('Failed to create folder:', error);
      alert(`Failed to create folder: ${error}`);
    }
  };

  const handleCreateNewsCategory = async (name: string) => {
    try {
      await invoke('create_news_category', { serverId, path: newsPath, name });
      // Reload news
      const categories = await invoke<NewsCategory[]>('get_news_categories', { serverId, path: newsPath });
      setNewsCategories(categories);
    } catch (error) {
      console.error('Failed to create news category:', error);
      alert(`Failed to create category: ${error}`);
    }
  };

  const handleCreateNewsFolder = async (name: string) => {
    try {
      await invoke('create_news_folder', { serverId, path: newsPath, name });
      const categories = await invoke<NewsCategory[]>('get_news_categories', { serverId, path: newsPath });
      setNewsCategories(categories);
    } catch (error) {
      console.error('Failed to create news folder:', error);
      alert(`Failed to create folder: ${error}`);
    }
  };

  const handleDeleteNewsItem = async (itemPath: string[]) => {
    try {
      await invoke('delete_news_item', { serverId, path: itemPath });
      // Reload current news path
      if (newsPath.length === 0) {
        const categories = await invoke<NewsCategory[]>('get_news_categories', { serverId, path: newsPath });
        setNewsCategories(categories);
      } else {
        const articles = await invoke<NewsArticle[]>('get_news_articles', { serverId, path: newsPath });
        setNewsArticles(articles);
      }
    } catch (error) {
      console.error('Failed to delete news item:', error);
      alert(`Failed to delete: ${error}`);
    }
  };

  const handleDeleteNewsArticle = async (articleId: number, articlePath: string[]) => {
    try {
      await invoke('delete_news_article', { serverId, path: articlePath, articleId, recursive: false });
      const articles = await invoke<NewsArticle[]>('get_news_articles', { serverId, path: newsPath });
      setNewsArticles(articles);
      setSelectedArticle(null);
      setArticleContent('');
    } catch (error) {
      console.error('Failed to delete news article:', error);
      alert(`Failed to delete article: ${error}`);
    }
  };

  // Wrapper functions for handlers that need additional state
  const handleSendMessageWrapper = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;
    handleSendMessage(e, message, sending);
  };

  const handlePostBoardWrapper = (e: React.FormEvent) => {
    e.preventDefault();
    if (!boardMessage.trim() || postingBoard) return;
    handlePostBoard(e, boardMessage, postingBoard);
  };

  const handleSelectArticleWrapper = async (article: NewsArticle) => {
    await handleSelectArticle(article, setSelectedArticle, setArticleContent);
  };

  const handleNavigateNewsWrapper = (category: NewsCategory) => {
    handleNavigateNews(category);
  };

  const handleNewsBackWrapper = () => {
    handleNewsBack(newsPath);
  };

  const handlePostNewsWrapper = async (e: React.FormEvent) => {
    await handlePostNews(e, newsPath, composerTitle, composerBody, postingNews, selectedArticle?.id ?? 0);
  };

  // Load news when News tab is activated or path changes
  useEffect(() => {
    if (activeTab === 'news') {
      setLoadingNews(true);
      setSelectedArticle(null);
      setArticleContent('');

      // Load categories OR articles based on path (not both!)
      // Empty path = root, load categories
      // Non-empty path = inside a category, load articles
      const loadNews = async () => {
        try {
          if (newsPath.length === 0) {
            // Root path - load categories only
            const categories = await invoke<NewsCategory[]>('get_news_categories', {
              serverId,
              path: newsPath,
            });
            setNewsCategories(categories);
            setNewsArticles([]);
          } else {
            // Inside a category - load articles only
            const articles = await invoke<NewsArticle[]>('get_news_articles', {
              serverId,
              path: newsPath,
            });
            setNewsCategories([]);
            setNewsArticles(articles);
          }
        } catch (error) {
          console.error('Failed to load news:', error);
          setNewsCategories([]);
          setNewsArticles([]);
        } finally {
          setLoadingNews(false);
        }
      };

      loadNews();
    }
  }, [activeTab, newsPath, serverId]);


  return (
    <div className="h-full w-full bg-white dark:bg-gray-900 flex flex-col relative">
      {showServerBanner && <ServerBanner bannerUrl={bannerUrl} serverName={serverName} />}

      <ServerHeader
        serverName={serverName}
        serverInfo={serverInfo}
        users={users}
        connectionStatus={connectionStatus}
        isTls={isTls}
        onDisconnect={handleDisconnect}
        onShowTransfers={() => setShowTransferList(true)}
        onShowNotificationLog={() => setShowNotificationLog(true)}
      />

      {/* Mobile section tabs (above content on mobile) */}
      <MobileTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        users={users}
        onUserClick={handleUserClick}
        onUserRightClick={handleUserRightClick}
        onOpenMessageDialog={handleOpenMessageDialog}
        unreadCounts={unreadCounts}
      />

      {/* Server Agreement Modal */}
      {agreementText && (
        <div
          className={`absolute inset-0 z-50 flex items-center justify-center transition-all duration-300 ease-in-out ${
            agreementDismissing || !agreementVisible ? 'bg-black/0 backdrop-blur-none' : 'bg-black/60 backdrop-blur-sm'
          }`}
        >
          <div
            className={`bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-6 flex flex-col max-h-[80vh] transition-all duration-300 ease-in-out ${
              agreementDismissing || !agreementVisible ? 'opacity-0 scale-95 translate-y-2' : 'opacity-100 scale-100 translate-y-0'
            }`}
          >
            <div className="flex justify-center pt-6 px-6 h-[84px] items-center">
              {bannerUrl && (
                <img
                  src={bannerUrl}
                  alt="Server Banner"
                  className="max-w-full h-auto max-h-[60px] rounded-lg"
                  style={{ imageRendering: 'auto' }}
                />
              )}
            </div>
            <div className="px-6 pt-5 pb-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Server Agreement</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <pre className="text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                <Linkify text={agreementText} />
              </pre>
            </div>
            <div className="flex gap-3 justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setAgreementDismissing(true);
                  setTimeout(() => { setAgreementText(null); setAgreementDismissing(false); handleDeclineAgreement(); }, 300);
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm font-medium"
              >
                Decline
              </button>
              <button
                onClick={() => {
                  setAgreementDismissing(true);
                  setTimeout(() => { setAgreementText(null); setAgreementDismissing(false); handleAcceptAgreement(); }, 300);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors text-sm font-medium"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <ServerSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          users={users}
          onUserClick={handleUserClick}
          onUserRightClick={handleUserRightClick}
          onOpenMessageDialog={handleOpenMessageDialog}
          unreadCounts={unreadCounts}
        />

        {/* Main area with content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
          {/* Chat view */}
          {activeTab === 'chat' && (
            <ChatTab
              serverName={serverName}
              messages={messages}
              message={message}
              sending={sending}
              bannerUrl={bannerUrl}
              agreementText={agreementText}
              canBroadcast={canBroadcast}
              onMessageChange={setMessage}
              onSendMessage={handleSendMessageWrapper}
              onSendBroadcast={handleSendBroadcast}
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
              onPostBoard={handlePostBoardWrapper}
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
              canCreateCategory={canCreateNewsCategories}
              canDeleteCategory={canDeleteNewsCategories}
              canCreateFolder={canCreateNewsFolders}
              canDeleteFolder={canDeleteNewsFolders}
              canDeleteArticle={canDeleteNewsArticles}
              onNewsPathChange={setNewsPath}
              onNewsBack={handleNewsBackWrapper}
              onNavigateNews={handleNavigateNewsWrapper}
              onSelectArticle={handleSelectArticleWrapper}
              onClearSelectedArticle={() => setSelectedArticle(null)}
              onToggleComposer={() => setShowComposer(!showComposer)}
              onComposerTitleChange={setComposerTitle}
              onComposerBodyChange={setComposerBody}
              onPostNews={handlePostNewsWrapper}
              onCreateCategory={handleCreateNewsCategory}
              onCreateFolder={handleCreateNewsFolder}
              onDeleteItem={handleDeleteNewsItem}
              onDeleteArticle={handleDeleteNewsArticle}
            />
          )}

          {/* Files view */}
          {activeTab === 'files' && (
            <FilesTab
              serverId={serverId}
              files={files}
              currentPath={currentPath}
              downloadProgress={downloadProgress}
              uploadProgress={uploadProgress}
              isLoading={isLoadingFiles}
              onPathChange={(path) => {
                if (!navigationBlockedRef.current) {
                  navigationBlockedRef.current = true;
                  serverRespondedRef.current = false; // cancel stale pending guard release
                  previousPathRef.current = currentPath; // save for cancel
                  currentPathRef.current = path;
                  setCurrentPath(path);
                }
              }}
              isServerUnresponsive={isServerUnresponsive}
              onWaitForServer={handleWaitForServer}
              onCancelNavigation={handleCancelNavigation}
              canCreateFolder={canCreateFolder}
              onCreateFolder={handleCreateFolder}
              onDownloadFile={handleDownloadFile}
              onUploadFile={handleUploadFile}
              onRefresh={() => {
                // Clear cache for current path and fetch fresh data
                clearFileCachePath(serverId, currentPath);
                // Fetch fresh data
                invoke('get_file_list', {
                  serverId,
                  path: currentPath,
                }).catch((error) => {
                  console.error('Failed to refresh file list:', error);
                });
              }}
              getAllCachedFiles={() => {
                // Get all cached files from all paths
                const cache = useAppStore.getState().fileCache.get(serverId);
                if (!cache) return [];
                
                const allFiles: Array<{ file: FileItem; path: string[] }> = [];
                for (const [pathKey, cachedFiles] of cache.entries()) {
                  // Filter out empty path keys and handle root path
                  const path = pathKey && pathKey.trim() ? pathKey.split('/').filter((p: string) => p) : [];
                  for (const file of cachedFiles) {
                    allFiles.push({ file, path });
                  }
                }
                return allFiles;
              }}
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
          enablePrivateMessaging={enablePrivateMessaging}
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

      {/* Transfer List */}
      {showTransferList && (
        <TransferList
          serverId={serverId}
          serverName={serverName}
          onClose={() => setShowTransferList(false)}
        />
      )}

      {/* Notification Log */}
      {showNotificationLog && (
        <NotificationLog onClose={() => setShowNotificationLog(false)} />
      )}

      {/* Context menu */}
      <ContextMenuRenderer
        contextMenu={contextMenu}
        onClose={hideContextMenu}
      />
    </div>
  );
}
