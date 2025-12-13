// Core Hotline types

export type BookmarkType = 'server' | 'tracker';

export interface Bookmark {
  id: string;
  name: string;
  address: string;
  port: number;
  login: string;
  password?: string;
  icon?: number;
  autoConnect?: boolean;
  type?: BookmarkType; // 'server' by default, 'tracker' for tracker servers
}

export interface TrackerBookmark {
  id: string;
  name: string;
  address: string;
  port: number;
  servers: ServerBookmark[];
  expanded?: boolean;
}

export interface ServerBookmark {
  id: string;
  name: string;
  description: string;
  address: string;
  port: number;
  users: number;
}

export interface User {
  id: number;
  name: string;
  icon: number;
  flags: number;
  isAdmin: boolean;
  isIdle: boolean;
  color?: string;
}

export interface ChatMessage {
  id: string;
  timestamp: Date;
  userId?: number;
  userName?: string;
  message: string;
  type: 'chat' | 'join' | 'leave' | 'disconnect' | 'system';
}

export interface PrivateMessage {
  id: string;
  timestamp: Date;
  userId: number;
  userName: string;
  message: string;
  isOutgoing: boolean;
  unread?: boolean;
}

export interface FileItem {
  name: string;
  type: 'file' | 'folder' | 'alias';
  size: number;
  creator: string;
  modifier: string;
  createdAt: Date;
  modifiedAt: Date;
  comment?: string;
}

export interface Transfer {
  id: string;
  serverId: string;
  type: 'upload' | 'download';
  fileName: string;
  fileSize: number;
  transferred: number;
  speed: number;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  startTime?: Date;
  endTime?: Date;
}

export interface NewsCategory {
  id: string;
  name: string;
  articles: NewsArticle[];
}

export interface NewsArticle {
  id: string;
  title: string;
  poster: string;
  timestamp: Date;
  content: string;
  parentId?: string;
}

export interface BoardPost {
  id: string;
  subject: string;
  poster: string;
  timestamp: Date;
  content: string;
  replyCount: number;
}

export interface ServerInfo {
  name: string;
  description: string;
  version: string;
  agreement?: string;
}

export interface Permissions {
  canChat: boolean;
  canNews: boolean;
  canFiles: boolean;
  canUpload: boolean;
  canDownload: boolean;
  canDeleteFiles: boolean;
  canCreateFolders: boolean;
  canReadChat: boolean;
  canSendMessages: boolean;
  canBroadcast: boolean;
  canGetUserInfo: boolean;
  canDisconnectUsers: boolean;
  canCreateUsers: boolean;
  canDeleteUsers: boolean;
  canReadUsers: boolean;
  canModifyUsers: boolean;
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'logging-in'
  | 'logged-in'
  | 'failed';
