import { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';

export default function AboutSettingsTab() {
  const [version, setVersion] = useState<string>('0.1.1');

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {
      setVersion('0.1.1');
    });
  }, []);

  return (
    <div className="p-6 space-y-6">
      {/* Logo/Icon */}
      <div className="flex justify-center">
        <img
          src="/app-icon.png"
          alt="Hotline Navigator"
          className="w-20 h-20 rounded-lg object-contain"
          onError={(e) => {
            // Fallback to placeholder if image fails to load
            console.error('Failed to load app icon:', e);
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = 'flex';
            }
          }}
          onLoad={() => {
            console.log('App icon loaded successfully');
          }}
        />
        <div className="w-20 h-20 hidden items-center justify-center bg-blue-600 rounded-lg">
          <span className="text-3xl font-bold text-white">H</span>
        </div>
      </div>

      {/* App Name */}
      <div className="text-center">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
          Hotline Navigator
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Version {version}
        </p>
      </div>

      {/* Description */}
      <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
        <p>
          A multi-platform port of Hotline, using Tauri, designed for a single pane interface.
        </p>
      </div>

      {/* Credits */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Credits
        </h4>
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-2">
          <p>
            <strong>Author:</strong>{' '}
            <a
              href="https://greggant.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Greg Gant
            </a>
          </p>
          <p>
            Built with <span className="font-mono">Tauri</span>, <span className="font-mono">React</span>, and <span className="font-mono">TypeScript</span>
          </p>
          <p>
            Protocol implementation based on the Hotline protocol specification
          </p>
          <div className="pt-2 space-y-1">
            <p>
              <a
                href="https://github.com/fuzzywalrus/hotline"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                GitHub: fuzzywalrus/hotline
              </a>
            </p>
            <p className="text-gray-500 dark:text-gray-500">
              Forked from{' '}
              <a
                href="https://github.com/mierau/hotline"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                mierau/hotline
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="text-center text-xs text-gray-500 dark:text-gray-500 pt-2 border-t border-gray-200 dark:border-gray-700">
        <p>© 2025 Greg Gant</p>
      </div>
    </div>
  );
}

