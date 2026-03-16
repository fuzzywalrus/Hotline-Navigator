import { useState } from 'react';
import { usePreferencesStore } from '../../stores/preferencesStore';

const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg)(\?[^\s]*)?$/i;

function openUrl(url: string) {
  (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ? import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url))
    : window.open(url, '_blank');
}

function InlineImage({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <a
      href={url}
      onClick={(e) => {
        e.preventDefault();
        openUrl(url);
      }}
      className="block my-1"
    >
      <img
        src={url}
        alt=""
        onError={() => setFailed(true)}
        className="max-w-[300px] max-h-[300px] object-contain rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
      />
    </a>
  );
}

interface LinkifyProps {
  text: string;
  className?: string;
}

export default function Linkify({ text, className }: LinkifyProps) {
  const showInlineImages = usePreferencesStore((s) => s.showInlineImages);
  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!URL_REGEX.test(part)) return part;

        const isImage = showInlineImages && IMAGE_EXT_REGEX.test(part);

        return (
          <span key={i}>
            <a
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.preventDefault();
                openUrl(part);
              }}
              className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 break-all"
            >
              {part}
            </a>
            {isImage && <InlineImage url={part} />}
          </span>
        );
      })}
    </span>
  );
}
