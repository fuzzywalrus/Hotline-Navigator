import { useState, useRef, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';
import { usePreferencesStore } from '../../stores/preferencesStore';
import type {
  MnemosyneSearchResponse,
  MnemosyneSearchResult,
  MnemosyneMsgboardData,
  MnemosyneNewsData,
  MnemosyneFileData,
} from '../../types';

interface MnemosyneStats {
  servers: { total: number; active: number };
  content: {
    msgboard_posts: number;
    news_articles: number;
    files: number;
    total_file_size: number;
  };
}

type ContentFilter = 'all' | 'msgboard' | 'news' | 'files';

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return trimmed;
}

interface MnemosyneWindowProps {
  mnemosyneId: string;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function ResultIcon({ type }: { type: string }) {
  switch (type) {
    case 'msgboard':
      return (
        <svg className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
      );
    case 'news':
      return (
        <svg className="w-4 h-4 text-amber-500 dark:text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      );
    case 'file':
      return (
        <svg className="w-4 h-4 text-green-500 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    default:
      return null;
  }
}

function TypeLabel({ type }: { type: string }) {
  const labels: Record<string, { text: string; color: string }> = {
    msgboard: { text: 'Board', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    news: { text: 'News', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    file: { text: 'File', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  };
  const label = labels[type] || { text: type, color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${label.color}`}>
      {label.text}
    </span>
  );
}

function SearchResultItem({ result, onConnect }: { result: MnemosyneSearchResult; onConnect: (address: string, name: string) => void }) {
  const data = result.data;

  let primary = '';
  let secondary = '';
  let meta = '';

  if (result.type === 'msgboard') {
    const d = data as MnemosyneMsgboardData;
    primary = d.body;
    secondary = d.nick;
    meta = d.timestamp ? new Date(d.timestamp).toLocaleDateString() : '';
  } else if (result.type === 'news') {
    const d = data as MnemosyneNewsData;
    primary = d.title || d.body;
    secondary = d.poster;
    meta = d.date || '';
  } else if (result.type === 'file') {
    const d = data as MnemosyneFileData;
    primary = d.name;
    secondary = d.path;
    meta = formatFileSize(d.size);
  }

  return (
    <div className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-100 dark:border-gray-800 group">
      <div className="flex items-start gap-2">
        <ResultIcon type={result.type} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <TypeLabel type={result.type} />
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {result.server_name}
            </span>
          </div>
          <p className="text-sm text-gray-900 dark:text-white line-clamp-2">
            {primary}
          </p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
            {secondary && <span>{secondary}</span>}
            {secondary && meta && <span>·</span>}
            {meta && <span>{meta}</span>}
          </div>
        </div>
        <button
          onClick={() => onConnect(result.server_address, result.server_name)}
          className="text-xs px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          title={`Connect to ${result.server_name} (${result.server_address})`}
        >
          Connect
        </button>
      </div>
    </div>
  );
}

export default function MnemosyneWindow({ mnemosyneId }: MnemosyneWindowProps) {
  const { mnemosyneBookmarks } = useAppStore();
  const bookmark = mnemosyneBookmarks.find((b) => b.id === mnemosyneId);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ContentFilter>('all');
  const [results, setResults] = useState<MnemosyneSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [stats, setStats] = useState<MnemosyneStats | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch stats on mount
  useEffect(() => {
    if (!bookmark) return;
    let cancelled = false;

    (async () => {
      try {
        const url = new URL('/api/v1/stats', normalizeUrl(bookmark.url));
        console.log(`[Mnemosyne] Fetching stats: ${url.toString()}`);
        const data = await invoke<MnemosyneStats>('mnemosyne_fetch', { url: url.toString() });
        if (!cancelled) {
          console.log('[Mnemosyne] Stats:', data);
          setStats(data);
        }
      } catch (err) {
        console.warn('[Mnemosyne] Failed to fetch stats:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [bookmark]);

  const doSearch = useCallback(async (searchQuery: string, contentFilter: ContentFilter) => {
    if (!bookmark || !searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const url = new URL('/api/v1/search', normalizeUrl(bookmark.url));
      url.searchParams.set('q', searchQuery.trim());
      url.searchParams.set('limit', '20');
      if (contentFilter !== 'all') {
        url.searchParams.set('type', contentFilter);
      }

      console.log(`[Mnemosyne] Searching: ${url.toString()}`);
      const t0 = performance.now();

      const data = await invoke<MnemosyneSearchResponse>('mnemosyne_fetch', { url: url.toString() });

      const elapsed = (performance.now() - t0).toFixed(0);
      console.log(`[Mnemosyne] Response in ${elapsed}ms`);
      console.log(`[Mnemosyne] Results: ${data.results.length} of ${data.total} total`);
      if (data.results.length > 0) {
        console.log('[Mnemosyne] First result:', data.results[0]);
      }
      setResults(data);
    } catch (err: any) {
      console.error('[Mnemosyne] Search error:', err);
      setError(err.message || err || 'Search failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, [bookmark]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    doSearch(query, filter);
  };

  const handleFilterChange = (newFilter: ContentFilter) => {
    setFilter(newFilter);
    if (query.trim() && hasSearched) {
      doSearch(query, newFilter);
    }
  };

  const handleConnect = async (address: string, serverName: string) => {
    const [host, portStr] = address.includes(':') ? address.split(':') : [address, '5500'];
    const port = parseInt(portStr, 10) || 5500;

    const { addTab, addActiveServer, tabs, serverInfo, setActiveTab } = useAppStore.getState();

    // Check if already connected
    const existingTab = tabs.find(t => {
      if (t.type !== 'server' || !t.serverId) return false;
      const info = serverInfo.get(t.serverId);
      return info?.address === host;
    });
    if (existingTab) {
      setActiveTab(existingTab.id);
      return;
    }

    const { username, userIconId, autoDetectTls, allowLegacyTls } = usePreferencesStore.getState();

    try {
      const result = await invoke<{ serverId: string; tls: boolean; port: number }>('connect_to_server', {
        bookmark: {
          id: crypto.randomUUID(),
          name: serverName,
          address: host,
          port,
          login: 'guest',
          type: 'server',
        },
        username,
        userIconId,
        autoDetectTls,
        allowLegacyTls,
      });

      addActiveServer(result.serverId, {
        id: result.serverId,
        name: serverName,
        address: host,
        port: result.port,
        tls: result.tls,
      });
      addTab({
        id: `server-${result.serverId}`,
        type: 'server',
        serverId: result.serverId,
        title: serverName,
        unreadCount: 0,
      });
    } catch (err) {
      console.error('Failed to connect from Mnemosyne result:', err);
    }
  };

  if (!bookmark) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
        Mnemosyne instance not found
      </div>
    );
  }

  const filters: { key: ContentFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'msgboard', label: 'Board' },
    { key: 'news', label: 'News' },
    { key: 'files', label: 'Files' },
  ];

  return (
    <div className="h-full w-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex flex-col border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h1 className="text-base font-semibold text-gray-900 dark:text-white">
              {bookmark.name}
            </h1>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[200px]" title={bookmark.url}>
            {bookmark.url}
          </span>
        </div>

        {/* Search bar */}
        <form onSubmit={handleSubmit} className="px-4 pb-2">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              placeholder="Search servers, files, news, boards..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-3 py-2 pl-9 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            <svg
              className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setResults(null);
                  setHasSearched(false);
                  inputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </form>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 px-4 pb-2">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => handleFilterChange(f.key)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filter === f.key
                  ? 'bg-purple-600 text-white dark:bg-purple-500'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-auto">
        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-gray-300 dark:border-gray-600 border-t-purple-600 dark:border-t-purple-400 rounded-full animate-spin"></div>
            <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Searching...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={() => doSearch(query, filter)}
              className="mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state - before any search */}
        {!loading && !error && !hasSearched && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <p className="text-sm">Search across Hotline servers</p>
            <p className="text-xs mt-1 opacity-75">Find files, news, and message board posts</p>
            {stats && (
              <div className="flex items-center gap-4 mt-4 text-xs opacity-75">
                <span>{stats.servers.active} server{stats.servers.active !== 1 ? 's' : ''} indexed</span>
                <span>{stats.content.files.toLocaleString()} files</span>
                <span>{stats.content.msgboard_posts.toLocaleString()} posts</span>
                <span>{stats.content.news_articles.toLocaleString()} articles</span>
              </div>
            )}
          </div>
        )}

        {/* No results */}
        {!loading && !error && hasSearched && results && results.results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <p className="text-sm">No results found</p>
            <p className="text-xs mt-1 opacity-75">Try different keywords or filters</p>
          </div>
        )}

        {/* Results list */}
        {!loading && results && results.results.length > 0 && (
          <>
            <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
              {results.total} result{results.total !== 1 ? 's' : ''} found
            </div>
            {results.results.map((result, i) => (
              <SearchResultItem
                key={`${result.type}-${result.server_id}-${i}`}
                result={result}
                onConnect={handleConnect}
              />
            ))}
            {results.total > results.results.length && (
              <div className="px-4 py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                Showing {results.results.length} of {results.total} results
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
