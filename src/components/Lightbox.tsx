import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GalleryImage } from '../types';

interface Props {
  images: GalleryImage[];
  startIndex: number;
  onClose: () => void;
}

/**
 * Full-screen, swipeable image viewer. Pure client-side UI — it reuses images
 * already loaded from Google Drive's CDN and makes no extra Drive API calls,
 * so paging through photos consumes zero API quota.
 */
export default function Lightbox({ images, startIndex, onClose }: Props) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(startIndex);
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

  return (
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <button className="lb-close" onClick={onClose} aria-label="Close">
        ✕
      </button>

      <div
        className="lb-stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {images.length > 1 && (
          <button className="lb-nav prev" onClick={prev} aria-label="Previous">
            ‹
          </button>
        )}

        <img className="lb-img" src={img.fullUrl} alt={img.name} draggable={false} />

        {images.length > 1 && (
          <button className="lb-nav next" onClick={next} aria-label="Next">
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
