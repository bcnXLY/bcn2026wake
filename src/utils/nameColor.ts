/* ==========================================================================
   Per-person accent colour
   --------------------------------------------------------------------------
   Turns a profile name into a stable accent hue, so everyone gets their own
   tint and it never changes between logins (the name is the only input).

   The colour is built in OKLCH rather than HSL because HSL's lightness is a
   lie: hsl(60 90% 50%) (yellow) is far brighter than hsl(240 90% 50%) (blue),
   so a hue-rotated palette comes out uneven and some hues turn unreadable.
   OKLCH is perceptually uniform, so one fixed lightness reads the same at
   every hue. We do the conversion here in JS and emit plain sRGB, which keeps
   it working regardless of browser support for the oklch() colour function.
   ========================================================================== */

/** The surface every accent has to stay legible against (--surface). */
const SURFACE_RGB: [number, number, number] = [0xe8, 0xec, 0xf3];

/** WCAG AA for normal text — the accent is used on 11px badge labels. */
const MIN_CONTRAST = 4.5;

/** Lightness sweep: brightest (most vivid) legible value wins. */
const L_MAX = 0.68;
const L_MIN = 0.32;
const L_STEP = 0.005;

/** Target chroma. High enough to read as a real colour, short of neon. */
const BASE_CHROMA = 0.16;

// ---------------------------------------------------------------------------
// 1. Name -> hash
// ---------------------------------------------------------------------------

/**
 * Fold away the differences that shouldn't change someone's colour: casing,
 * stray whitespace, and accents ("José" and "Jose" are the same person).
 */
function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** FNV-1a, 32-bit. Math.imul keeps the multiply from overflowing to a float. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * murmur3 finaliser. FNV-1a alone leaves neighbouring short strings with
 * neighbouring low bits — "Team 1" and "Team 2" would land on near-identical
 * hues. This avalanches them apart.
 */
function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// 2. OKLCH -> sRGB
// ---------------------------------------------------------------------------

/** OKLCH -> linear sRGB (Björn Ottosson's OKLab matrices). */
function oklchToLinearRgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (c: number) => c >= -1e-4 && c <= 1 + 1e-4;

/** sRGB transfer function, linear -> 0..255. */
function encodeChannel(v: number): number {
  const clamped = Math.min(1, Math.max(0, v));
  const srgb = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(srgb * 255);
}

/**
 * Not every (L, H) pair can hold BASE_CHROMA inside sRGB — saturated yellows
 * and cyans clip badly. Walk the chroma down until the colour fits, so we get
 * the most saturated in-gamut version of the hue instead of a clipped mess.
 */
function fitChroma(L: number, C: number, H: number): [number, number, number] {
  let chroma = C;
  while (chroma > 0) {
    const rgb = oklchToLinearRgb(L, chroma, H);
    if (rgb.every(inGamut)) return rgb;
    chroma -= 0.005;
  }
  return oklchToLinearRgb(L, 0, H);
}

// ---------------------------------------------------------------------------
// 3. Contrast
// ---------------------------------------------------------------------------

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// 4. Public API
// ---------------------------------------------------------------------------

export interface AccentPalette {
  /** Hue in degrees — exposed mostly so it can be asserted in tests. */
  hue: number;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  ring: string;
}

/**
 * Derives a full accent palette from a name. Same name in, same palette out —
 * no storage, no server round-trip, so it survives logout and reinstalls.
 */
export function accentPaletteFor(name: string): AccentPalette {
  const hash = fmix32(fnv1a(normalizeName(name)));

  // Top 16 bits pick the hue; a separate slice nudges chroma so two names that
  // land on neighbouring hues still differ in vividness.
  const hue = ((hash >>> 16) / 0x10000) * 360;
  const chroma = BASE_CHROMA + (((hash >>> 8) & 0xff) / 0xff) * 0.04 - 0.02;

  // Brightest lightness that still clears AA against the surface. Descending,
  // so we stop at the most vivid legible colour rather than the safest one.
  let rgb: [number, number, number] = [0, 0, 0];
  for (let L = L_MAX; L >= L_MIN; L -= L_STEP) {
    const candidate = fitChroma(L, chroma, hue);
    const encoded: [number, number, number] = [
      encodeChannel(candidate[0]),
      encodeChannel(candidate[1]),
      encodeChannel(candidate[2]),
    ];
    if (contrastRatio(encoded, SURFACE_RGB) >= MIN_CONTRAST) {
      rgb = encoded;
      break;
    }
    rgb = encoded;
  }

  // --accent-strong is the pressed/hover state: same hue, a step darker.
  const strongLinear = fitChroma(
    Math.max(L_MIN, oklchLightnessOf(rgb) - 0.08),
    chroma,
    hue,
  );
  const strong: [number, number, number] = [
    encodeChannel(strongLinear[0]),
    encodeChannel(strongLinear[1]),
    encodeChannel(strongLinear[2]),
  ];

  const [r, g, b] = rgb;
  return {
    hue,
    accent: `rgb(${r}, ${g}, ${b})`,
    accentStrong: `rgb(${strong[0]}, ${strong[1]}, ${strong[2]})`,
    // Matches the shape of the original token: the accent at a 12% wash.
    accentSoft: `rgba(${r}, ${g}, ${b}, 0.12)`,
    ring: `rgba(${r}, ${g}, ${b}, 0.35)`,
  };
}

/** Rough inverse: OKLab L of an sRGB colour, used to step --accent-strong down. */
function oklchLightnessOf([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  const l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
  const m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
  const s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/**
 * Paints the palette onto :root. Passing null restores the stylesheet default,
 * which is what sign-out wants — the login screen is nobody's colour.
 */
export function applyAccentFor(name: string | null | undefined): void {
  const root = document.documentElement;
  const tokens = ['--accent', '--accent-strong', '--accent-soft', '--ring'];

  if (!name || !name.trim()) {
    tokens.forEach((token) => root.style.removeProperty(token));
    return;
  }

  const palette = accentPaletteFor(name);
  root.style.setProperty('--accent', palette.accent);
  root.style.setProperty('--accent-strong', palette.accentStrong);
  root.style.setProperty('--accent-soft', palette.accentSoft);
  root.style.setProperty('--ring', palette.ring);
}
