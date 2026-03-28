import type { ServerInfo, ConnectionStatus } from '../../types';
import type { User } from '../server/serverTypes';

interface ServerHeaderProps {
  serverName: string;
  serverInfo: ServerInfo | null;
  users: User[];
  connectionStatus: ConnectionStatus;
  isTls?: boolean;
  onDisconnect: () => void;
  onShowTransfers?: () => void;
  onShowNotificationLog?: () => void;
}

export default function ServerHeader({
  serverName,
  serverInfo,
  users,
  connectionStatus,
  isTls,
  onDisconnect,
  onShowTransfers,
  onShowNotificationLog,
}: ServerHeaderProps) {
  return (
    <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-3 py-2 md:px-4 md:py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h1 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white truncate">
            {serverInfo?.name || serverName}
          </h1>
          {serverInfo?.description && (
            <p className="hidden md:block text-sm text-gray-600 dark:text-gray-400 mt-1">
              {serverInfo.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-3 flex-shrink-0">
          {/* Connection status indicator */}
          <div className="flex items-center gap-1.5 md:gap-2">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'logged-in' ? 'bg-green-500' :
              connectionStatus === 'connecting' || connectionStatus === 'logging-in' ? 'bg-yellow-500 animate-pulse' :
              connectionStatus === 'connected' ? 'bg-blue-500' :
              connectionStatus === 'failed' ? 'bg-red-500' :
              'bg-gray-400'
            }`} title={connectionStatus} />
            {serverInfo?.hopeEnabled && (
              <span
                title={serverInfo.hopeTransport ? 'HOPE transport encryption active' : 'HOPE secure login active'}
                className={`inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  serverInfo.hopeTransport
                    ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                }`}
              >
                HOPE
              </span>
            )}
            {isTls && (
              <span title="TLS Secure Connection">
                <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H3.5A1.5 1.5 0 0 0 2 8.5v5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12.5 7h-1V4.5A3.5 3.5 0 0 0 8 1zm2 6H6V4.5a2 2 0 1 1 4 0V7z"/>
                </svg>
              </span>
            )}
            <span className="hidden md:inline text-xs text-gray-500 dark:text-gray-400 capitalize">
              {connectionStatus === 'logged-in' ? 'Logged in' :
               connectionStatus === 'logging-in' ? 'Logging in...' :
               connectionStatus === 'connecting' ? 'Connecting...' :
               connectionStatus === 'connected' ? 'Connected' :
               connectionStatus === 'failed' ? 'Failed' :
               'Disconnected'}
            </span>
          </div>
          {serverInfo && (
            <div className="hidden md:flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">{users.length}</span>
              <span>user{users.length !== 1 ? 's' : ''}</span>
            </div>
          )}
          {onShowTransfers && (
            <button
              onClick={onShowTransfers}
              className="px-2 py-1 md:px-3 text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              title="View Transfers"
            >
              📥<span className="hidden md:inline"> Transfers</span>
            </button>
          )}
          {onShowNotificationLog && (
            <button
              onClick={onShowNotificationLog}
              className="px-2 py-1 md:px-3 text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              title="Notification Log"
            >
              🔔
            </button>
          )}
          <button
            onClick={onDisconnect}
            className="px-2 py-1 md:px-3 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
            title="Disconnect"
          >
            <span className="md:hidden">✕</span>
            <span className="hidden md:inline">Disconnect</span>
          </button>
        </div>
      </div>
    </div>
  );
}
