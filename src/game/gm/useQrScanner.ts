import { useEffect, useRef, useState } from 'react';

const SCAN_INTERVAL_MS = 200;
const REPEAT_GUARD_MS = 2_500;

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

type WindowWithDetector = Window & {
  BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
};

/**
 * Camera QR scanning. Platform `BarcodeDetector` where it exists, else jsQR —
 * imported dynamically so the decoder only reaches game masters. Needs HTTPS.
 */
export function useQrScanner(active: boolean, onDetect: (value: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<'denied' | 'unavailable' | null>(null);
  const [ready, setReady] = useState(false);

  // In a ref so restarting the camera isn't tied to the callback's identity.
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;

  useEffect(() => {
    if (!active) return;

    let stream: MediaStream | null = null;
    let timer: number | undefined;
    let cancelled = false;
    let lastValue = '';
    let lastSeenAt = 0;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const emit = (value: string) => {
      const now = Date.now();
      if (value === lastValue && now - lastSeenAt < REPEAT_GUARD_MS) return;
      lastValue = value;
      lastSeenAt = now;
      onDetectRef.current(value);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
      } catch {
        if (!cancelled) setError('denied');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      await video.play().catch(() => {});
      if (!cancelled) setReady(true);

      const detector = createDetector();
      const decodeFrame = detector ? nativeDecode(detector) : await jsQrDecode();
      if (!decodeFrame) {
        if (!cancelled) setError('unavailable');
        return;
      }

      const tick = async () => {
        if (cancelled) return;
        const el = videoRef.current;
        if (el && el.readyState >= 2 && el.videoWidth > 0) {
          try {
            const value = await decodeFrame(el, canvas, context);
            if (value) emit(value);
          } catch {
            /* A bad frame is normal. */
          }
        }
        timer = window.setTimeout(tick, SCAN_INTERVAL_MS);
      };
      void tick();
    };

    void start();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setReady(false);
    };
  }, [active]);

  return { videoRef, error, ready };
}

type DecodeFn = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D | null,
) => Promise<string | null>;

function createDetector(): BarcodeDetectorLike | null {
  const Detector = (window as WindowWithDetector).BarcodeDetector;
  if (!Detector) return null;
  try {
    return new Detector({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

function nativeDecode(detector: BarcodeDetectorLike): DecodeFn {
  return async (video) => {
    const results = await detector.detect(video);
    return results[0]?.rawValue ?? null;
  };
}

async function jsQrDecode(): Promise<DecodeFn | null> {
  try {
    const { default: jsQR } = await import('jsqr');
    return async (video, canvas, context) => {
      if (!context) return null;
      const scale = Math.min(1, 480 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(image.data, image.width, image.height, {
        inversionAttempts: 'dontInvert',
      });
      return result?.data ?? null;
    };
  } catch {
    return null;
  }
}
