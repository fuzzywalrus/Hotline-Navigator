import { useState, useEffect } from 'react';
import GeneralSettingsTab from './GeneralSettingsTab';
import IconSettingsTab from './IconSettingsTab';
import SoundSettingsTab from './SoundSettingsTab';
import KeyboardShortcutsTab from './KeyboardShortcutsTab';
import AboutSettingsTab from './AboutSettingsTab';
import UpdateSettingsTab from './UpdateSettingsTab';
import { useIsMobile } from '../../hooks/useIsMobile';

type SettingsTab = 'general' | 'icon' | 'sound' | 'shortcuts' | 'about' | 'updates';

interface SettingsViewProps {
  onClose: () => void;
}

export default function SettingsView({ onClose }: SettingsViewProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 300);
  };

  return (
    <div
      onClick={handleClose}
      className={`fixed inset-0 flex items-center justify-center z-50 transition-all duration-300 ease-in-out ${
        visible ? 'bg-black/60 backdrop-blur-sm' : 'bg-black/0 backdrop-blur-none'
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-2xl h-[600px] max-h-[90vh] mx-3 flex flex-col transition-all duration-300 ease-in-out ${
          visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
        }`}
      >
        {/* Header */}
        <div className="bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 py-4 flex items-center justify-between rounded-t-lg">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Settings
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Tabs - scrollable on narrow screens */}
        <div className="border-b border-gray-200 dark:border-gray-700 flex overflow-x-auto">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-3 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('icon')}
            className={`px-3 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'icon'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            Icon
          </button>
          <button
            onClick={() => setActiveTab('sound')}
            className={`px-3 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'sound'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            Sound
          </button>
          {!isMobile && (
            <button
              onClick={() => setActiveTab('shortcuts')}
              className={`px-3 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'shortcuts'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              Shortcuts
            </button>
          )}
          <button
            onClick={() => setActiveTab('about')}
            className={`px-3 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'about'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            About
          </button>
          <button
            onClick={() => setActiveTab('updates')}
            className={`px-3 md:px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'updates'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            Updates
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeTab === 'general' && <GeneralSettingsTab />}
          {activeTab === 'icon' && <IconSettingsTab />}
          {activeTab === 'sound' && <SoundSettingsTab />}
          {activeTab === 'shortcuts' && <KeyboardShortcutsTab />}
          {activeTab === 'about' && <AboutSettingsTab />}
          {activeTab === 'updates' && <UpdateSettingsTab />}
        </div>
      </div>
    </div>
  );
}

