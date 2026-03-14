import { useState } from 'react';
import { usePreferencesStore } from '../../stores/preferencesStore';

interface UserIconProps {
  iconId: number;
  size?: number;
  className?: string;
}

export default function UserIcon({ iconId, size = 16, className = '' }: UserIconProps) {
  const [localError, setLocalError] = useState(false);
  const [remoteError, setRemoteError] = useState(false);
  const useRemoteIcons = usePreferencesStore((s) => s.useRemoteIcons);

  const localPath = `/icons/classic/${iconId}.png`;
  const remotePath = `https://hlwiki.com/ik0ns/${iconId}.png`;

  const showRemote = localError && useRemoteIcons && !remoteError;
  const showFallback = localError && (!useRemoteIcons || remoteError);

  if (showFallback) {
    return (
      <div
        className={`inline-flex items-center justify-center bg-gray-300 dark:bg-gray-600 rounded text-xs ${className}`}
        style={{ width: size, height: size, fontSize: `${Math.max(8, size * 0.5)}px` }}
        title={`Icon ${iconId}`}
      >
        {iconId}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={showRemote ? remotePath : localPath}
        alt={`Icon ${iconId}`}
        className="w-full h-full object-contain"
        style={{ imageRendering: 'pixelated' }}
        onError={() => {
          if (!localError) setLocalError(true);
          else setRemoteError(true);
        }}
      />
    </div>
  );
}
