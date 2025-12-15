import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { ConnectionStatus } from '../../../types';
import type { ChatMessage, FileItem, User } from '../serverTypes';
import { useSound } from '../../../hooks/useSound';
import { useAppStore } from '../../../stores/appStore';
import { usePreferencesStore } from '../../../stores/preferencesStore';
import { showNotification } from '../../../stores/notificationStore';
import { containsMention } from '../../../utils/mentions';

interface UseServerEventsProps {
  serverId: string;
  serverName: string;
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  setFiles: React.Dispatch<React.SetStateAction<FileItem[]>>;
  setBoardPosts: React.Dispatch<React.SetStateAction<string[]>>;
  setPrivateMessageHistory: React.Dispatch<React.SetStateAction<Map<number, any[]>>>;
  setUnreadCounts: React.Dispatch<React.SetStateAction<Map<number, number>>>;
  setDownloadProgress: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  setUploadProgress: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  setAgreementText: React.Dispatch<React.SetStateAction<string | null>>;
  setConnectionStatus: React.Dispatch<React.SetStateAction<ConnectionStatus>>;
  setFileCache: (serverId: string, path: string[], files: FileItem[]) => void;
  currentPathRef: React.MutableRefObject<string[]>;
  parseUserFlags: (flags: number) => { isAdmin: boolean; isIdle: boolean };
  enablePrivateMessaging: boolean;
  addTransfer: (transfer: any) => void;
  updateTransfer: (id: string, updates: Partial<any>) => void;
  onFileListReceived?: (path: string[]) => void;
}

