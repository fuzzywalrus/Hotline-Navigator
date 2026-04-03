import { useCallback, useEffect, useState } from 'react';

interface FeatureAnnouncementProps {
  title: string;
  body: string;
  acceptLabel: string;
  dismissLabel?: string;
  onAccept: () => void;
  onClose: () => void;
}

export default function FeatureAnnouncement({
  title,
  body,
  acceptLabel,
  dismissLabel = 'Not Now',
  onAccept,
  onClose,
}: FeatureAnnouncementProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 300);
  }, [onClose]);

  const handleAccept = useCallback(() => {
    setVisible(false);
    setTimeout(onAccept, 300);
  }, [onAccept]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  return (
    <div
      onClick={handleClose}
      className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-300 ease-in-out ${
        visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/0 backdrop-blur-none'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 transition-all duration-300 ease-in-out ${
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
        </div>

        <div className="px-6 py-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {body}
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button
            onClick={handleClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            {dismissLabel}
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors"
          >
            {acceptLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
