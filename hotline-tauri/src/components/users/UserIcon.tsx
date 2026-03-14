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

  // Remote images: render at 1x natural size, clipped to container (no scaling)
  // Local images: scale to fit with pixelated rendering
  return (
    <div
      className={`inline-flex items-center justify-center overflow-hidden ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={showRemote ? remotePath : localPath}
        alt={`Icon ${iconId}`}
        className={showRemote ? "max-w-none max-h-none" : "w-full h-full object-contain"}
        style={showRemote ? { imageRendering: 'auto' } : { imageRendering: 'pixelated' }}
        onError={() => {
          if (!localError) setLocalError(true);
          else setRemoteError(true);
        }}
      />
    </div>
  );
}

/**
 * Renders a remote banner (232x18) as a row background.
 * Only shows when the local icon is missing and remote icons are enabled.
 */
export function UserBanner({ iconId }: { iconId: number }) {
  const [localExists, setLocalExists] = useState(true);
  const [remoteError, setRemoteError] = useState(false);
  const useRemoteIcons = usePreferencesStore((s) => s.useRemoteIcons);
  const showRemoteBanners = usePreferencesStore((s) => s.showRemoteBanners);

  const remotePath = `https://hlwiki.com/ik0ns/${iconId}.png`;

  // Probe local icon existence via a hidden img
  if (localExists) {
    return (
      <img
        src={`/icons/classic/${iconId}.png`}
        alt=""
        className="hidden"
        onLoad={() => setLocalExists(true)}
        onError={() => setLocalExists(false)}
      />
    );
  }

  if (!useRemoteIcons || !showRemoteBanners || remoteError) return null;

  return (
    <img
      src={remotePath}
      alt=""
      className="absolute left-0 top-0 h-full w-auto max-w-none opacity-80 pointer-events-none"
      style={{ imageRendering: 'auto' }}
      onError={() => setRemoteError(true)}
    />
  );
}
