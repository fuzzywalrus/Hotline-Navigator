import { usePreferencesStore } from '../../stores/preferencesStore';
import LinkPreview from './LinkPreview';
import ExternalImageCard from './ExternalImageCard';

const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg)(\?[^\s]*)?$/i;

function openUrl(url: string) {
  if ((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url));
  } else {
    window.open(url, '_blank');
  }
}

interface LinkifyProps {
  text: string;
  className?: string;
  hideImageUrls?: boolean; // When true, hide the URL text when an inline image renders
}

export default function Linkify({ text, className, hideImageUrls = false }: LinkifyProps) {
  const showInlineImages = usePreferencesStore((s) => s.showInlineImages);
  const showLinkPreviews = usePreferencesStore((s) => s.showLinkPreviews);
  const chatDisplayMode = usePreferencesStore((s) => s.chatDisplayMode);
  const isDiscordMode = chatDisplayMode === 'discord';
  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!URL_REGEX.test(part)) return part;

        const isImageUrl = IMAGE_EXT_REGEX.test(part);
        const isImage = showInlineImages && isImageUrl;

        if (isImageUrl && hideImageUrls && !showInlineImages) {
          return <ExternalImageCard key={i} url={part} />;
        }

        if (isImage && hideImageUrls) {
          // Discord mode: show only the image, no URL text
          return <ExternalImageCard key={i} url={part} />;
        }

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
            {isImage && <ExternalImageCard url={part} />}
            {!isImage && isDiscordMode && showLinkPreviews && <LinkPreview url={part} />}
          </span>
        );
      })}
    </span>
  );
}
