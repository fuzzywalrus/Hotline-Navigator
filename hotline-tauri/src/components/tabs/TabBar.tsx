import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, removeTab, removeActiveServer } = useAppStore();

  const handleCloseTab = async (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    
    // Find the tab being closed
    const tab = tabs.find(t => t.id === tabId);
    
    // If it's a server tab, disconnect from the server first
    if (tab?.type === 'server' && tab.serverId) {
      try {
        await invoke('disconnect_from_server', { serverId: tab.serverId });
        // Remove from active servers
        removeActiveServer(tab.serverId);
      } catch (error) {
        console.error('Failed to disconnect from server:', error);
        // Still remove the tab even if disconnect fails
      }
    }
    
    // Remove the tab
    removeTab(tabId);
  };

  return (
    <div className="flex items-center bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 h-10 overflow-x-auto">
      <div className="flex items-center h-full min-w-0 flex-1">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab(tab.id);
            }}
            className={`
              flex items-center gap-2 px-4 h-full cursor-pointer border-r border-gray-200 dark:border-gray-700
              transition-colors min-w-[120px] max-w-[240px]
              ${activeTabId === tab.id
                ? 'bg-white dark:bg-gray-700 border-b-2 border-b-blue-500 dark:border-b-purple-500 text-gray-900 dark:text-white'
                : 'bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
              }
            `}
          >
            {/* Tab icon */}
            <span className="text-sm flex-shrink-0">
              {tab.type === 'tracker' ? '🌐' : '🖥️'}
            </span>
            
            {/* Tab title */}
            <span className="text-sm truncate flex-1 font-medium">
              {tab.title}
            </span>
            
            {/* Unread indicator */}
            {tab.unreadCount > 0 && (
              <span className="flex-shrink-0 bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {tab.unreadCount > 99 ? '99+' : tab.unreadCount}
              </span>
            )}
            
            {/* Close button - only show for server tabs, not tracker tabs */}
            {tab.type === 'server' && (
              <button
                onClick={(e) => handleCloseTab(e, tab.id)}
                className="flex-shrink-0 ml-1 w-4 h-4 rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                aria-label="Close tab"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
