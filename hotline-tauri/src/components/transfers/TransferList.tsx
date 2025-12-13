import { useAppStore } from '../../stores/appStore';
import type { Transfer } from '../../types';

interface TransferListProps {
  serverId?: string;
  serverName?: string;
  onClose: () => void;
}

function formatBytes(bytes: number | undefined | null): string {
  if (bytes === undefined || bytes === null || bytes === 0 || isNaN(bytes) || !isFinite(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeIndex = Math.min(i, sizes.length - 1);
  return `${(bytes / Math.pow(k, sizeIndex)).toFixed(1)} ${sizes[sizeIndex]}`;
}

function formatSpeed(bytesPerSecond: number | undefined | null): string {
  if (bytesPerSecond === undefined || bytesPerSecond === null || bytesPerSecond === 0 || isNaN(bytesPerSecond) || !isFinite(bytesPerSecond)) return '0 B/s';
  return `${formatBytes(bytesPerSecond)}/s`;
}

export default function TransferList({ serverId, serverName, onClose }: TransferListProps) {
  const { transfers, removeTransfer, clearCompletedTransfers, serverInfo } = useAppStore();

  // Filter transfers by server if serverId is provided
  const filteredTransfers = serverId
    ? transfers.filter((t) => t.serverId === serverId)
    : transfers;

  const activeTransfers = filteredTransfers.filter((t) => t.status === 'active');
  const completedTransfers = filteredTransfers.filter((t) => t.status === 'completed');
  const failedTransfers = filteredTransfers.filter((t) => t.status === 'failed');

  const getServerName = (transfer: Transfer) => {
    if (transfer.serverId && serverInfo.has(transfer.serverId)) {
      const info = serverInfo.get(transfer.serverId);
      return info?.name || 'Unknown Server';
    }
    return serverName || 'Unknown Server';
  };

  const getProgressPercentage = (transfer: Transfer): number => {
    if (!transfer.fileSize || transfer.fileSize <= 0) return 0;
    if (transfer.transferred === undefined || transfer.transferred === null) return 0;
    if (isNaN(transfer.transferred) || !isFinite(transfer.transferred)) return 0;
    if (isNaN(transfer.fileSize) || !isFinite(transfer.fileSize)) return 0;
    return Math.min((transfer.transferred / transfer.fileSize) * 100, 100);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl h-[600px] flex flex-col">
        {/* Header */}
        <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {serverId ? `Transfers - ${serverName || 'Server'}` : 'All Transfers'}
          </h2>
          <div className="flex items-center gap-2">
            {completedTransfers.length > 0 && (
              <button
                onClick={clearCompletedTransfers}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Clear Completed
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {filteredTransfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
              <p className="text-base mb-1">No transfers</p>
              <p className="text-sm">File transfers will appear here</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Transfers */}
              {activeTransfers.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Active ({activeTransfers.length})
                  </h3>
                  <div className="space-y-2">
                    {activeTransfers.map((transfer) => (
                      <div
                        key={transfer.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-800"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {transfer.type === 'download' ? '⬇️' : '⬆️'}
                              </span>
                              <span className="font-medium text-gray-900 dark:text-white truncate">
                                {transfer.fileName}
                              </span>
                            </div>
                            {!serverId && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {getServerName(transfer)}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => removeTransfer(transfer.id)}
                            className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600 dark:text-gray-400">
                              {formatBytes(transfer.transferred)} / {formatBytes(transfer.fileSize)}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">
                              {Math.round(getProgressPercentage(transfer))}%
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all"
                              style={{
                                width: `${getProgressPercentage(transfer)}%`,
                              }}
                            />
                          </div>
                          {transfer.speed && transfer.speed > 0 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatSpeed(transfer.speed)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Transfers */}
              {completedTransfers.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Completed ({completedTransfers.length})
                  </h3>
                  <div className="space-y-2">
                    {completedTransfers.map((transfer) => (
                      <div
                        key={transfer.id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-green-50 dark:bg-green-900/20"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-lg">
                              {transfer.type === 'download' ? '⬇️' : '⬆️'}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white truncate">
                              {transfer.fileName}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatBytes(transfer.fileSize)}
                            </span>
                          </div>
                          {!serverId && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
                              {getServerName(transfer)}
                            </span>
                          )}
                          <button
                            onClick={() => removeTransfer(transfer.id)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Failed Transfers */}
              {failedTransfers.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Failed ({failedTransfers.length})
                  </h3>
                  <div className="space-y-2">
                    {failedTransfers.map((transfer) => (
                      <div
                        key={transfer.id}
                        className="border border-red-200 dark:border-red-800 rounded-lg p-3 bg-red-50 dark:bg-red-900/20"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-lg">
                              {transfer.type === 'download' ? '⬇️' : '⬆️'}
                            </span>
                            <span className="font-medium text-gray-900 dark:text-white truncate">
                              {transfer.fileName}
                            </span>
                            {transfer.error && (
                              <span className="text-xs text-red-600 dark:text-red-400">
                                {transfer.error}
                              </span>
                            )}
                          </div>
                          {!serverId && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
                              {getServerName(transfer)}
                            </span>
                          )}
                          <button
                            onClick={() => removeTransfer(transfer.id)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="Remove"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

