interface ServerBannerProps {
  bannerUrl: string | null;
  serverName: string;
}

export default function ServerBanner({ bannerUrl, serverName }: ServerBannerProps) {
  if (!bannerUrl) return null;

  return (
    <div className="bg-gray-900 dark:bg-black border-b border-gray-700 flex items-center justify-center py-2 px-4 min-h-[60px]">
      <img
        src={bannerUrl}
        alt={`${serverName} Banner`}
        className="max-w-full h-auto max-h-[60px] object-contain"
        style={{ imageRendering: 'auto' }}
        onLoad={() => {
          console.log('✅ Banner image loaded successfully!');
          console.log('  URL:', bannerUrl);
        }}
        onError={(e) => {
          console.error('❌ Failed to load banner image');
          console.error('  URL:', bannerUrl);
          console.error('  Error event:', e);
          e.currentTarget.style.display = 'none';
        }}
      />
    </div>
  );
}

