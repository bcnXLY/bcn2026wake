import { useEffect, useRef, useState } from 'react';
import { accentFor } from '../healthColor';
import {
  ATMOSPHERE_FRAGMENT,
  ATMOSPHERE_VERTEX,
  FOG_FRAGMENT,
  FOG_VERTEX,
} from './shaders';
import { graticule, landPoints } from './landmass';

/** Retina costs four times the pixels for very little on a sphere this size. */
const MAX_PIXEL_RATIO = 1.75;
/** Colour eases towards the new health over roughly this many seconds. */
const COLOUR_EASE = 1.4;
/**
 * The globe turns slowly, so 30fps is indistinguishable from 60 and halves the
 * GPU work — this runs for two hours on phones people need all week.
 */
const FRAME_MS = 1000 / 30;

const RADIUS = 1;

/**
 * The world: a lat/long cage with its continents picked out in points, sitting
 * inside a halo that hardens as the world runs out. three.js is imported
 * dynamically so it never blocks first paint, and the scene is built once —
 * health arrives through a ref, so polling rebuilds nothing.
 */
export default function Planet({
  health,
  dead,
  onGlitch,
}: {
  health: number;
  dead: boolean;
  /** Fired only on change, so the panel can tear along with the globe. */
  onGlitch?: (active: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef({ health, dead });
  const glitchRef = useRef(onGlitch);
  const wakeRef = useRef<(() => void) | null>(null);
  const [failed, setFailed] = useState(false);

  targetRef.current = { health, dead };
  glitchRef.current = onGlitch;

  // A collapsed world parks the render loop; a change has to start it again.
  useEffect(() => {
    wakeRef.current?.();
  }, [health, dead]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    void (async () => {
      let THREE: typeof import('three');
      try {
        THREE = await import('three');
      } catch {
        if (!disposed) setFailed(true);
        return;
      }
      if (disposed) return;

      let renderer: import('three').WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: 'low-power',
        });
      } catch {
        // No WebGL (old device, blocklisted driver, low-power mode).
        if (!disposed) setFailed(true);
        return;
      }

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
      renderer.setClearColor(0x000000, 0);
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
      camera.position.z = 3.2;

      const start = accentFor(health, dead);
      const accent = new THREE.Color(start.r / 255, start.g / 255, start.b / 255);

      const globe = new THREE.Group();
      globe.rotation.z = 0.36;
      scene.add(globe);

      // The core both hides the far side of the cage and holds the weather.
      const fogMaterial = new THREE.ShaderMaterial({
        vertexShader: FOG_VERTEX,
        fragmentShader: FOG_FRAGMENT,
        uniforms: {
          uColor: { value: accent.clone() },
          uTime: { value: 0 },
          uIntensity: { value: 1 },
        },
      });
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS * 0.985, 48, 32),
        fogMaterial,
      );
      globe.add(core);

      const gridGeometry = new THREE.BufferGeometry();
      gridGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(graticule(RADIUS), 3),
      );
      const gridMaterial = new THREE.LineBasicMaterial({
        color: accent.clone(),
        transparent: true,
        opacity: 0.3,
      });
      globe.add(new THREE.LineSegments(gridGeometry, gridMaterial));

      const landGeometry = new THREE.BufferGeometry();
      landGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(landPoints(16000, RADIUS * 1.004), 3),
      );
      const landMaterial = new THREE.PointsMaterial({
        color: accent.clone(),
        size: 0.03,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.95,
      });
      globe.add(new THREE.Points(landGeometry, landMaterial));

      const atmosphereMaterial = new THREE.ShaderMaterial({
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        uniforms: {
          uColor: { value: accent.clone() },
          uIntensity: { value: 1 },
        },
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
      });
      const atmosphere = new THREE.Mesh(
        new THREE.IcosahedronGeometry(RADIUS * 1.22, 3),
        atmosphereMaterial,
      );
      scene.add(atmosphere);

      const target = new THREE.Color();
      let frame = 0;
      let last = performance.now();
      let running = true;

      // The signal breaks up more often, and for longer, the worse things get.
      let burstUntil = 0;
      let nextBurst = performance.now() + 3000;
      let wasGlitching = false;
      let fogTime = 0;
      let settled = false;

      const resize = () => {
        const { clientWidth, clientHeight } = container;
        if (!clientWidth || !clientHeight) return;
        renderer.setSize(clientWidth, clientHeight, false);
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
        // A parked loop still has to repaint at the new size.
        if (settled) renderer.render(scene, camera);
      };
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(container);

      const draw = (now: number) => {
        if (now - last < FRAME_MS) {
          if (running) frame = requestAnimationFrame(draw);
          return;
        }
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;

        const { health: currentHealth, dead: isDead } = targetRef.current;
        const next = accentFor(currentHealth, isDead);
        target.setRGB(next.r / 255, next.g / 255, next.b / 255);

        // Ease, so a poll lands as a shift in the light and not a jump cut.
        accent.lerp(target, Math.min(dt / COLOUR_EASE, 1));
        gridMaterial.color.copy(accent);
        landMaterial.color.copy(accent);
        fogMaterial.uniforms.uColor.value.copy(accent);
        atmosphereMaterial.uniforms.uColor.value.copy(accent);

        const decay = 1 - Math.min(100, Math.max(0, currentHealth)) / 100;
        const violence = decay * decay;

        let opacity = 0.26 + decay * 0.3;
        let halo = 0.9 + decay * 1.5;

        if (isDead) {
          // Switched off: no spin, no weather, no glitch, barely any halo. It
          // just hangs there, and that is the point.
          opacity = 0.16;
          halo = 0.22;
          fogMaterial.uniforms.uIntensity.value = 0.22;
          globe.position.set(0, 0, 0);
          globe.scale.setScalar(1);
          if (wasGlitching) {
            wasGlitching = false;
            glitchRef.current?.(false);
          }
        } else {
          // The cloud keeps its own clock, so it stops dead with the world.
          fogTime += dt;
          fogMaterial.uniforms.uTime.value = fogTime;
          fogMaterial.uniforms.uIntensity.value = 0.85 + decay * 0.5;
        }

        if (!isDead && !reduceMotion) {
          globe.rotation.y += dt * 0.075;

          if (now >= nextBurst) {
            burstUntil = now + 70 + Math.random() * 160 * (0.4 + violence);
            // 7s apart at full health, under a second once it is dying.
            nextBurst = now + (900 + Math.random() * 6500 * (1 - violence * 0.92));
          }

          const glitching = now < burstUntil;
          if (glitching) {
            const shove = 0.03 + violence * 0.1;
            globe.position.set(
              (Math.random() - 0.5) * shove,
              (Math.random() - 0.5) * shove * 0.55,
              0,
            );
            globe.rotation.y += (Math.random() - 0.5) * 0.09 * (0.3 + violence);
            globe.scale.setScalar(1 + (Math.random() - 0.5) * 0.05 * (0.3 + violence));
            opacity = Math.min(1, opacity * 2.6);
            halo *= 1.7;
          } else if (globe.position.x !== 0) {
            globe.position.set(0, 0, 0);
            globe.scale.setScalar(1);
          }

          if (glitching !== wasGlitching) {
            wasGlitching = glitching;
            glitchRef.current?.(glitching);
          }
        }

        gridMaterial.opacity = opacity;
        atmosphereMaterial.uniforms.uIntensity.value = halo;

        renderer.render(scene, camera);

        // Once collapsed and the colour has finished draining, there is nothing
        // left to animate — park the loop and give the GPU back.
        const drift =
          Math.abs(accent.r - target.r) +
          Math.abs(accent.g - target.g) +
          Math.abs(accent.b - target.b);
        if (isDead && drift < 0.004) {
          accent.copy(target);
          settled = true;
          return;
        }

        if (running) frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);

      wakeRef.current = () => {
        if (!settled) return;
        settled = false;
        last = performance.now();
        if (running) frame = requestAnimationFrame(draw);
      };

      const onVisibility = () => {
        const visible = document.visibilityState === 'visible';
        if (visible && !running) {
          running = true;
          last = performance.now();
          if (!settled) frame = requestAnimationFrame(draw);
        } else if (!visible && running) {
          running = false;
          cancelAnimationFrame(frame);
        }
      };
      document.addEventListener('visibilitychange', onVisibility);

      cleanup = () => {
        running = false;
        wakeRef.current = null;
        cancelAnimationFrame(frame);
        if (wasGlitching) glitchRef.current?.(false);
        document.removeEventListener('visibilitychange', onVisibility);
        observer.disconnect();
        core.geometry.dispose();
        fogMaterial.dispose();
        gridGeometry.dispose();
        gridMaterial.dispose();
        landGeometry.dispose();
        landMaterial.dispose();
        atmosphere.geometry.dispose();
        atmosphereMaterial.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  if (failed) {
    return <div className="fo-planet fo-planet-flat" aria-hidden="true" />;
  }
  return <div className="fo-planet" ref={containerRef} aria-hidden="true" />;
}
