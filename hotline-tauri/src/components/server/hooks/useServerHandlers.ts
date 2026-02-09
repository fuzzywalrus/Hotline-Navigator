import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import type { NewsArticle } from '../serverTypes';
import { useSound } from '../../../hooks/useSound';
import { showNotification, useNotificationStore } from '../../../stores/notificationStore';

interface UseServerHandlersProps {
  serverId: string;
  serverName: string;
  currentPath: string[];
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  setSending: React.Dispatch<React.SetStateAction<boolean>>;
  setBoardMessage: React.Dispatch<React.SetStateAction<string>>;
  setPostingBoard: React.Dispatch<React.SetStateAction<boolean>>;
  setBoardPosts: React.Dispatch<React.SetStateAction<string[]>>;
  setDownloadProgress: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  setUploadProgress: React.Dispatch<React.SetStateAction<Map<string, number>>>;
  setPrivateMessageHistory: React.Dispatch<React.SetStateAction<Map<number, any[]>>>;
  setAgreementText: React.Dispatch<React.SetStateAction<string | null>>;
  setNewsPath: React.Dispatch<React.SetStateAction<string[]>>;
  setNewsArticles: React.Dispatch<React.SetStateAction<NewsArticle[]>>;
  setComposerTitle: React.Dispatch<React.SetStateAction<string>>;
  setComposerBody: React.Dispatch<React.SetStateAction<string>>;
  setShowComposer: React.Dispatch<React.SetStateAction<boolean>>;
  setPostingNews: React.Dispatch<React.SetStateAction<boolean>>;
  clearFileCachePath: (serverId: string, path: string[]) => void;
  onClose: () => void;
}

