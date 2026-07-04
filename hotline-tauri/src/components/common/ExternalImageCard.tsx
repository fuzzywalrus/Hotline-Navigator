import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { usePreferencesStore } from '../../stores/preferencesStore';

interface FetchedExternalImage {
  bytesBase64: string;
  mime: string;
}

function openUrl(url: string) {
  if ((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
    import('@tauri-apps/plugin-opener').then(({ openUrl }) => openUrl(url));
  } else {
    window.open(url, '_blank');
  }
}

function getDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function base64ToBlob(b64: string, mime: string): Blob {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

interface ExternalImageCardProps {
  url: string;
  alt?: string;
}

export default function ExternalImageCard({ url, alt }: ExternalImageCardProps) {
  const showInlineImages = usePreferencesStore((s) => s.showInlineImages);
  const setShowInlineImages = usePreferencesStore((s) => s.setShowInlineImages);
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'failed'>(
    showInlineImages ? 'loading' : 'idle',
  );
  const [bytesUrl, setBytesUrl] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState<string | null>(null);
  const inflightRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    inflightRef.current = false;
    setBytesUrl(null);
    setFailureReason(null);
    setState(showInlineImages ? 'loading' : 'idle');
  }, [showInlineImages, url]);

  const loadImage = () => {
    if (inflightRef.current) return;

    inflightRef.current = true;
    setState('loading');
    setFailureReason(null);

    invoke<FetchedExternalImage>('fetch_external_image', { url })
      .then((result) => {
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const blob = base64ToBlob(result.bytesBase64, result.mime);
        const nextUrl = URL.createObjectURL(blob);
        blobUrlRef.current = nextUrl;
        setBytesUrl(nextUrl);
        setState('loaded');
      })
      .catch((err: unknown) => {
        setFailureReason(typeof err === 'string' ? err : String(err));
        setState('failed');
      })
      .finally(() => {
        inflightRef.current = false;
      });
  };

  useEffect(() => {
    if (showInlineImages && (state === 'idle' || state === 'loading') && !bytesUrl) {
      loadImage();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInlineImages, state, bytesUrl, url]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  if (state === 'loaded' && bytesUrl) {
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
          src={bytesUrl}
          alt={alt ?? ''}
          className="max-w-[300px] max-h-[300px] object-contain rounded border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity"
        />
      </a>
    );
  }

  if (state === 'loading') {
    return (
      <div className="my-1 inline-block">
        <div className="h-28 w-56 animate-pulse rounded border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800" />
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Loading image preview…
        </div>
      </div>
    );
  }

  return (
    <div className="my-1 max-w-[300px] rounded border border-gray-200 bg-gray-50 px-3 py-2 text-left dark:border-gray-700 dark:bg-gray-800/50">
      <button
        type="button"
        onClick={() => openUrl(url)}
        className="block w-full text-left"
      >
        <span className="block text-xs font-semibold text-gray-700 dark:text-gray-200">
          {alt?.trim() || 'External image'}
        </span>
        <span className="mt-0.5 block break-all text-xs text-blue-600 dark:text-blue-400">
          {getDisplayUrl(url)}
        </span>
      </button>
      <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
        {state === 'failed' && failureReason
          ? `Preview failed: ${failureReason}`
          : 'Load this image once, or enable automatic external image previews.'}
      </span>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={loadImage}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          {state === 'failed' ? 'Retry' : 'Load image'}
        </button>
        <label className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={showInlineImages}
            onChange={(e) => setShowInlineImages(e.target.checked)}
            className="toggle toggle-xs"
          />
          Always load external images
        </label>
      </div>
    </div>
  );
}
