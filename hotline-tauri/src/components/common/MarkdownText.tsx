import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePreferencesStore } from '../../stores/preferencesStore';
import Linkify from './Linkify';

// Patterns that suggest the text contains intentional markdown formatting.
// We only look for block-level or unambiguous inline syntax so that plain
// chat messages with stray asterisks or underscores aren't falsely detected.
const MD_PATTERNS = [
  /^#{1,6}\s/m,                      // headings
  /\[.+?\]\(.+?\)/,                  // [link](url)
  /!\[.*?\]\(.+?\)/,                 // ![image](url)
  /^(\*{3,}|-{3,}|_{3,})$/m,        // horizontal rules
  /^>\s/m,                           // blockquotes
  /^(\d+\.|-|\*)\s/m,               // lists
  /`[^`]+`/,                         // inline code
  /```/,                             // fenced code blocks
  /\*\*[^*]+\*\*/,                   // **bold**
  /\|.+\|.+\|/,                     // tables
];

function containsMarkdown(text: string): boolean {
  return MD_PATTERNS.some((re) => re.test(text));
}

function openUrl(url: string) {
  (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    ? import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url))
    : window.open(url, '_blank');
}

interface MarkdownTextProps {
  text: string;
  className?: string;
  /** When true, wrap plain-text fallback in Linkify. Defaults to true. */
  linkify?: boolean;
}

export default function MarkdownText({ text, className, linkify = true }: MarkdownTextProps) {
  const renderMarkdown = usePreferencesStore((s) => s.renderMarkdown);

  // If the setting is off, or the text doesn't look like markdown, fall back
  if (!renderMarkdown || !containsMarkdown(text)) {
    if (linkify) return <Linkify text={text} className={className} />;
    return <span className={className}>{text}</span>;
  }

  return (
    <div className={`markdown-content ${className ?? ''}`}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Open links via Tauri opener, not in webview
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              if (href) openUrl(href);
            }}
            className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 break-all"
          >
            {children}
          </a>
        ),
        // Render images inline with sane size limits
        img: ({ src, alt }) => (
          <a
            href={src}
            onClick={(e) => {
              e.preventDefault();
              if (src) openUrl(src);
            }}
            className="block my-1"
          >
            <img
              src={src}
              alt={alt ?? ''}
              className="max-w-[300px] max-h-[300px] object-contain rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </a>
        ),
        // Style code blocks
        code: ({ children, className: codeClassName }) => {
          const isBlock = codeClassName?.startsWith('language-');
          if (isBlock) {
            return (
              <pre className="bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-x-auto text-xs my-1">
                <code className={codeClassName}>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-gray-100 dark:bg-gray-800 rounded px-1 py-0.5 text-xs">
              {children}
            </code>
          );
        },
        // Headings — slightly larger to indicate headlines
        h1: ({ children }) => <p className="text-lg font-bold my-1">{children}</p>,
        h2: ({ children }) => <p className="text-lg font-bold my-1">{children}</p>,
        h3: ({ children }) => <p className="text-lg font-bold my-1">{children}</p>,
        h4: ({ children }) => <p className="text-lg font-bold my-1">{children}</p>,
        h5: ({ children }) => <p className="text-lg font-bold my-1">{children}</p>,
        h6: ({ children }) => <p className="text-lg font-bold my-1">{children}</p>,
        // Keep paragraphs tight for chat context
        p: ({ children }) => <p className="my-1">{children}</p>,
        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-300 dark:border-gray-600 pl-2 my-1 text-gray-600 dark:text-gray-400 italic">
            {children}
          </blockquote>
        ),
        // Lists
        ul: ({ children }) => <ul className="list-disc pl-4 my-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 my-1">{children}</ol>,
        // Tables
        table: ({ children }) => (
          <table className="border-collapse border border-gray-300 dark:border-gray-600 text-xs my-1">
            {children}
          </table>
        ),
        th: ({ children }) => (
          <th className="border border-gray-300 dark:border-gray-600 px-2 py-1 bg-gray-100 dark:bg-gray-800 font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-gray-300 dark:border-gray-600 px-2 py-1">{children}</td>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
    </div>
  );
}