export function useServerHandlers({
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
}: UseServerHandlersProps) {
  const sounds = useSound();

  const handleSendMessage = async (e: React.FormEvent, message: string, sending: boolean) => {
    e.preventDefault();
    if (!message.trim() || sending) return;

    const messageText = message.trim();
    setSending(true);
    try {
      await invoke('send_chat_message', {
        serverId,
        message: messageText,
      });

      // Don't add message locally - wait for server echo to avoid duplicates
      // The server will echo the message back as a ChatMessage event
      setMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      showNotification.error(
        `Failed to send message: ${error}`,
        'Message Error',
        undefined,
        serverName
      );
    } finally {
      setSending(false);
    }
  };

  const handlePostBoard = async (e: React.FormEvent, boardMessage: string, postingBoard: boolean) => {
    e.preventDefault();
    if (!boardMessage.trim() || postingBoard) return;

    const messageText = boardMessage.trim();
    setPostingBoard(true);
    try {
      await invoke('post_message_board', {
        serverId,
        message: messageText,
      });

      const posts = await invoke<string[]>('get_message_board', {
        serverId,
      });
      setBoardPosts(posts);

      setBoardMessage('');
    } catch (error) {
      console.error('Failed to post to board:', error);
      showNotification.error(
        `Failed to post to board: ${error}`,
        'Post Error',
        undefined,
        serverName
      );
    } finally {
      setPostingBoard(false);
    }
  };

  const handleDownloadFile = async (fileName: string, fileSize: number) => {
    try {
      setDownloadProgress((prev) => new Map(prev).set(fileName, 0));

      const result = await invoke<string>('download_file', {
        serverId,
        path: currentPath,
        fileName,
        fileSize,
      });

      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(fileName);
        return next;
      });

      // Extract file path from result string "Downloaded to: <path>"
      const filePath = result.replace(/^Downloaded to:\s*/, '').trim();

      const isIOS = typeof window !== 'undefined' && (
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      );

      if (isIOS) {
        useNotificationStore.getState().addNotification({
          type: 'success',
          message: `${fileName} saved to app storage`,
          title: 'Download Complete',
          serverName,
          duration: 8000,
          action: {
            label: 'View File',
            onClick: () => {
              openPath(filePath).catch((err) =>
                console.error('Failed to open file:', err)
              );
            },
          },
        });
      } else {
        showNotification.success(
          result,
          'Download Complete',
          undefined,
          serverName
        );
      }
      sounds.playFileTransferCompleteSound();
    } catch (error) {
      console.error('Download failed:', error);
      sounds.playErrorSound();

      setDownloadProgress((prev) => {
        const next = new Map(prev);
        next.delete(fileName);
        return next;
      });

      showNotification.error(
        `Download failed: ${error}`,
        'Download Error',
        undefined,
        serverName
      );
    }
  };

  const handleUploadFile = async (file: File) => {
    try {
      const fileName = file.name;
      setUploadProgress((prev) => new Map(prev).set(fileName, 0));

      const arrayBuffer = await file.arrayBuffer();
      const fileData = Array.from(new Uint8Array(arrayBuffer));

      await invoke('upload_file', {
        serverId,
        path: currentPath,
        fileName,
        fileData,
      });

      setUploadProgress((prev) => {
        const next = new Map(prev);
        next.delete(fileName);
        return next;
      });

      clearFileCachePath(serverId, currentPath);
      await invoke('get_file_list', {
        serverId,
        path: currentPath,
      });

      showNotification.success(
        `Upload complete: ${fileName}`,
        'Upload Complete',
        undefined,
        serverName
      );
      sounds.playFileTransferCompleteSound();
    } catch (error) {
      console.error('Upload failed:', error);
      sounds.playErrorSound();

      setUploadProgress((prev) => {
        const next = new Map(prev);
        next.delete(file.name);
        return next;
      });

      showNotification.error(
        `Upload failed: ${error}`,
        'Upload Error',
        undefined,
        serverName
      );
    }
  };

  const handleSendPrivateMessage = async (userId: number, message: string) => {
    try {
      await invoke('send_private_message', {
        serverId,
        userId,
        message,
      });

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

  const handleAcceptAgreement = async () => {
    try {
      await invoke('accept_agreement', { serverId });
      setAgreementText(null);
    } catch (error) {
      console.error('Failed to accept agreement:', error);
      showNotification.error(
        `Failed to accept agreement: ${error}`,
        'Agreement Error',
        undefined,
        serverName
      );
    }
  };

  const handleDeclineAgreement = () => {
    setAgreementText(null);
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

  const handlePostNews = async (
    e: React.FormEvent,
    newsPath: string[],
    composerTitle: string,
    composerBody: string,
    postingNews: boolean
  ) => {
    e.preventDefault();
    if (!composerTitle.trim() || !composerBody.trim() || postingNews) return;

    setPostingNews(true);
    try {
      await invoke('post_news_article', {
        serverId,
        path: newsPath,
        title: composerTitle.trim(),
        body: composerBody.trim(),
      });

      setComposerTitle('');
      setComposerBody('');
      setShowComposer(false);

      const articles = await invoke<NewsArticle[]>('get_news_articles', {
        serverId,
        path: newsPath,
      });
      setNewsArticles(articles);
    } catch (error) {
      console.error('Failed to post news:', error);
      const errorMsg = String(error);
      if (errorMsg.includes('Error code: 1') || errorMsg.toLowerCase().includes('permission')) {
        showNotification.error(
          `Unable to post news article: ${error}\n\nYou may not have posting privileges on this server. Contact the server administrator to request access.`,
          'Permission Denied',
          undefined,
          serverName
        );
      } else {
        showNotification.error(
          `Failed to post news: ${error}`,
          'Post Error',
          undefined,
          serverName
        );
      }
    } finally {
      setPostingNews(false);
    }
  };

  const handleNavigateNews = (category: any) => {
    if (category.type === 2 || category.type === 3) {
      setNewsPath(category.path);
    }
  };

  const handleNewsBack = (newsPath: string[]) => {
    if (newsPath.length > 0) {
      setNewsPath(newsPath.slice(0, -1));
    }
  };

  const handleSelectArticle = async (
    article: NewsArticle,
    setSelectedArticle: React.Dispatch<React.SetStateAction<NewsArticle | null>>,
    setArticleContent: React.Dispatch<React.SetStateAction<string>>
  ) => {
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

  return {
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
  };
}

