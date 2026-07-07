# PWA icons

Add the following binary PNG icons here before deploying (referenced by
`vite.config.ts` manifest and `index.html`):

- `pwa-192x192.png` — 192×192
- `pwa-512x512.png` — 512×512 (also used as maskable)
- `apple-touch-icon.png` — 180×180 (iOS home screen)

Quick way to generate from a single source image (requires ImageMagick):

```bash
convert logo.png -resize 192x192 public/pwa-192x192.png
convert logo.png -resize 512x512 public/pwa-512x512.png
convert logo.png -resize 180x180 public/apple-touch-icon.png
```

Or use https://realfavicongenerator.net and drop the outputs into `public/`.
