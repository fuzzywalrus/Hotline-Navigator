import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useContextMenu, ContextMenuRenderer, type ContextMenuItem } from '../common/ContextMenu';

interface FileItem {
  name: string;
  size: number;
  isFolder: boolean;
  fileType?: string;
  creator?: string;
}

interface FilesTabProps {
  serverId: string;
  files: FileItem[];
  currentPath: string[];
  downloadProgress: Map<string, number>;
  uploadProgress?: Map<string, number>;
  onPathChange: (path: string[]) => void;
  onDownloadFile: (fileName: string, fileSize: number) => Promise<void>;
  onUploadFile?: (file: File) => Promise<void>;
  onRefresh?: () => void;
  getAllCachedFiles?: () => Array<{ file: FileItem; path: string[] }>;
  isLoading?: boolean;
  isServerUnresponsive?: boolean;
  onWaitForServer?: () => void;
  onCancelNavigation?: () => void;
  canCreateFolder?: boolean;
  onCreateFolder?: (name: string) => Promise<void>;
}

export default function FilesTab({
  serverId,
  files,
  currentPath,
  downloadProgress,
  onPathChange,
  onDownloadFile,
  onUploadFile,
  onRefresh,
  getAllCachedFiles,
  isLoading = false,
  isServerUnresponsive = false,
  onWaitForServer,
  onCancelNavigation,
  canCreateFolder = false,
  onCreateFolder,
}: FilesTabProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ file: FileItem; path: string[] }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();
  const previewableExtensions = [
    // Images
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff', '.webp', '.svg',
    // Audio
    '.mp3', '.wav', '.ogg', '.oga', '.flac', '.m4a', '.aac',
    // Text
    '.txt', '.json', '.xml', '.html', '.htm', '.css', '.js'
    // Note: Video files excluded to avoid heavy bandwidth usage
  ];
  const [previewState, setPreviewState] = useState<{
    file: FileItem | null;
    path: string[];
    src: string | null;
    textContent?: string;
    loading: boolean;
    error?: string;
    index?: number;
  }>({ file: null, path: [], src: null, loading: false });
  const [previewCache, setPreviewCache] = useState<Map<string, { src: string | null; text?: string }>>(new Map());

  // Search through cached files, scoped to current path when inside a folder
  useEffect(() => {
    if (!searchQuery.trim() || !getAllCachedFiles) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const allFiles = getAllCachedFiles();
    const results = allFiles.filter(({ file, path }) => {
      if (!file.name.toLowerCase().includes(query)) return false;
      if (currentPath.length === 0) return true;
      // Scope: the file's parent path must start with currentPath
      if (path.length < currentPath.length) return false;
      return currentPath.every((segment, i) => path[i] === segment);
    });
    setSearchResults(results);
  }, [searchQuery, getAllCachedFiles, currentPath]);

  const isSearching = searchQuery.trim().length > 0;
  const displayedFiles = isSearching ? searchResults.map(r => r.file) : files;

  // Keyboard shortcuts for file navigation
  useKeyboardShortcuts([
    {
      key: 'ArrowLeft',
      description: 'Navigate back',
      action: () => {
        if (currentPath.length > 0) {
          onPathChange(currentPath.slice(0, -1));
        }
      },
      enabled: currentPath.length > 0,
    },
    {
      key: 'F',
      modifiers: { meta: true },
      description: 'Focus search',
      action: () => {
        const searchInput = document.querySelector('input[placeholder^="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      },
      enabled: !!getAllCachedFiles,
    },
  ]);

  const handleFileClick = (file: FileItem, path?: string[]) => {
    if (isLoading) return;
    if (isSearching && path) {
      onPathChange(path);
      setSearchQuery('');
    } else if (file.isFolder) {
      onPathChange([...currentPath, file.name]);
    }
  };

  const canPreview = (file: FileItem) => {
    if (file.isFolder) return false;
    const lower = file.name.toLowerCase();
    return previewableExtensions.some((ext) => lower.endsWith(ext));
  };

  const previewableList = useMemo(() => files.filter((f) => canPreview(f)), [files]);

  const previewType = (file: FileItem): 'image' | 'audio' | 'video' | 'text' | 'unknown' => {
    const lower = file.name.toLowerCase();
    if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tif', '.tiff', '.webp', '.svg'].some((ext) => lower.endsWith(ext))) return 'image';
    if (['.mp3', '.wav', '.ogg', '.oga', '.flac', '.m4a', '.aac'].some((ext) => lower.endsWith(ext))) return 'audio';
    if (['.mp4', '.m4v', '.webm', '.ogv', '.mov', '.avi'].some((ext) => lower.endsWith(ext))) return 'video';
    if (['.txt', '.json', '.xml', '.html', '.htm', '.css', '.js'].some((ext) => lower.endsWith(ext))) return 'text';
    return 'unknown';
  };

  const openPreview = async (file: FileItem, path: string[]) => {
    if (!canPreview(file) || isLoading) {
      return;
    }

    const cacheKey = `${path.join('/')}/${file.name}`;
    const currentIndex = previewableList.findIndex((f) => f.name === file.name);

    setPreviewState({
      file,
      path,
      src: null,
      textContent: undefined,
      loading: true,
      error: undefined,
      index: currentIndex,
    });

    // Return cached preview if available
    if (previewCache.has(cacheKey)) {
      const cached = previewCache.get(cacheKey)!;
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        src: cached.src,
        textContent: cached.text,
      }));
      return;
    }

    try {
      // Download to a temp file for preview
      const previewPath = await invoke<string>('download_file', {
        serverId,
        path,
        fileName: file.name,
        fileSize: file.size,
      });

      // extract actual path from returned string "Downloaded to: <path>"
      const actualPath = previewPath.replace(/^Downloaded to:\s*/, '').trim();
      const kind = previewType(file);
      let result: { src: string | null; text?: string };
      if (kind === 'text') {
        try {
          const preview = await invoke<{ mime: string; data: string; is_text: boolean }>('read_preview_file', { path: actualPath });
          result = { src: null, text: preview.data };
        } catch (err) {
          setPreviewState((prev) => ({
            ...prev,
            loading: false,
            src: null,
            textContent: undefined,
            error: err instanceof Error ? err.message : 'Failed to preview file',
          }));
          return;
        }
      } else {
        try {
          const preview = await invoke<{ mime: string; data: string; is_text: boolean }>('read_preview_file', { path: actualPath });
          const bytes = Uint8Array.from(atob(preview.data), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: preview.mime });
          const objectUrl = URL.createObjectURL(blob);
          result = { src: objectUrl, text: undefined };
        } catch (err) {
          setPreviewState((prev) => ({
            ...prev,
            loading: false,
            src: null,
            textContent: undefined,
            error: err instanceof Error ? err.message : 'Failed to preview file',
          }));
          return;
        }
      }

      setPreviewCache((prev) => {
        const next = new Map(prev);
        next.set(cacheKey, { src: result.src, text: result.text });
        return next;
      });

      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        src: result.src,
        textContent: result.text,
        error: undefined,
      }));
    } catch (error) {
      console.error('Preview failed:', error);
      setPreviewState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to preview file',
      }));
    }
  };

  const goToPreview = (direction: 1 | -1) => {
    if (!previewState.file || previewableList.length < 2) return;
    const currentIndex = previewableList.findIndex((f) => f.name === previewState.file?.name);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + direction + previewableList.length) % previewableList.length;
    const nextFile = previewableList[nextIndex];
    openPreview(nextFile, previewState.path.length ? previewState.path : currentPath);
  };

  const closePreview = () => {
    setPreviewState({ file: null, path: [], src: null, loading: false });
  };

  return (
    <div className="flex-1 flex flex-col relative">
      {/* Search bar */}
      {getAllCachedFiles && (
        <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2">
          <div className="relative">
            <input
              type="text"
              placeholder={currentPath.length > 0 ? `Search in "${currentPath[currentPath.length - 1]}"...` : "Search files..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 pl-8 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <svg
              className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                title="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          {isSearching && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {searchResults.length > 0 
                ? `Found ${searchResults.length} file${searchResults.length !== 1 ? 's' : ''}`
                : 'No files found'}
            </div>
          )}
        </div>
      )}

      {/* Path breadcrumb */}
      <div className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
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
              onClick={() => {
                if (!isLoading) {
                  onPathChange(currentPath.slice(0, index + 1));
                }
              }}
              disabled={isLoading}
              className={`text-sm text-blue-600 dark:text-blue-400 hover:underline ${
                isLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {folder}
            </button>
          </span>
          );
        })}
        </div>
        <div className="flex items-center gap-2">
          {onUploadFile && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && onUploadFile) {
                    onUploadFile(file).catch((error) => {
                      console.error('Upload failed:', error);
                      // Notification will be shown by useServerHandlers
                    });
                  }
                  // Reset input so same file can be selected again
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1"
                title="Upload file"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload
              </button>
            </>
          )}
          {canCreateFolder && onCreateFolder && (
            <button
              onClick={() => { setShowNewFolderInput(true); setNewFolderName(''); }}
              className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1"
              title="New Folder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              New Folder
            </button>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors flex items-center gap-1"
              title="Refresh file list"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* New folder inline input */}
      {showNewFolderInput && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 px-4 py-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          <input
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Folder name..."
            autoFocus
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && newFolderName.trim()) {
                await onCreateFolder!(newFolderName.trim());
                setShowNewFolderInput(false);
                setNewFolderName('');
              }
              if (e.key === 'Escape') {
                setShowNewFolderInput(false);
                setNewFolderName('');
              }
            }}
            className="flex-1 px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={async () => {
              if (newFolderName.trim()) {
                await onCreateFolder!(newFolderName.trim());
              }
              setShowNewFolderInput(false);
              setNewFolderName('');
            }}
            disabled={!newFolderName.trim()}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded disabled:cursor-not-allowed"
          >
            Create
          </button>
          <button
            onClick={() => { setShowNewFolderInput(false); setNewFolderName(''); }}
            className="px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Server unresponsive overlay */}
      {isServerUnresponsive && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-6 max-w-sm w-full mx-4 text-center">
            <div className="text-gray-500 dark:text-gray-400 mb-1">
              <svg className="w-8 h-8 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">Server is taking a while</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">The server hasn't responded yet. This folder may have a lot of files.</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={onCancelNavigation}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onWaitForServer}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors"
              >
                Keep Waiting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-4">
        {displayedFiles.length === 0 ? (
          <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            {isSearching ? 'No files found' : 'No files'}
          </div>
        ) : (
          <div className="space-y-1">
            {(isSearching ? searchResults : displayedFiles.map((file, index) => ({ file, path: currentPath, index }))).map((item, index) => {
              const file = 'file' in item ? item.file : item;
              const path = 'path' in item ? item.path : currentPath;
              const itemIndex = 'index' in item ? item.index : index;
              
              // Create unique key
              const pathKey = path.join('/');
              const uniqueKey = isSearching 
                ? `search-${pathKey}-${file.name}-${index}`
                : `file-${pathKey}-${file.name}-${itemIndex}`;
              
              return (
              <div
                key={uniqueKey}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group"
              >
                <div
                  className={`flex items-center gap-3 flex-1 min-w-0 ${
                    isLoading && file.isFolder ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  }`}
                  onClick={() => handleFileClick(file, 'path' in item ? item.path : undefined)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const items: ContextMenuItem[] = [
                      {
                        label: 'Download',
                        icon: '⬇️',
                        action: () => {
                          if (!file.isFolder) {
                            onDownloadFile(file.name, file.size);
                          }
                        },
                        disabled: file.isFolder,
                      },
                      { divider: true, label: '', action: () => {} },
                      {
                        label: 'Get Info',
                        icon: 'ℹ️',
                        action: () => {
                          // TODO: Implement file info dialog
                          alert(`File: ${file.name}\nSize: ${file.size} bytes\nType: ${file.fileType || 'Unknown'}`);
                        },
                      },
                      {
                        label: 'Preview',
                        icon: '👁️',
                        action: () => {
                          openPreview(file, path);
                        },
                        disabled: !canPreview(file),
                      },
                    ];
                    showContextMenu(e, items);
                  }}
                >
                  <div className="w-6 h-6 flex items-center justify-center text-lg">
                    {file.isFolder ? '📁' : '📄'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {file.name}
                    </div>
                    <div className="flex items-center gap-2">
                      {isSearching && 'path' in item && item.path.length > 0 && (
                        <div className="text-xs text-gray-400 dark:text-gray-500 truncate">
                          {item.path.join(' / ')}
                        </div>
                      )}
                      {!file.isFolder && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {file.size >= 1024 * 1024
                            ? `${(file.size / 1024 / 1024).toFixed(2)} MB`
                            : `${(file.size / 1024).toFixed(1)} KB`}
                        </div>
                      )}
                    </div>
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
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canPreview(file) && (
                          <button
                            onClick={() => openPreview(file, path)}
                            className="px-2 py-1 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100 rounded"
                            title="Preview"
                          >
                            👁
                          </button>
                        )}
                        <button
                          onClick={() => onDownloadFile(file.name, file.size)}
                          className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                        >
                          Download
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Context menu */}
      <ContextMenuRenderer
        contextMenu={contextMenu}
        onClose={hideContextMenu}
      />

      {/* Preview modal */}
      {previewState.file && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center px-4" onClick={closePreview}>
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div>
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{previewState.file.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{previewType(previewState.file)} preview</div>
              </div>
              <div className="flex items-center gap-2">
                {previewableList.length > 1 && (
                  <>
                    <button
                      onClick={() => goToPreview(-1)}
                      className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1 rounded border border-gray-200 dark:border-gray-700"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => goToPreview(1)}
                      className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 px-2 py-1 rounded border border-gray-200 dark:border-gray-700"
                    >
                      →
                    </button>
                  </>
                )}
                <button
                  onClick={() => previewState.file && onDownloadFile(previewState.file.name, previewState.file.size)}
                  className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                >
                  Download
                </button>
                <button
                  onClick={closePreview}
                  className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  ✕
                </button>
              </div>

            </div>

            <div className="p-4 flex-1 overflow-auto bg-gray-50 dark:bg-gray-950">
              {previewState.loading && (
                <div className="text-sm text-gray-600 dark:text-gray-300">Loading preview…</div>
              )}
              {previewState.error && (
                <div className="text-sm text-red-600 dark:text-red-400">{previewState.error}</div>
              )}
              {!previewState.loading && !previewState.error && previewState.file && (
                <>
                  {previewType(previewState.file) === 'image' && previewState.src && (
                    <div className="w-full flex justify-center">
                      <img src={previewState.src} alt={previewState.file.name} className="max-h-[70vh] object-contain" />
                    </div>
                  )}
                  {previewType(previewState.file) === 'audio' && previewState.src && (
                    <div className="w-full flex flex-col items-center gap-4 p-4">
                      <audio controls className="w-full max-w-2xl" src={previewState.src}>
                        Your browser does not support the audio element.
                      </audio>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {previewState.file.name}
                      </div>
                    </div>
                  )}
                  {previewType(previewState.file) === 'text' && (
                    <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-900 p-3 rounded border border-gray-200 dark:border-gray-800 max-h-[70vh] overflow-auto">
                      {previewState.textContent ?? 'No content'}
                    </pre>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
