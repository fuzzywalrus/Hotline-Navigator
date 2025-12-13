import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { ConnectionStatus } from '../../../types';
import type { ChatMessage, FileItem, User } from '../serverTypes';
import { useSound } from '../../../hooks/useSound';
import { useAppStore } from '../../../stores/appStore';

interface UseServerEventsProps {
  serverId: string;
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

  // Listen for incoming chat messages
  useEffect(() => {
    const unlisten = listen<ChatMessage>(`chat-message-${serverId}`, (event) => {
      setMessages((prev) => [...prev, {
        ...event.payload,
        timestamp: new Date(),
      }]);
      sounds.playChatSound();
    });

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, sounds, setMessages]);

  // Listen for broadcast messages
  useEffect(() => {
    const unlisten = listen<{ message: string }>(`broadcast-message-${serverId}`, (event) => {
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
      sounds.playServerMessageSound();
    });

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, sounds, setMessages]);

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

  // Listen for user events
  useEffect(() => {
    const unlistenJoin = listen<{ userId: number; userName: string; iconId: number; flags: number }>(
      `user-joined-${serverId}`,
      (event) => {
        setUsers((prev) => {
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
        sounds.playJoinSound();
      }
    );

    const unlistenLeave = listen<{ userId: number }>(
      `user-left-${serverId}`,
      (event) => {
        setUsers((prev) => prev.filter(u => u.userId !== event.payload.userId));
        sounds.playLeaveSound();
      }
    );

    const unlistenChange = listen<{ userId: number; userName: string; iconId: number; flags: number }>(
      `user-changed-${serverId}`,
      (event) => {
        setUsers((prev) => prev.map(u =>
          u.userId === event.payload.userId
            ? {
                userId: event.payload.userId,
                userName: event.payload.userName,
                iconId: event.payload.iconId,
                flags: event.payload.flags,
                ...parseUserFlags(event.payload.flags),
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
  }, [serverId, sounds, setUsers, parseUserFlags]);

  // Listen for private messages
  useEffect(() => {
    if (!enablePrivateMessaging) {
      return; // Private messaging is disabled, don't listen for messages
    }
    
    const unlisten = listen<{ userId: number; message: string }>(
      `private-message-${serverId}`,
      (event) => {
        const { userId, message } = event.payload;

        sounds.playPrivateMessageSound();

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
      }
    );

    return () => {
      unlisten.then((fn) => fn()).catch(() => {});
    };
  }, [serverId, sounds, setPrivateMessageHistory, setUnreadCounts, enablePrivateMessaging]);

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
          sounds.playLoggedInSound();
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

