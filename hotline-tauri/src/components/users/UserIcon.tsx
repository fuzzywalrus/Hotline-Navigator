import { useState } from 'react';

interface UserIconProps {
  iconId: number;
  size?: number;
  className?: string;
}

export default function UserIcon({ iconId, size = 16, className = '' }: UserIconProps) {
  const [imageError, setImageError] = useState(false);
  const iconPath = `/icons/classic/${iconId}.png`;
  
  if (imageError) {
    // Fallback: show icon ID as text
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
        src={iconPath}
        alt={`Icon ${iconId}`}
        className="w-full h-full object-contain"
        style={{ imageRendering: 'pixelated' }}
        onError={() => setImageError(true)}
      />
    </div>
  );
}

