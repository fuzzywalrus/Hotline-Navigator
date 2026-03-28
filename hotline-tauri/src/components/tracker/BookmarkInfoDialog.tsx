import { useState, useEffect } from 'react';
import type { Bookmark } from '../../types';

interface BookmarkInfoDialogProps {
  bookmark: Bookmark;
  onClose: () => void;
}

export default function BookmarkInfoDialog({ bookmark, onClose }: BookmarkInfoDialogProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  const isTracker = bookmark.type === 'tracker' || bookmark.port === 5498;
  const scheme = isTracker ? 'hotlinetracker' : 'hotline';
  const defaultPort = isTracker ? 5498 : 5500;
  const url = bookmark.port === defaultPort
    ? `${scheme}://${bookmark.address}`
    : `${scheme}://${bookmark.address}:${bookmark.port}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const rows: { label: string; value: string }[] = [
    { label: 'Name', value: bookmark.name || '(unnamed)' },
    { label: 'Address', value: bookmark.address },
    { label: 'Port', value: String(bookmark.port) },
  ];

  if (bookmark.login && bookmark.login !== 'guest') {
    rows.push({ label: 'Login', value: bookmark.login });
  }

  if (bookmark.tls) {
    rows.push({ label: 'TLS', value: 'Enabled' });
  }

  if (bookmark.hope) {
    rows.push({ label: 'HOPE', value: 'Enabled' });
  }

  rows.push({ label: 'Type', value: isTracker ? 'Tracker' : 'Server' });
  rows.push({ label: 'URL', value: url });

  return (
    <div
      onClick={handleClose}
      className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-300 ease-in-out ${
        visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/0 backdrop-blur-none'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm mx-4 transition-all duration-300 ease-in-out ${
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
      >
        <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            {bookmark.name || bookmark.address}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start gap-3">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16 flex-shrink-0 pt-0.5 text-right">
                {row.label}
              </span>
              <span className="text-sm text-gray-900 dark:text-white break-all flex-1 select-all">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-2 px-6 py-4 bg-gray-50 dark:bg-gray-900/50 rounded-b-lg">
          <button
            onClick={() => copyToClipboard(url)}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            Copy URL
          </button>
          <button
            onClick={() => copyToClipboard(`${bookmark.address}:${bookmark.port}`)}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            Copy Address
          </button>
        </div>
      </div>
    </div>
  );
}
