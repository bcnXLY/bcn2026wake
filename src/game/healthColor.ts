export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * The whole game reads its colour from here — the planet, the accents, the
 * warning states. Health is the only input, so nothing can drift out of step.
 */
/**
 * Blue to yellow passes through grey under any smooth interpolation, so the
 * grey is an explicit stop: the world drains of colour before it starts to
 * burn. Remove `ash` and the transition muddies rather than disappears.
 */
const STOPS: { at: number; color: Rgb }[] = [
  { at: 100, color: { r: 0x3f, g: 0xe0, b: 0x8a } }, // living
  { at: 78, color: { r: 0x3d, g: 0x9c, b: 0xf0 } }, // cooling
  { at: 58, color: { r: 0x8c, g: 0x93, b: 0xa0 } }, // ash
  { at: 40, color: { r: 0xf2, g: 0xc6, b: 0x3c } }, // parched
  { at: 22, color: { r: 0xf5, g: 0x82, b: 0x2c } }, // burning
  { at: 0, color: { r: 0xe8, g: 0x33, b: 0x2c } }, // gone
];

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

/** A collapsed world is not red and angry, it is switched off. */
export const DEAD_COLOR: Rgb = { r: 0x5b, g: 0x62, b: 0x6e };

export function accentFor(health: number, dead: boolean): Rgb {
  return dead ? DEAD_COLOR : healthColor(health);
}

export function healthColor(health: number): Rgb {
  const value = Math.min(100, Math.max(0, health));
  for (let i = 0; i < STOPS.length - 1; i += 1) {
    const upper = STOPS[i];
    const lower = STOPS[i + 1];
    if (value <= upper.at && value >= lower.at) {
      const span = upper.at - lower.at;
      return mix(upper.color, lower.color, span === 0 ? 0 : (upper.at - value) / span);
    }
  }
  return STOPS[STOPS.length - 1].color;
}

export function toCss({ r, g, b }: Rgb): string {
  return `rgb(${r} ${g} ${b})`;
}

/** For `rgba(var(--fo-rgb), a)`, which every browser at the event supports. */
export function toRgbTriple({ r, g, b }: Rgb): string {
  return `${r}, ${g}, ${b}`;
}

export type Severity = 'nominal' | 'strained' | 'degraded' | 'critical' | 'terminal';

export function severityOf(health: number): Severity {
  if (health <= 0) return 'terminal';
  if (health <= 15) return 'critical';
  if (health <= 40) return 'degraded';
  if (health <= 70) return 'strained';
  return 'nominal';
}
