import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import type { Bookmark, ServerBookmark } from '../../types';
import EditBookmarkDialog from './EditBookmarkDialog';
import { useContextMenu, ContextMenuRenderer, type ContextMenuItem } from '../common/ContextMenu';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface BookmarkListProps {
  bookmarks: Bookmark[];
  searchQuery?: string;
}

interface SortableItemProps {
  id: string;
  children: (dragHandleProps: any) => React.ReactNode;
}

function SortableItem({ id, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const dragHandleProps = {
    ref: setActivatorNodeRef,
    ...listeners,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(dragHandleProps)}
    </div>
  );
}

export default function BookmarkList({ bookmarks, searchQuery = '' }: BookmarkListProps) {
  const { removeBookmark, addActiveServer, setFocusedServer, setBookmarks } = useAppStore();
  const { username, userIconId } = usePreferencesStore();
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectionErrors, setConnectionErrors] = useState<Map<string, string>>(new Map());
  const [expandedTrackers, setExpandedTrackers] = useState<Set<string>>(new Set());
  const [trackerServers, setTrackerServers] = useState<Map<string, ServerBookmark[]>>(new Map());
  const [loadingTrackers, setLoadingTrackers] = useState<Set<string>>(new Set());
  const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDelete = async (id: string) => {
    try {
      await invoke('delete_bookmark', { id });
      removeBookmark(id);
      setDeletingId(null);
    } catch (error) {
      console.error('Failed to delete bookmark:', error);
    }
  };

  const handleConnect = async (bookmark: Bookmark) => {
    // Don't connect to trackers - they should be expanded instead
    // Check both explicit type and port (trackers use port 5498)
    if (bookmark.type === 'tracker' || bookmark.port === 5498) {
      console.log('Tracker detected, expanding instead of connecting:', bookmark.name);
      handleToggleTracker(bookmark.id);
      return;
    }

    setConnectingId(bookmark.id);
    // Clear any previous error for this bookmark
    setConnectionErrors((prev) => {
      const next = new Map(prev);
      next.delete(bookmark.id);
      return next;
    });

    try {
      const serverId = await invoke<string>('connect_to_server', { 
        bookmark,
        username,
        userIconId,
      });
      console.log('Connected to server:', serverId);

      // Add to active servers and open window
      addActiveServer(serverId, {
        id: serverId,
        name: bookmark.name,
        address: bookmark.address,
        port: bookmark.port,
      });
      setFocusedServer(serverId);
    } catch (error) {
      console.error('Failed to connect:', error);
      
      // Format error message for display
      const errorMessage = String(error);
      let userFriendlyMessage = 'Failed to connect to server.';
      
      if (errorMessage.includes('Cannot connect to tracker') || errorMessage.includes('tracker')) {
        userFriendlyMessage = 'Trackers cannot be connected to directly. Click on the tracker to expand it and browse servers.';
      } else if (errorMessage.includes('nodename nor servname provided') || errorMessage.includes('not known')) {
        userFriendlyMessage = 'Unable to resolve server address. Please check the server address and try again.';
      } else if (errorMessage.includes('Connection refused')) {
        userFriendlyMessage = 'Connection refused. The server may be offline or the port may be incorrect.';
      } else if (errorMessage.includes('timeout')) {
        userFriendlyMessage = 'Connection timed out. The server may be unreachable.';
      } else if (errorMessage.includes('early eof') || errorMessage.includes('handshake')) {
        userFriendlyMessage = 'Connection failed: Server did not respond correctly. This may be a tracker - click to expand instead of connecting.';
      } else if (errorMessage.includes('Failed to connect')) {
        // Extract the actual error from the message
        const match = errorMessage.match(/Failed to connect: (.+)/);
        if (match && match[1]) {
          userFriendlyMessage = `Connection failed: ${match[1]}`;
        }
      }
      
      // Store error message for this bookmark
      setConnectionErrors((prev) => {
        const next = new Map(prev);
        next.set(bookmark.id, userFriendlyMessage);
        return next;
      });
    } finally {
      setConnectingId(null);
    }
  };

  const fetchTrackerServers = async (trackerId: string) => {
    const tracker = bookmarks.find(b => b.id === trackerId);
    if (!tracker || tracker.type !== 'tracker') return;
    
    setLoadingTrackers((prev) => new Set(prev).add(trackerId));
    
    try {
      interface TrackerServer {
        address: string;
        port: number;
        users: number;
        name?: string | null;
        description?: string | null;
      }
      
      const servers = await invoke<TrackerServer[]>('fetch_tracker_servers', {
        address: tracker.address,
        port: tracker.port || undefined,
      });
      
      // Convert TrackerServer to ServerBookmark format
      const serverBookmarks: ServerBookmark[] = servers.map((server, index) => ({
        id: `${trackerId}-${index}`,
        name: server.name || server.address,
        description: server.description || '',
        address: server.address,
        port: server.port,
        users: server.users,
      }));
      
      setTrackerServers((prev) => {
        const next = new Map(prev);
        next.set(trackerId, serverBookmarks);
        return next;
      });
      
      // Clear any previous errors
      setConnectionErrors((prev) => {
        const next = new Map(prev);
        next.delete(trackerId);
        return next;
      });
    } catch (error) {
      console.error('Failed to fetch tracker servers:', error);
      setConnectionErrors((prev) => {
        const next = new Map(prev);
        next.set(trackerId, `Failed to fetch servers: ${error}`);
        return next;
      });
    } finally {
      setLoadingTrackers((prev) => {
        const next = new Set(prev);
        next.delete(trackerId);
        return next;
      });
    }
  };

  const handleToggleTracker = async (trackerId: string) => {
    const isExpanded = expandedTrackers.has(trackerId);
    
    if (isExpanded) {
      // Collapse: remove from expanded set and clear servers
      setExpandedTrackers((prev) => {
        const next = new Set(prev);
        next.delete(trackerId);
        return next;
      });
      setTrackerServers((prev) => {
        const next = new Map(prev);
        next.delete(trackerId);
        return next;
      });
    } else {
      // Expand: fetch servers from tracker
      setExpandedTrackers((prev) => new Set(prev).add(trackerId));
      await fetchTrackerServers(trackerId);
    }
  };

  const handleRefreshTracker = async (trackerId: string) => {
    // Refresh: re-fetch servers if tracker is expanded
    if (expandedTrackers.has(trackerId)) {
      await fetchTrackerServers(trackerId);
    } else {
      // If not expanded, expand it (which will fetch)
      setExpandedTrackers((prev) => new Set(prev).add(trackerId));
      await fetchTrackerServers(trackerId);
    }
  };

  const handleConnectToTrackerServer = async (trackerId: string, server: ServerBookmark) => {
    // Create a bookmark from the tracker server and connect
    // Make sure it's explicitly marked as a server (not tracker)
    const bookmark: Bookmark = {
      id: `${trackerId}-${server.id}`,
      name: server.name,
      address: server.address,
      port: server.port,
      login: 'guest',
      password: undefined,
      icon: undefined,
      autoConnect: false,
      type: 'server', // Explicitly set as server
    };
    
    console.log('Connecting to server from tracker:', bookmark.name, bookmark.address, bookmark.port);
    await handleConnect(bookmark);
  };

  // Filter helper functions
  const matchesSearch = (text: string): boolean => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    return text.toLowerCase().includes(query);
  };

  const shouldShowBookmark = (bookmark: Bookmark): boolean => {
    if (!searchQuery.trim()) return true;
    // For regular bookmarks, filter by name
    if (bookmark.type !== 'tracker') {
      return matchesSearch(bookmark.name);
    }
    // Trackers are always shown (they won't be filtered)
    return true;
  };

  const getFilteredTrackerServers = (servers: ServerBookmark[]): ServerBookmark[] => {
    if (!searchQuery.trim()) return servers;
    return servers.filter(server => 
      matchesSearch(server.name) || 
      (server.description && matchesSearch(server.description))
    );
  };

  // Filter bookmarks based on search query
  const filteredBookmarks = bookmarks.filter(shouldShowBookmark);

  // Handle drag end with dnd-kit
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = bookmarks.findIndex((b) => b.id === active.id);
      const newIndex = bookmarks.findIndex((b) => b.id === over.id);

      const newBookmarks = arrayMove(bookmarks, oldIndex, newIndex);

      // Update local state immediately
      setBookmarks(newBookmarks);

      // Save to backend
      try {
        await invoke('reorder_bookmarks', { bookmarks: newBookmarks });
        console.log('Successfully reordered bookmarks');
      } catch (error) {
        console.error('Failed to reorder bookmarks:', error);
        // Revert on error
        setBookmarks(bookmarks);
      }
    }
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={filteredBookmarks.map(b => b.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="bg-white dark:bg-gray-900">
        {filteredBookmarks.map((bookmark, index) => {
          const isTracker = bookmark.type === 'tracker';
          const isExpanded = expandedTrackers.has(bookmark.id);
          const allServers = trackerServers.get(bookmark.id) || [];
          const servers = getFilteredTrackerServers(allServers);
          const isLoading = loadingTrackers.has(bookmark.id);
          const isEven = index % 2 === 0;
          
          // Trackers are always shown (never filtered by name)
          // Only their nested servers are filtered
          
          return (
            isTracker ? (
              // Tracker display - compact, list-like
              <SortableItem key={bookmark.id} id={bookmark.id}>
                {(dragHandleProps) => (
                <>
                <div
                  onClick={() => handleToggleTracker(bookmark.id)}
                  className={`h-[34px] px-2 flex items-center gap-1.5 group ${
                    isEven
                      ? 'bg-white dark:bg-gray-900'
                      : 'bg-gray-50 dark:bg-gray-800/50'
                  } hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
                    onContextMenu={(e) => {
                      const items: ContextMenuItem[] = [
                        {
                          label: 'Copy Link',
                          icon: '🔗',
                          action: () => {
                            const link = `hotlinetracker://${bookmark.address}:${bookmark.port}`;
                            navigator.clipboard.writeText(link);
                          },
                        },
                        {
                          label: 'Copy Address',
                          icon: '📋',
                          action: () => {
                            navigator.clipboard.writeText(`${bookmark.address}:${bookmark.port}`);
                          },
                        },
                        { divider: true },
                        {
                          label: 'Edit Tracker...',
                          icon: '✏️',
                          action: () => setEditingBookmark(bookmark),
                        },
                        { divider: true, label: '', action: () => {} },
                        {
                          label: 'Delete Tracker',
                          icon: '🗑️',
                          action: () => setDeletingId(bookmark.id),
                        },
                      ];
                      showContextMenu(e, items);
                    }}
                  >
                    {/* Drag handle - only draggable from here */}
                    <div
                      {...dragHandleProps}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 w-[12px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Drag to reorder"
                    >
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M5 3h2v2H5V3zm0 4h2v2H5V7zm0 4h2v2H5v-2zm4-8h2v2H9V3zm0 4h2v2H9V7zm0 4h2v2H9v-2z"/>
                      </svg>
                    </div>

                    {/* Chevron - 10px width, opacity 0.5 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleTracker(bookmark.id);
                      }}
                      className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0 w-[10px] flex items-center justify-center text-[10px] font-bold opacity-50"
                      aria-label={isExpanded ? 'Collapse tracker' : 'Expand tracker'}
                    >
                      {isExpanded ? '▼' : '▶'}
                    </button>
                    
                    {/* Tracker icon - 16x16 */}
                    <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                      <img 
                        src="/icons/tracker.png" 
                        alt="Tracker" 
                        className="w-4 h-4"
                        onError={(e) => {
                          // Fallback to SVG if image not found
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                          svg.setAttribute('class', 'w-4 h-4 text-blue-600 dark:text-blue-400');
                          svg.setAttribute('viewBox', '0 0 16 16');
                          svg.setAttribute('fill', 'currentColor');
                          svg.innerHTML = '<path d="M8 0L0 4v8l8 4 8-4V4L8 0zm0 2.18l6 3v5.64l-6 3-6-3V5.18l6-3z"/><circle cx="8" cy="8" r="1.5"/>';
                          target.parentNode?.appendChild(svg);
                        }}
                      />
                    </div>
                    
                    {/* Tracker name - bold, no max width */}
                    <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1 truncate min-w-0">
                  {bookmark.name}
                    </span>
                    
                    {/* Loading indicator - mini progress view */}
                    {isLoading && (
                      <div className="flex-shrink-0 w-3 h-3 mr-1">
                        <div className="w-3 h-3 border border-gray-300 dark:border-gray-600 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                      </div>
                    )}
                    
                    {/* Server count badge when expanded */}
                    {isExpanded && servers.length > 0 && !isLoading && (
                      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs text-gray-500 dark:text-gray-400">
                        <span>{servers.length}</span>
                        <span className="text-[10px]">🌐</span>
              </div>
                    )}
                    
                    {/* Refresh button - always visible for trackers */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRefreshTracker(bookmark.id);
                      }}
                      disabled={isLoading}
                      className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Refresh tracker servers"
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      )}
                    </button>
                    
                    {/* Edit/Delete buttons on hover */}
                    <div 
                      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-1"
                      onDragOver={(e) => {
                        // CRITICAL: preventDefault() to allow drop
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                    >
                <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingBookmark(bookmark);
                        }}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs px-1.5 py-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30"
                        title="Edit tracker"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingId(bookmark.id);
                        }}
                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs px-1.5 py-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                        title="Delete tracker"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Tracker servers list (when expanded) - indented 34px */}
                  {isExpanded && servers.map((server, serverIndex) => {
                    const serverIsEven = (index + serverIndex + 1) % 2 === 0;
                    return (
                      <div
                        key={server.id}
                        className={`h-[34px] pl-[34px] pr-2 flex items-center gap-1.5 cursor-pointer group min-w-0 ${
                          serverIsEven 
                            ? 'bg-white dark:bg-gray-900' 
                            : 'bg-gray-50 dark:bg-gray-800/50'
                        } hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
                        onClick={() => handleConnectToTrackerServer(bookmark.id, server)}
                      >
                        {/* Server icon - 16x16 */}
                        <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                          <img 
                            src="/icons/server.png" 
                            alt="Server" 
                            className="w-4 h-4"
                            onError={(e) => {
                              // Fallback to SVG if image not found
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                              svg.setAttribute('class', 'w-4 h-4 text-gray-600 dark:text-gray-400');
                              svg.setAttribute('viewBox', '0 0 16 16');
                              svg.setAttribute('fill', 'currentColor');
                              svg.innerHTML = '<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1" fill="none"/><circle cx="8" cy="8" r="2"/>';
                              target.parentNode?.appendChild(svg);
                            }}
                          />
                        </div>
                        
                        {/* Server name - truncates naturally, no max width */}
                        <span className="text-sm text-gray-900 dark:text-white truncate min-w-0 flex-shrink">
                          {server.name}
                        </span>
                        
                        {/* Server description if available - truncates naturally, no max width */}
                        {server.description && (
                          <span className="text-xs text-gray-500 dark:text-gray-400 truncate min-w-0 flex-shrink">
                            {server.description}
                          </span>
                        )}
                        
                        {/* Spacer to push user count to the right */}
                        <div className="flex-1 min-w-0"></div>
                        
                        {/* User count with animated dot */}
                        {server.users > 0 && (
                          <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                            <span>{server.users}</span>
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Loading/Empty states */}
                  {isExpanded && isLoading && (
                    <div className={`h-[34px] pl-[34px] pr-2 flex items-center ${
                      (index + servers.length + 1) % 2 === 0 
                        ? 'bg-white dark:bg-gray-900' 
                        : 'bg-gray-50 dark:bg-gray-800/50'
                    }`}>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Loading servers...</span>
                    </div>
                  )}
                  {isExpanded && !isLoading && servers.length === 0 && (
                    <div className={`h-[34px] pl-[34px] pr-2 flex items-center ${
                      (index + 1) % 2 === 0 
                        ? 'bg-white dark:bg-gray-900' 
                        : 'bg-gray-50 dark:bg-gray-800/50'
                    }`}>
                      <span className="text-xs text-gray-500 dark:text-gray-400">No servers found</span>
                    </div>
                  )}
                </>
                )}
              </SortableItem>
            ) : (
              // Regular server bookmark - compact list style
              <SortableItem key={bookmark.id} id={bookmark.id}>
                {(dragHandleProps) => (
                <>
                <div
                  onClick={() => handleConnect(bookmark)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const items: ContextMenuItem[] = [
                      {
                        label: 'Copy Link',
                        icon: '🔗',
                        action: () => {
                          const link = `hotline://${bookmark.address}:${bookmark.port}`;
                          navigator.clipboard.writeText(link);
                        },
                      },
                      {
                        label: 'Copy Address',
                        icon: '📋',
                        action: () => {
                          navigator.clipboard.writeText(`${bookmark.address}:${bookmark.port}`);
                        },
                      },
                      { divider: true, label: '', action: () => {} },
                      {
                        label: 'Edit Bookmark...',
                        icon: '✏️',
                        action: () => setEditingBookmark(bookmark),
                      },
                      { divider: true, label: '', action: () => {} },
                      {
                        label: 'Delete Bookmark',
                        icon: '🗑️',
                        action: () => setDeletingId(bookmark.id),
                      },
                    ];
                    showContextMenu(e, items);
                  }}
                  className={`h-[34px] px-2 flex items-center gap-1.5 group ${
                    isEven
                      ? 'bg-white dark:bg-gray-900'
                      : 'bg-gray-50 dark:bg-gray-800/50'
                  } hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
                >
                  {/* Drag handle - only draggable from here */}
                  <div
                    {...dragHandleProps}
                    className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-grab active:cursor-grabbing flex-shrink-0 w-[12px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Drag to reorder"
                  >
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M5 3h2v2H5V3zm0 4h2v2H5V7zm0 4h2v2H5v-2zm4-8h2v2H9V3zm0 4h2v2H9V7zm0 4h2v2H9v-2z"/>
                    </svg>
                  </div>

                  {/* Bookmark icon - 11x11, opacity 0.75 
                      This indicates it's a saved server bookmark (not a tracker).
                      In the Swift app, server bookmarks show bookmark.fill before the server icon. */}
                  <svg className="w-[11px] h-[11px] text-gray-400 dark:text-gray-500 opacity-75 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M2 2v12l6-3 6 3V2H2zm0-1h12a1 1 0 0 1 1 1v12a1 1 0 0 1-0.515 0.877l-6-3a1 1 0 0 1-0.97 0l-6 3A1 1 0 0 1 0 14V2a1 1 0 0 1 1-1z"/>
                  </svg>
                  
                  {/* Server icon - 16x16 */}
                  <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                    <img 
                      src="/icons/server.png" 
                      alt="Server" 
                      className="w-4 h-4"
                      onError={(e) => {
                        // Fallback to SVG if image not found
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                        svg.setAttribute('class', 'w-4 h-4 text-gray-600 dark:text-gray-400');
                        svg.setAttribute('viewBox', '0 0 16 16');
                        svg.setAttribute('fill', 'currentColor');
                        svg.innerHTML = '<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1" fill="none"/><circle cx="8" cy="8" r="2"/>';
                        target.parentNode?.appendChild(svg);
                      }}
                    />
                  </div>
                  
                  {/* Server name - not bold, no max width */}
                  <span className="text-sm text-gray-900 dark:text-white flex-1 truncate min-w-0">
                    {bookmark.name}
                  </span>
                  
                  {/* Edit/Delete/Connect buttons on hover */}
                  <div 
                    className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    onDragOver={(e) => {
                      // CRITICAL: preventDefault() to allow drop
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                  >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingBookmark(bookmark);
                  }}
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs px-1.5 py-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30"
                      title="Edit bookmark"
                >
                  Edit
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingId(bookmark.id);
                  }}
                      className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-xs px-1.5 py-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                      title="Delete bookmark"
                >
                  Delete
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConnect(bookmark);
                  }}
                  disabled={connectingId === bookmark.id}
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Connect to server"
                >
                  {connectingId === bookmark.id ? 'Connecting...' : 'Connect'}
                </button>
              </div>
                </div>

                {/* Connection error message for servers */}
                {connectionErrors.has(bookmark.id) && (
                  <div className={`px-2 py-1.5 bg-red-50 dark:bg-red-900/20 border-l-2 border-red-500 flex items-center justify-between gap-2 ${
                    isEven 
                      ? 'bg-red-50 dark:bg-red-900/20' 
                      : 'bg-red-100 dark:bg-red-900/30'
                  }`}>
                    <p className="text-xs text-red-800 dark:text-red-200 font-medium flex-1">
                      {connectionErrors.get(bookmark.id)}
                    </p>
                    <button
                      onClick={() => {
                        setConnectionErrors((prev) => {
                          const next = new Map(prev);
                          next.delete(bookmark.id);
                          return next;
                        });
                      }}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 text-xs font-medium"
                      aria-label="Dismiss error"
                    >
                      ✕
                    </button>
                  </div>
                )}
                </>
                )}
              </SortableItem>
            )
          );
        })}
          </div>
        </SortableContext>
      </DndContext>

      {/* Edit dialog */}
      {editingBookmark && (
        <EditBookmarkDialog
          bookmark={editingBookmark}
          onClose={() => setEditingBookmark(null)}
        />
      )}

      {/* Context menu */}
      <ContextMenuRenderer
        contextMenu={contextMenu}
        onClose={hideContextMenu}
      />

      {/* Delete confirmation dialog */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-sm mx-4">
            <div className="px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Delete Bookmark
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Are you sure you want to delete this bookmark? This action cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900/50 rounded-b-lg">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
