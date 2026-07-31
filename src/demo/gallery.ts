import type { GalleryAlbum, GalleryImage } from '../types';
import demoData from './data.json';

/** Mock album list shown in the gallery when running in demo mode. */
export function demoAlbums(): GalleryAlbum[] {
  return demoData.gallery.albums.map((name, i) => ({
    id: `album-${i}`,
    name,
    coverUrl: `https://picsum.photos/seed/album${i}/600/450`,
  }));
}

/** Mock images for a demo album, seeded from the requested folder id. */
export function demoGalleryImages(target: string): GalleryImage[] {
  const seed = target.replace(/\D/g, '') || '0';
  return Array.from({ length: 9 }, (_, i) => {
    const s = `${seed}${i}`;
    return {
      id: `demo-${s}`,
      name: `Photo ${i + 1}`,
      thumbnailUrl: `https://picsum.photos/seed/g${s}/400/400`,
      fullUrl: `https://picsum.photos/seed/g${s}/1600/1600`,
      webViewLink: `https://picsum.photos/seed/g${s}/1600/1600`,
      downloadUrl: `https://picsum.photos/seed/g${s}/1600/1600`,
    };
  });
}
