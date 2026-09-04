import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GalleryImage } from '../types';

interface Props {
  images: GalleryImage[];
  startIndex: number;
  onClose: () => void;
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
};

/** Drive names usually carry an extension; picsum/demo names don't. */
function fileNameFor(image: GalleryImage, mimeType?: string): string {
  const base = image.name.replace(/[\\/:*?"<>|]/g, '_').trim() || `photo-${image.id}`;
  if (/\.[a-z0-9]{3,4}$/i.test(base)) return base;
  return `${base}.${EXT_BY_TYPE[mimeType ?? ''] ?? 'jpg'}`;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke late — Safari reads the blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Full-screen, swipeable image viewer. Pure client-side UI — it reuses images
 * already loaded from Google Drive's CDN and makes no extra Drive API calls,
 * so paging through photos consumes zero API quota.
 */
export default function Lightbox({ images, startIndex, onClose }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(startIndex);
  const [downloading, setDownloading] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const prev = useCallback(
    () => setIndex((i) => (i - 1 + images.length) % images.length),
    [images.length],
  );
  const next = useCallback(() => setIndex((i) => (i + 1) % images.length), [images.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while open.
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [prev, next, onClose]);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 50) (dx > 0 ? prev : next)();
    touchStartX.current = null;
  };

  const img = images[index];

  /**
   * Downloads through a blob so the file lands in the user's downloads with a
   * sensible name. Drive's CDN doesn't always allow a cross-origin read, so on
   * any failure we hand the direct download URL to the browser instead.
   */
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    // Safari iOS blocks async window.open. Open a tab synchronously first.
    const newTab = window.open('', '_blank');
    try {
      const res = await fetch(img.fullUrl, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      saveBlob(blob, fileNameFor(img, blob.type));
      if (newTab) newTab.close();
    } catch {
      if (newTab) {
        newTab.location.href = img.downloadUrl;
      } else {
        window.open(img.downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose} style={{ cursor: 'pointer' }}>
      <div className="lb-topbar" onClick={(e) => e.stopPropagation()} style={{ cursor: 'default' }}>
        <button
          className="lb-btn"
          onClick={download}
          disabled={downloading}
          aria-label={t('gallery.download')}
          title={t('gallery.download')}
        >
          {downloading ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v12" />
              <path d="m7 11 5 5 5-5" />
              <path d="M4 20h16" />
            </svg>
          )}
        </button>

        <button className="lb-btn" onClick={onClose} aria-label={t('common.close')}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M5 5l14 14M19 5 5 19" />
          </svg>
        </button>
      </div>

      <div
        className="lb-stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {images.length > 1 && (
          <button className="lb-btn lb-nav prev" onClick={prev} aria-label={t('common.previous')}>
            ‹
          </button>
        )}

        <img className="lb-img" src={img.fullUrl} alt={img.name} draggable={false} />

        {images.length > 1 && (
          <button className="lb-btn lb-nav next" onClick={next} aria-label={t('common.next')}>
            ›
          </button>
        )}
      </div>

      <div className="lb-footer" onClick={(e) => e.stopPropagation()}>
        <span className="lb-counter">
          {index + 1} / {images.length}
        </span>
        <a href={img.webViewLink} target="_blank" rel="noopener noreferrer">
          {t('gallery.openDrive')}
        </a>
      </div>
    </div>
  );
}