export function useServerEvents({
  serverId,
  serverName,
  setMessages,
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
  onFileListReceived,
}: UseServerEventsProps) {
  const sounds = useSound();
  const soundsRef = useRef(sounds);
  const usersRef = useRef<User[]>([]);
  const { updateTabUnread } = useAppStore();
  const { username } = usePreferencesStore();
  
  // Helper to check if this server's tab is active
  const isTabActive = () => {
    const state = useAppStore.getState();
    const tab = state.tabs.find(t => t.type === 'server' && t.serverId === serverId);
    return tab?.id === state.activeTabId;
  };
  
  // Helper to increment unread count for this server's tab
  const incrementUnread = () => {
    const state = useAppStore.getState();
    const tab = state.tabs.find(t => t.type === 'server' && t.serverId === serverId);
    if (tab && !isTabActive()) {
      updateTabUnread(tab.id, tab.unreadCount + 1);
    }
  };
  
  // Keep sounds ref up to date
  useEffect(() => {
    soundsRef.current = sounds;
  }, [sounds]);

  // Listen for incoming chat messages
  useEffect(() => {
    let isActive = true;
    
    const unlistenPromise = listen<ChatMessage>(`chat-message-${serverId}`, (event) => {
      if (!isActive) return; // Prevent processing if effect has been cleaned up
      
      // Check if message contains a mention of the current user
      const isMention = containsMention(event.payload.message, username);
      
      const messageData = {
        ...event.payload,
        timestamp: new Date(),
        isMention,
      };
      
      setMessages((prev) => [...prev, messageData]);
      soundsRef.current.playChatSound();
      
      // If message contains mention and tab is not active, notify
      if (isMention && !isTabActive()) {
        incrementUnread();
        showNotification.info(
          `@${username} mentioned you in chat`,
          `Mention from ${event.payload.userName}`,
          undefined,
          serverName
        );
      } else if (!isTabActive()) {
        // Increment unread count for regular messages if tab is not active
        incrementUnread();
      }
    });

    return () => {
      isActive = false;
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [serverId, setMessages, username]);

  // Listen for broadcast messages
  useEffect(() => {
    let isActive = true;
    
    const unlistenPromise = listen<{ message: string }>(`broadcast-message-${serverId}`, (event) => {
      if (!isActive) return;
      
      const broadcastMsg = event.payload.message;
      setMessages((prev) => [
        ...prev,
        {
          userId: 0,
          userName: 'Server',
          message: broadcastMsg,
          timestamp: new Date(),
        },
      ]);
      soundsRef.current.playServerMessageSound();
    });

    return () => {
      isActive = false;
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [serverId, setMessages]);

  // Listen for file list events
  useEffect(() => {
    const unlisten = listen<{ files: FileItem[]; path: string[] }>(`file-list-${serverId}`, (event) => {
      const { files, path } = event.payload;
      
      // Only update UI if this is for the current path
      if (path.join('/') === currentPathRef.current.join('/')) {
        setFiles(files);
        // Notify that file list was received for current path
        if (onFileListReceived) {
          onFileListReceived(path);
        }
      }
      
      // Always cache the file list
      setFileCache(serverId, path, files);
    });

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, setFiles, setFileCache, currentPathRef, onFileListReceived]);

  // Listen for new message board posts
  useEffect(() => {
    const unlisten = listen<{ message: string }>(`message-board-post-${serverId}`, (event) => {
      setBoardPosts((prev) => [...prev, event.payload.message]);
    });

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, setBoardPosts]);

  // Sync usersRef when users are initially loaded or updated
  // We'll update the ref in the user event handlers, but also need to handle initial load
  // The ref will be updated in the join/leave/change handlers below

  // Listen for user events
  useEffect(() => {
    let isActive = true;
    
    const unlistenJoinPromise = listen<{ userId: number; userName: string; iconId: number; flags: number }>(
      `user-joined-${serverId}`,
      (event) => {
        if (!isActive) return;
        
        // Check if user already exists before updating state
        const currentUsers = usersRef.current;
        const userExists = currentUsers.some(u => u.userId === event.payload.userId);
        
        if (userExists) {
          // User already exists, skip (e.g., during initial load or user update)
          return;
        }
        
        const { isAdmin, isIdle } = parseUserFlags(event.payload.flags);
        
        // Add user to list
        // Note: This handler is primarily for initial user list load from GetUserNameList reply
        // For actual new user joins, we rely on the user-changed handler which receives NotifyUserChange
        setUsers((prev) => {
          // Double-check user doesn't exist (race condition protection)
          if (prev.some(u => u.userId === event.payload.userId)) {
            return prev;
          }
          
          const updated = [...prev, {
            userId: event.payload.userId,
            userName: event.payload.userName,
            iconId: event.payload.iconId,
            flags: event.payload.flags,
            isAdmin,
            isIdle,
          }];
          usersRef.current = updated;
          return updated;
        });
        
        // Don't show join messages here - this is for initial load
        // Join messages are handled by the user-changed handler for actual new user joins
      }
    );

    const unlistenLeavePromise = listen<{ userId: number }>(
      `user-left-${serverId}`,
      (event) => {
        if (!isActive) return;
        
        // Get username before removing user (check current users ref)
        const currentUsers = usersRef.current;
        const userToRemove = currentUsers.find(u => u.userId === event.payload.userId);
        
        if (!userToRemove) {
          // User not found, nothing to remove
          return;
        }
        
        const userName = userToRemove.userName;
        
        // Remove user from list
        setUsers((prev) => {
          const updated = prev.filter(u => u.userId !== event.payload.userId);
          usersRef.current = updated;
          return updated;
        });
        
        // Add leave message to chat (always show leave messages)
        setMessages((prevMessages) => [...prevMessages, {
          userId: event.payload.userId,
          userName: userName,
          message: `${userName} left`,
          timestamp: new Date(),
          type: 'left',
        }]);
        
        soundsRef.current.playLeaveSound();
      }
    );

    const unlistenChangePromise = listen<{ userId: number; userName: string; iconId: number; flags: number }>(
      `user-changed-${serverId}`,
      (event) => {
        if (!isActive) return;
        
        // Check if user already exists before updating state
        const currentUsers = usersRef.current;
        const prevLength = currentUsers.length;
        
        setUsers((prev) => {
          const existingIndex = prev.findIndex(u => u.userId === event.payload.userId);
          
          if (existingIndex >= 0) {
            // User exists, update them (like Swift: self.users[i] = User(hotlineUser: user))
            const updated = prev.map(u =>
              u.userId === event.payload.userId
                ? {
                    userId: event.payload.userId,
                    userName: event.payload.userName,
                    iconId: event.payload.iconId,
                    flags: event.payload.flags,
                    ...parseUserFlags(event.payload.flags),
                  }
                : u
            );
            usersRef.current = updated;
            return updated;
          } else {
            // User doesn't exist, add them as new user (like Swift: self.users.append(User(hotlineUser: user)))
            const { isAdmin, isIdle } = parseUserFlags(event.payload.flags);
            const updated = [...prev, {
              userId: event.payload.userId,
              userName: event.payload.userName,
              iconId: event.payload.iconId,
              flags: event.payload.flags,
              isAdmin,
              isIdle,
            }];
            usersRef.current = updated;
            
            // Show join message for new users (Swift client shows join messages unconditionally)
            setMessages((prevMessages) => [...prevMessages, {
              userId: event.payload.userId,
              userName: event.payload.userName,
              message: `${event.payload.userName} joined`,
              timestamp: new Date(),
              type: 'joined',
            }]);
            
            // Only play sound if users list was not empty (to avoid sound spam during initial load)
            if (prevLength > 0) {
              soundsRef.current.playJoinSound();
            }
            
            return updated;
          }
        });
      }
    );

    return () => {
      isActive = false;
      unlistenJoinPromise.then((fn) => fn()).catch(() => {});
      unlistenLeavePromise.then((fn) => fn()).catch(() => {});
      unlistenChangePromise.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, setUsers, setMessages, parseUserFlags]);

  // Listen for private messages
  useEffect(() => {
    if (!enablePrivateMessaging) {
      return; // Private messaging is disabled, don't listen for messages
    }
    
    let isActive = true;
    
    const unlistenPromise = listen<{ userId: number; message: string }>(
      `private-message-${serverId}`,
      (event) => {
        if (!isActive) return;
        
        const { userId, message } = event.payload;

        soundsRef.current.playPrivateMessageSound();
        
        // Look up user name - try ref first, then fallback to querying state
        let user = usersRef.current.find(u => u.userId === userId);
        let userName = user?.userName;
        
        // If not found in ref, try to get from current users state
        if (!userName) {
          // Use a callback to get current users
          setUsers((prev) => {
            const foundUser = prev.find(u => u.userId === userId);
            if (foundUser) {
              userName = foundUser.userName;
              usersRef.current = prev; // Sync ref
            }
            return prev; // Don't modify state
          });
        }
        
        const displayName = userName || `User ${userId}`;
        
        // Show notification for private message
        showNotification.info(
          message,
          `Private message from ${displayName}`,
          undefined,
          serverName
        );

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

        setUnreadCounts((prev) => {
          const newCounts = new Map(prev);
          newCounts.set(userId, (newCounts.get(userId) || 0) + 1);
          return newCounts;
        });
        
        // Increment tab unread count if tab is not active
        if (!isTabActive()) {
          incrementUnread();
        }
      }
    );

    return () => {
      isActive = false;
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [serverId, setPrivateMessageHistory, setUnreadCounts, enablePrivateMessaging, setUsers]);

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen<{ fileName: string; bytesRead: number; totalBytes: number; progress: number }>(
      `download-progress-${serverId}`,
      (event) => {
        const { fileName, bytesRead, totalBytes, progress } = event.payload;
        setDownloadProgress((prev) => new Map(prev).set(fileName, progress));
        
        // Track transfer
        const transferId = `${serverId}-download-${fileName}`;
        const existingTransfer = useAppStore.getState().transfers.find((t) => t.id === transferId);
        
        if (!existingTransfer) {
          addTransfer({
            id: transferId,
            serverId,
            type: 'download',
            fileName,
            fileSize: totalBytes || 0,
            transferred: bytesRead || 0,
            speed: 0,
            status: 'active',
            startTime: new Date(),
          });
        } else {
          updateTransfer(transferId, {
            transferred: bytesRead || 0,
            fileSize: totalBytes || existingTransfer.fileSize || 0,
          });
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, setDownloadProgress, addTransfer, updateTransfer]);

  // Listen for upload progress events
  useEffect(() => {
    const unlisten = listen<{ fileName: string; bytesSent: number; totalBytes: number; progress: number }>(
      `upload-progress-${serverId}`,
      (event) => {
        const { fileName, bytesSent, totalBytes, progress } = event.payload;
        setUploadProgress((prev) => new Map(prev).set(fileName, progress));
        
        // Track transfer
        const transferId = `${serverId}-upload-${fileName}`;
        const existingTransfer = useAppStore.getState().transfers.find((t) => t.id === transferId);
        
        if (!existingTransfer) {
          addTransfer({
            id: transferId,
            serverId,
            type: 'upload',
            fileName,
            fileSize: totalBytes || 0,
            transferred: bytesSent || 0,
            speed: 0,
            status: 'active',
            startTime: new Date(),
          });
        } else {
          updateTransfer(transferId, {
            transferred: bytesSent || 0,
            fileSize: totalBytes || existingTransfer.fileSize || 0,
          });
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, setUploadProgress, addTransfer, updateTransfer]);

  // Listen for download/upload complete and error events
  useEffect(() => {
    const unlistenDownloadComplete = listen<{ fileName: string }>(
      `download-complete-${serverId}`,
      (event) => {
        setDownloadProgress((prev) => {
          const next = new Map(prev);
          next.delete(event.payload.fileName);
          return next;
        });
        
        // Mark transfer as completed
        const transferId = `${serverId}-download-${event.payload.fileName}`;
        updateTransfer(transferId, {
          status: 'completed',
          endTime: new Date(),
        });
        
        // Show notification
        showNotification.success(
          `Download complete: ${event.payload.fileName}`,
          'Download Complete',
          undefined,
          serverName
        );
        soundsRef.current.playFileTransferCompleteSound();
      }
    );

    const unlistenUploadComplete = listen<{ fileName: string }>(
      `upload-complete-${serverId}`,
      (event) => {
        setUploadProgress((prev) => {
          const next = new Map(prev);
          next.delete(event.payload.fileName);
          return next;
        });
        
        // Mark transfer as completed
        const transferId = `${serverId}-upload-${event.payload.fileName}`;
        updateTransfer(transferId, {
          status: 'completed',
          endTime: new Date(),
        });
        
        // Show notification
        showNotification.success(
          `Upload complete: ${event.payload.fileName}`,
          'Upload Complete',
          undefined,
          serverName
        );
        soundsRef.current.playFileTransferCompleteSound();
      }
    );

    const unlistenDownloadError = listen<{ fileName: string; error: string }>(
      `download-error-${serverId}`,
      (event) => {
        setDownloadProgress((prev) => {
          const next = new Map(prev);
          next.delete(event.payload.fileName);
          return next;
        });
        
        // Mark transfer as failed
        const transferId = `${serverId}-download-${event.payload.fileName}`;
        updateTransfer(transferId, {
          status: 'failed',
          error: event.payload.error,
          endTime: new Date(),
        });
        
        // Show notification
        showNotification.error(
          `Download failed: ${event.payload.fileName}\n${event.payload.error}`,
          'Download Error',
          undefined,
          serverName
        );
        soundsRef.current.playErrorSound();
      }
    );

    const unlistenUploadError = listen<{ fileName: string; error: string }>(
      `upload-error-${serverId}`,
      (event) => {
        setUploadProgress((prev) => {
          const next = new Map(prev);
          next.delete(event.payload.fileName);
          return next;
        });
        
        // Mark transfer as failed
        const transferId = `${serverId}-upload-${event.payload.fileName}`;
        updateTransfer(transferId, {
          status: 'failed',
          error: event.payload.error,
          endTime: new Date(),
        });
        
        // Show notification
        showNotification.error(
          `Upload failed: ${event.payload.fileName}\n${event.payload.error}`,
          'Upload Error',
          undefined,
          serverName
        );
        soundsRef.current.playErrorSound();
      }
    );

    return () => {
      unlistenDownloadComplete.then((fn) => fn()).catch(() => {});
      unlistenUploadComplete.then((fn) => fn()).catch(() => {});
      unlistenDownloadError.then((fn) => fn()).catch(() => {});
      unlistenUploadError.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, sounds, setDownloadProgress, setUploadProgress, updateTransfer]);

  // Listen for connection status changes
  useEffect(() => {
    const unlisten = listen<{ status: ConnectionStatus }>(
      `status-changed-${serverId}`,
      (event) => {
        const newStatus = event.payload.status;
        setConnectionStatus(newStatus);
        if (newStatus === 'logged-in') {
          soundsRef.current.playLoggedInSound();
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, sounds, setConnectionStatus]);

  // Listen for agreement required events
  useEffect(() => {
    const unlisten = listen<{ agreement: string }>(`agreement-required-${serverId}`, (event) => {
      const agreement = event.payload.agreement;
      console.log('✅ Received agreement-required event, agreement length:', agreement.length);
      setAgreementText(agreement);
    });

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, setAgreementText]);
}

