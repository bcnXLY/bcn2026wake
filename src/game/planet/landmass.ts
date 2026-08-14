/**
 * Continents, as a stable field of points on the sphere.
 *
 * Deterministic value noise rather than anything imported: the continents must
 * look the same on all 300 phones, and this is a few lines against a dependency.
 */

function hash(x: number, y: number, z: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function noise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = smooth(x - xi);
  const v = smooth(y - yi);
  const w = smooth(z - zi);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);

  return lerp(
    lerp(
      lerp(corner(0, 0, 0), corner(1, 0, 0), u),
      lerp(corner(0, 1, 0), corner(1, 1, 0), u),
      v,
    ),
    lerp(
      lerp(corner(0, 0, 1), corner(1, 0, 1), u),
      lerp(corner(0, 1, 1), corner(1, 1, 1), u),
      v,
    ),
    w,
  );
}

function fbm(x: number, y: number, z: number): number {
  let total = 0;
  let amplitude = 0.5;
  let frequency = 1;
  for (let i = 0; i < 4; i += 1) {
    total += amplitude * noise(x * frequency, y * frequency, z * frequency);
    frequency *= 2;
    amplitude *= 0.5;
  }
  return total;
}

/**
 * Points spread evenly over the sphere (Fibonacci lattice), keeping only those
 * that land on a continent.
 */
export function landPoints(samples: number, radius: number): Float32Array {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const kept: number[] = [];

  for (let i = 0; i < samples; i += 1) {
    const y = 1 - (i / (samples - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    const x = Math.cos(theta) * ring;
    const z = Math.sin(theta) * ring;

    if (fbm(x * 1.7 + 4.2, y * 1.7 + 1.3, z * 1.7 + 8.8) > 0.505) {
      kept.push(x * radius, y * radius, z * radius);
    }
  }
  return new Float32Array(kept);
}

/** Meridians and parallels as line segments — the lat/long cage. */
export function graticule(radius: number): Float32Array {
  const PARALLELS = 11;
  const MERIDIANS = 22;
  const SEGMENTS = 84;
  const points: number[] = [];

  for (let i = 1; i < PARALLELS; i += 1) {
    const phi = (i / PARALLELS) * Math.PI;
    const ringRadius = Math.sin(phi) * radius;
    const y = Math.cos(phi) * radius;
    for (let s = 0; s < SEGMENTS; s += 1) {
      const a = (s / SEGMENTS) * Math.PI * 2;
      const b = ((s + 1) / SEGMENTS) * Math.PI * 2;
      points.push(Math.cos(a) * ringRadius, y, Math.sin(a) * ringRadius);
      points.push(Math.cos(b) * ringRadius, y, Math.sin(b) * ringRadius);
    }
  }

  for (let m = 0; m < MERIDIANS; m += 1) {
    const theta = (m / MERIDIANS) * Math.PI * 2;
    for (let s = 0; s < SEGMENTS / 2; s += 1) {
      const p0 = (s / (SEGMENTS / 2)) * Math.PI;
      const p1 = ((s + 1) / (SEGMENTS / 2)) * Math.PI;
      points.push(
        Math.cos(theta) * Math.sin(p0) * radius,
        Math.cos(p0) * radius,
        Math.sin(theta) * Math.sin(p0) * radius,
      );
      points.push(
        Math.cos(theta) * Math.sin(p1) * radius,
        Math.cos(p1) * radius,
        Math.sin(theta) * Math.sin(p1) * radius,
      );
    }
  }

  return new Float32Array(points);
}
