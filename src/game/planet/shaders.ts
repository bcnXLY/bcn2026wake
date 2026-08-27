/** Ashima simplex noise (MIT), the standard GLSL implementation. */
const SIMPLEX = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * snoise(p);
    p *= 2.1;
    amplitude *= 0.5;
  }
  return value;
}
`;

export const FOG_VERTEX = `
varying vec3 vLocal;
varying vec3 vNormal;
void main() {
  vLocal = position;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Cloud inside the globe — slow, churning, in the world's own colour, denser
 * toward the limb so the body reads as something with an inside. It runs on its
 * own clock, so freezing the world freezes the weather with it.
 */
export const FOG_FRAGMENT = `
precision mediump float;
uniform vec3 uColor;
uniform float uTime;
uniform float uIntensity;
varying vec3 vLocal;
varying vec3 vNormal;

${SIMPLEX}

void main() {
  vec3 p = vLocal * 2.1;
  float drift = uTime * 0.055;
  float n = fbm(p + vec3(drift, drift * 0.55, -drift * 0.35));
  float density = smoothstep(-0.25, 0.65, n);

  // Thicker at the edges, so it looks like depth rather than a painted texture.
  float limb = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), 1.7);

  vec3 base = vec3(0.022, 0.03, 0.052);
  vec3 fog = uColor * (0.14 + density * 1.05) * (0.42 + limb * 1.15);

  gl_FragColor = vec4(base + fog * uIntensity, 1.0);
}
`;

export const ATMOSPHERE_VERTEX = `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** The halo. It swells and hardens as the world runs out. */
export const ATMOSPHERE_FRAGMENT = `
precision mediump float;
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vNormal;

const float LIMB_FACING = 0.59;  // sqrt(1 - (0.985/1.22)^2), from the two radii
const float PEAK = 2.04;         // holds the previous brightness at the core's edge

void main() {
  float facing = max(-dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
  float rim = PEAK * pow(min(facing / LIMB_FACING, 1.0), 2.2);
  gl_FragColor = vec4(uColor, 1.0) * rim * uIntensity;
}
`;
