interface AttachChipProps {
  filename?: string;
  mime: string;
  byteSize: number;
  width?: number;
  height?: number;
  onRemove: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachChip({
  filename,
  mime,
  byteSize,
  width,
  height,
  onRemove,
}: AttachChipProps) {
  const dims = width && height ? `${width}×${height}` : null;
  return (
    <div className="inline-flex items-center gap-2 px-2 py-1 mb-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-md text-xs">
      <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
      <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[160px]">
        {filename ?? mime}
      </span>
      <span className="text-gray-500 dark:text-gray-400">{formatBytes(byteSize)}</span>
      {dims && <span className="text-gray-400 dark:text-gray-500">{dims}</span>}
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 text-gray-400 hover:text-red-500 transition-colors"
        title="Remove attachment"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
