# App icons

All icons in this folder are derived from the brand mark — a black line figure
reaching for a gold star, originally supplied as a 512×512 white-background
JPEG. `logo.png` is the master: same artwork, trimmed and with the white
background converted to alpha. Everything here is committed, so nothing has to
be generated before deploying.

| File | Size | Used by |
| --- | --- | --- |
| `logo.png` | 234×421, transparent | in-app mark (login screen) |
| `favicon-16x16.png`, `favicon-32x32.png` | 16, 32 | `index.html` |
| `apple-touch-icon.png` | 180×180 | iOS home screen |
| `pwa-192x192.png`, `pwa-512x512.png` | 192, 512 | manifest (`vite.config.ts`) |
| `pwa-maskable-512x512.png` | 512×512 | manifest, `purpose: 'maskable'` |

## Regenerating

Resize from `logo.png`, not from the original JPEG. A plain
`convert logo.jpg -resize 192x192 …` won't do — two things matter:

- **Un-composite the white background into alpha** rather than keying it out, so
  the anti-aliased strokes stay smooth and the gold star keeps its colour. Then
  trim to the artwork — the JPEG has a lot of empty margin. (`logo.png` is
  already both.)
- **The maskable icon needs its own padding.** The figure is tall and narrow; at
  the normal icon scale Android's circular crop cuts off its head and feet, so
  that variant sits at ~62% of the canvas instead of ~82%.

Square icons are flattened onto `#e8ecf3` (`--bg`, and the manifest's
`background_color`) because iOS renders transparency as black.
