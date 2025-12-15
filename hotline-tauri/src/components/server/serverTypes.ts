// Type definitions for ServerWindow and related components

export interface ChatMessage {
  userId: number;
  userName: string;
  message: string;
  timestamp: Date;
  isMention?: boolean; // Indicates if this message mentions the current user
}

export interface User {
  userId: number;
  userName: string;
  iconId: number;
  flags: number;
  isAdmin: boolean;
  isIdle: boolean;
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

export type ViewTab = 'chat' | 'board' | 'news' | 'files';

