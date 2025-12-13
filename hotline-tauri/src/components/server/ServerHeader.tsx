import type { ServerInfo, ConnectionStatus } from '../../types';
import type { User } from '../server/serverTypes';

interface ServerHeaderProps {
  serverName: string;
  serverInfo: ServerInfo | null;
  users: User[];
  connectionStatus: ConnectionStatus;
  onDisconnect: () => void;
  onShowTransfers?: () => void;
}

export default function ServerHeader({
  serverName,
  serverInfo,
  users,
  connectionStatus,
  onDisconnect,
  onShowTransfers,
}: ServerHeaderProps) {
  return (
    <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {serverInfo?.name || serverName}
          </h1>
          {serverInfo?.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {serverInfo.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Connection status indicator */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              connectionStatus === 'logged-in' ? 'bg-green-500' :
              connectionStatus === 'connecting' || connectionStatus === 'logging-in' ? 'bg-yellow-500 animate-pulse' :
              connectionStatus === 'connected' ? 'bg-blue-500' :
              connectionStatus === 'failed' ? 'bg-red-500' :
              'bg-gray-400'
            }`} title={connectionStatus} />
            <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
              {connectionStatus === 'logged-in' ? 'Logged in' :
               connectionStatus === 'logging-in' ? 'Logging in...' :
               connectionStatus === 'connecting' ? 'Connecting...' :
               connectionStatus === 'connected' ? 'Connected' :
               connectionStatus === 'failed' ? 'Failed' :
               'Disconnected'}
            </span>
          </div>
          {serverInfo && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">{users.length}</span>
              <span>user{users.length !== 1 ? 's' : ''}</span>
            </div>
          )}
          {onShowTransfers && (
            <button
              onClick={onShowTransfers}
              className="px-3 py-1 text-sm text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              title="View Transfers"
            >
              📥 Transfers
            </button>
          )}
          <button
            onClick={onDisconnect}
            className="px-3 py-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
          >
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

