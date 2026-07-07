import { config } from '../config';
import type { GalleryImage, GalleryAlbum } from '../types';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
}

const DRIVE_LIST = 'https://www.googleapis.com/drive/v3/files';

function thumb(f: DriveFile, size: number): string {
  return f.thumbnailLink
    ? f.thumbnailLink.replace(/=s\d+$/, `=s${size}`)
    : `https://drive.google.com/thumbnail?id=${f.id}&sz=w${size}`;
}

function toImage(f: DriveFile): GalleryImage {
  return {
    id: f.id,
    name: f.name,
    thumbnailUrl: thumb(f, 400),
    fullUrl: `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`,
    webViewLink: `https://drive.google.com/file/d/${f.id}/view`,
  };
}

async function listFiles(query: string, extraFields = ''): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: query,
    key: config.googleDrive.apiKey,
    fields: `files(id,name,mimeType${extraFields})`,
    orderBy: 'name',
    pageSize: '200',
  });
  const res = await fetch(`${DRIVE_LIST}?${params.toString()}`);
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  const data = (await res.json()) as { files?: DriveFile[] };
  return data.files ?? [];
}

/**
 * Lists the event albums — i.e. the subfolders of the configured public parent
 * folder. Subfolders inherit the parent's "anyone with the link" access, so the
 * same browser API key can read them all. A cover thumbnail is fetched per album
 * (one lightweight call each) for a nicer preview.
 */
export async function fetchAlbums(): Promise<GalleryAlbum[]> {
  if (config.demoMode) {
    return ['Opening Day', 'Workshops', 'Evening Social'].map((name, i) => ({
      id: `album-${i}`,
      name,
      coverUrl: `https://picsum.photos/seed/album${i}/600/450`,
    }));
  }

  const folders = await listFiles(
    `'${config.googleDrive.folderId}' in parents and ` +
      `mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );

  return Promise.all(
    folders.map(async (folder) => {
      let coverUrl: string | undefined;
      try {
        const [cover] = await listFiles(
          `'${folder.id}' in parents and mimeType contains 'image/' and trashed = false`,
          ',thumbnailLink',
        );
        if (cover) coverUrl = thumb(cover, 600);
      } catch {
        // Cover is optional; fall back to a placeholder tile.
      }
      return { id: folder.id, name: folder.name, coverUrl };
    }),
  );
}

/**
 * Fetches image files from a Drive folder (an album). Defaults to the parent
 * folder when no album id is supplied (flat-gallery fallback). Image bytes are
 * served by Google's CDN and do not count against the Drive API quota.
 */
export async function fetchGalleryImages(folderId?: string): Promise<GalleryImage[]> {
  const target = folderId ?? config.googleDrive.folderId;

  if (config.demoMode) {
    const seed = target.replace(/\D/g, '') || '0';
    return Array.from({ length: 9 }, (_, i) => {
      const s = `${seed}${i}`;
      return {
        id: `demo-${s}`,
        name: `Photo ${i + 1}`,
        thumbnailUrl: `https://picsum.photos/seed/g${s}/400/400`,
        fullUrl: `https://picsum.photos/seed/g${s}/1600/1600`,
        webViewLink: `https://picsum.photos/seed/g${s}/1600/1600`,
      };
    });
  }

  const files = await listFiles(
    `'${target}' in parents and mimeType contains 'image/' and trashed = false`,
    ',thumbnailLink',
  );
  return files.map(toImage);
}
