import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAlbums, fetchGalleryImages } from '../../services/googleDrive';
import type { GalleryAlbum, GalleryImage } from '../../types';
import Lightbox from '../Lightbox';

export default function GalleryTab() {
  const { t } = useTranslation();

  const [albums, setAlbums] = useState<GalleryAlbum[] | null>(null);
  const [albumsError, setAlbumsError] = useState(false);

  const [selected, setSelected] = useState<GalleryAlbum | null>(null);
  const [images, setImages] = useState<GalleryImage[] | null>(null);
  const [imagesError, setImagesError] = useState(false);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const loadAlbums = () => {
    setAlbumsError(false);
    setAlbums(null);
    fetchAlbums()
      .then(setAlbums)
      .catch(() => setAlbumsError(true));
  };

  useEffect(loadAlbums, []);

  const openAlbum = (album: GalleryAlbum) => {
    setSelected(album);
    setImages(null);
    setImagesError(false);
    fetchGalleryImages(album.id)
      .then(setImages)
      .catch(() => setImagesError(true));
  };

  const closeAlbum = () => {
    setSelected(null);
    setImages(null);
    setLightboxIndex(null);
  };

  // ---- Album (photo grid) view ----
  if (selected) {
    return (
      <section role="tabpanel">
        <button className="back-btn" onClick={closeAlbum}>
          <span aria-hidden="true">‹</span> {t('gallery.albums')}
        </button>
        <h2 className="tab-title">{selected.name}</h2>

        {imagesError && (
          <div className="center-state">
            <p>{t('gallery.loadError')}</p>
            <button className="btn ghost" onClick={() => openAlbum(selected)}>
              {t('common.retry')}
            </button>
          </div>
        )}

        {!imagesError && images === null && (
          <div className="center-state">{t('common.loading')}</div>
        )}

        {!imagesError && images?.length === 0 && (
          <div className="center-state">{t('gallery.empty')}</div>
        )}

        {!imagesError && images && images.length > 0 && (
          <div className="gallery-grid">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightboxIndex(i)}
                aria-label={img.name}
              >
                <img
                  src={img.thumbnailUrl}
                  alt={img.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </button>
            ))}
          </div>
        )}

        {lightboxIndex !== null && images && (
          <Lightbox
            images={images}
            startIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
          />
        )}
      </section>
    );
  }

  // ---- Albums list view ----
  return (
    <section role="tabpanel">
      <h2 className="tab-title">{t('gallery.title')}</h2>

      {albumsError && (
        <div className="center-state">
          <p>{t('gallery.loadError')}</p>
          <button className="btn ghost" onClick={loadAlbums}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {!albumsError && albums === null && <div className="center-state">{t('common.loading')}</div>}

      {!albumsError && albums?.length === 0 && (
        <div className="center-state">{t('gallery.empty')}</div>
      )}

      {!albumsError && albums && albums.length > 0 && (
        <div className="album-grid">
          {albums.map((album) => (
            <button
              key={album.id}
              type="button"
              className="album-tile"
              onClick={() => openAlbum(album)}
            >
              {album.coverUrl ? (
                <img
                  className="album-cover"
                  src={album.coverUrl}
                  alt={album.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="album-cover placeholder" aria-hidden="true">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </div>
              )}
              <div className="album-meta">
                <div className="album-name">{album.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
