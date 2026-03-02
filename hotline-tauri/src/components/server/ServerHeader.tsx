import type { ServerInfo, ConnectionStatus } from '../../types';
import type { User } from '../server/serverTypes';

interface ServerHeaderProps {
  serverName: string;
  serverInfo: ServerInfo | null;
  users: User[];
  connectionStatus: ConnectionStatus;
  onDisconnect: () => void;
  onShowTransfers?: () => void;
  onShowNotificationLog?: () => void;
}

export default function ServerHeader({
  serverName,
  serverInfo,
  users,
  connectionStatus,
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

