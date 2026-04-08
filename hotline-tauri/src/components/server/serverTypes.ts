// Type definitions for ServerWindow and related components

export interface ChatMessage {
  userId: number;
  userName: string;
  message: string;
  timestamp: Date;
  isMention?: boolean; // Indicates if this message mentions the current user
  isAdmin?: boolean; // Indicates if the sender is an admin
}

export interface User {
  userId: number;
  userName: string;
  iconId: number;
  flags: number;
  isAdmin: boolean;
  isIdle: boolean;
  color?: string | null;
}

export interface PrivateMessage {
  text: string;
  isOutgoing: boolean;
  timestamp: Date;
}

export interface FileItem {
  name: string;
  size: number;
  isFolder: boolean;
  fileType?: string;
  creator?: string;
}

export interface NewsCategory {
  type: number;
  count: number;
  name: string;
  path: string[];
}

export interface NewsArticle {
  id: number;
  parent_id: number;
  flags: number;
  title: string;
  poster: string;
  date?: string;
  path: string[];
}

export interface PrivateChatRoom {
  chatId: number;
  subject: string;
  users: { id: number; name: string; icon: number; flags: number; color?: string }[];
  messages: ChatMessage[];
}

/// JSON-safe chat message for encrypted storage (timestamps as ISO strings)
export interface StoredChatMessage {
  userId: number;
  userName: string;
  message: string;
  timestamp: string; // ISO 8601
  isMention?: boolean;
  isAdmin?: boolean;
  type?: string; // 'joined' | 'left' etc.
}

export type ViewTab = 'chat' | 'board' | 'news' | 'files' | `pchat-${number}`;

