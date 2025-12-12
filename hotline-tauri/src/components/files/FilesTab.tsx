interface FileItem {
  name: string;
  size: number;
  isFolder: boolean;
  fileType?: string;
  creator?: string;
}

interface FilesTabProps {
  files: FileItem[];
  currentPath: string[];
  downloadProgress: Map<string, number>;
  onPathChange: (path: string[]) => void;
  onDownloadFile: (fileName: string, fileSize: number) => Promise<void>;
}

export default function FilesTab({
  files,
  currentPath,
  downloadProgress,
  onPathChange,
  onDownloadFile,
}: FilesTabProps) {
  return (
    <div className="flex-1 flex flex-col">
      {/* Path breadcrumb */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center gap-2">
        <button
          onClick={() => onPathChange([])}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          Root
        </button>
        {currentPath.map((folder, index) => {
          // Create unique key from path segment and position
          const uniqueKey = `path-${index}-${folder}`;
          return (
          <span key={uniqueKey} className="flex items-center gap-2">
            <span className="text-gray-400">/</span>
            <button
              onClick={() => onPathChange(currentPath.slice(0, index + 1))}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {folder}
            </button>
          </span>
          );
        })}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-4">
        {files.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            No files
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((file, index) => {
              // Create unique key from current path, file name, and index
              const pathKey = currentPath.join('/');
              const uniqueKey = `file-${pathKey}-${file.name}-${index}`;
              return (
              <div
                key={uniqueKey}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group"
              >
                <div
                  className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (file.isFolder) {
                      onPathChange([...currentPath, file.name]);
                    }
                  }}
                >
                  <div className="w-6 h-6 flex items-center justify-center text-lg">
                    {file.isFolder ? '📁' : '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {file.name}
                    </div>
                    {!file.isFolder && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {file.size >= 1024 * 1024
                          ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                          : `${(file.size / 1024).toFixed(1)} KB`}
                      </div>
                    )}
                  </div>
                </div>
                {!file.isFolder && (
                  <div className="flex items-center gap-2">
                    {downloadProgress.has(file.name) && downloadProgress.get(file.name)! < 100 ? (
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${downloadProgress.get(file.name)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                          {downloadProgress.get(file.name)}%
                        </span>
                      </div>
                    ) : (
                      <button
                        onClick={() => onDownloadFile(file.name, file.size)}
                        className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-opacity"
                      >
                        Download
                      </button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
