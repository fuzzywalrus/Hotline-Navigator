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
import TransferList from '../transfers/TransferList';
import NotificationLog from '../notifications/NotificationLog';
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
  const { setFileCache, getFileCache, clearFileCache, clearFileCachePath, addTransfer, updateTransfer } = useAppStore();
  const { fileCacheDepth, enablePrivateMessaging } = usePreferencesStore();
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
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');

  // Debug: log when bannerUrl changes
  useEffect(() => {
    if (bannerUrl) {
      console.log('🎨 Banner URL state updated:', bannerUrl);
    } else {
      console.log('🎨 Banner URL state is null');
    }
  }, [bannerUrl]);

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
  
  const handleFileListReceived = (path: string[]) => {
    // Clear loading state when file list arrives for the current path
    if (JSON.stringify(path) === JSON.stringify(currentPath)) {
      setIsLoadingFiles(false);
    }
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
        });
    }
  }, [activeTab, currentPath, serverId, getFileCache, setFiles]);

  // Pre-fetch file listings when connected
  useEffect(() => {
    if (users.length > 0 && fileCacheDepth > 0) {
      let cancelled = false;
      
      const prefetchFiles = async (path: string[], depth: number): Promise<void> => {
        if (depth < 0 || cancelled) return;

        // Check if already cached
        const cached = getFileCache(serverId, path);
        if (cached) {
          // Already cached, recurse into folders
          for (const file of cached) {
            if (file.isFolder && !cancelled) {
              await prefetchFiles([...path, file.name], depth - 1);
            }
          }
          return;
        }

        // Fetch this path and wait for the event
        try {
          await invoke('get_file_list', {
            serverId,
            path,
          });
          
          // Wait for the file list event to arrive and be cached
          let attempts = 0;
          while (attempts < 50 && !cancelled) {
            await new Promise(resolve => setTimeout(resolve, 50));
            const cached = getFileCache(serverId, path);
            if (cached) {
              // Now recurse into folders
              for (const file of cached) {
                if (file.isFolder && !cancelled) {
                  await prefetchFiles([...path, file.name], depth - 1);
                }
              }
              return;
            }
            attempts++;
          }
        } catch (error) {
          console.error(`Failed to prefetch files at ${path.join('/')}:`, error);
        }
      };

      // Start prefetching from root
      prefetchFiles([], fileCacheDepth).catch(console.error);

      return () => {
        cancelled = true;
      };
    }
  }, [serverId, users.length, fileCacheDepth, getFileCache]);

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
        } catch (error) {
          console.error('Failed to fetch server info:', error);
        }
      };
      fetchServerInfo();
    }
  }, [serverId, users.length, serverInfo]);


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
    await handlePostNews(e, newsPath, composerTitle, composerBody, postingNews);
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


  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
      <ServerBanner bannerUrl={bannerUrl} serverName={serverName} />

      <ServerHeader
        serverName={serverName}
        serverInfo={serverInfo}
        users={users}
        connectionStatus={connectionStatus}
        onDisconnect={handleDisconnect}
        onShowTransfers={() => setShowTransferList(true)}
        onShowNotificationLog={() => setShowNotificationLog(true)}
      />

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
              onSendMessage={handleSendMessageWrapper}
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
              onNewsPathChange={setNewsPath}
              onNewsBack={handleNewsBackWrapper}
              onNavigateNews={handleNavigateNewsWrapper}
              onSelectArticle={handleSelectArticleWrapper}
              onToggleComposer={() => setShowComposer(!showComposer)}
              onComposerTitleChange={setComposerTitle}
              onComposerBodyChange={setComposerBody}
              onPostNews={handlePostNewsWrapper}
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
                if (!isLoadingFiles) {
                  setCurrentPath(path);
                }
              }}
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
