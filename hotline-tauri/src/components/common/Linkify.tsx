const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

interface LinkifyProps {
  text: string;
  className?: string;
}

export default function Linkify({ text, className }: LinkifyProps) {
  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
                ? import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(part))
                : window.open(part, '_blank');
            }}
            className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 break-all"
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </span>
  );
}
