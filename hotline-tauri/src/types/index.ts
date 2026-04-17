// Core Hotline types

export type BookmarkType = 'server' | 'tracker';

export interface Bookmark {
  id: string;
  name: string;
  address: string;
  port: number;
  login: string;
  password?: string; // Used only for IPC transit — never persisted to disk
  hasPassword?: boolean; // True when a password is stored in the vault
  icon?: number;
  autoConnect?: boolean;
  tls?: boolean;
  hope?: boolean;
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

export interface UserAccess {
  canDisconnectUsers: boolean;
  canBroadcast: boolean;
  canOpenUsers: boolean;
  canModifyUsers: boolean;
  canGetClientInfo: boolean;
  // Add more as needed
}

export interface ChatMessage {
  id: string;
  timestamp: Date;
  userId?: number;
  userName?: string;
  message: string;
  type: 'chat' | 'join' | 'leave' | 'disconnect' | 'system';
  isAction?: boolean;       // /me emote
  isServerMsg?: boolean;    // server broadcast
  isDeleted?: boolean;      // tombstoned (history only)
  messageId?: string;       // server-assigned history ID (string to avoid JS precision loss)
  fromHistory?: boolean;    // true if loaded from server history
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
  hopeEnabled?: boolean;
  hopeTransport?: boolean;
  agreement?: string;
  chatHistorySupported?: boolean;
  historyMaxMsgs?: number;
  historyMaxDays?: number;
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

// Mnemosyne search types

export interface MnemosyneBookmark {
  id: string;
  name: string;
  url: string; // Base URL of the Mnemosyne instance (e.g. http://mnemosyne.example.com:8980)
}

export interface MnemosyneSearchResult {
  type: 'msgboard' | 'news' | 'file';
  server_id: string;
  server_name: string;
  server_address: string;
  score: number;
  data: MnemosyneMsgboardData | MnemosyneNewsData | MnemosyneFileData;
}

export interface MnemosyneMsgboardData {
  post_id: number;
  nick: string;
  body: string;
  timestamp: string;
}

export interface MnemosyneNewsData {
  path: string;
  article_id: number;
  title: string;
  poster: string;
  body: string;
  date: string;
}

export interface MnemosyneFileData {
  path: string;
  name: string;
  size: number;
  type: string;
  comment: string;
}

export interface MnemosyneSearchResponse {
  total: number;
  results: MnemosyneSearchResult[];
}

export interface MnemosyneHealthResponse {
  status: string;
  version: string;
  uptime_seconds: number;
  database: string;
}

// Chat history extension types

export interface ChatHistoryEntry {
  messageId: string;        // u64 as string to avoid JS precision loss
  timestamp: number;        // Unix epoch seconds
  isAction: boolean;
  isServerMsg: boolean;
  isDeleted: boolean;
  iconId: number;
  nick: string;
  message: string;
}

export interface ChatHistoryResponse {
  entries: ChatHistoryEntry[];
  hasMore: boolean;
}
