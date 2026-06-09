import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIServices, Classification } from '@edu/contract';

/**
 * DevCameraSim — a DEV-only manual harness for the teachable-image camera path (§5).
 *
 * Unit tests prove the KNN teach→test logic against the jsdom canvas stub; this proves it for REAL:
 * a live webcam frame → `ctx.ai.trainImageClass` (KNN sample) → `ctx.ai.classifyImage`. It runs the
 * exact `AIServices` a game receives — the same `createAIServices()` instance — so what works here
 * works in a game. The pure KNN path needs only a camera + canvas (no model download, fully offline);
 * coco-ssd only ever acts as the fallback when nothing has been taught.
 *
 * Mounted from main.tsx when `?camera` is present (DEV). Not bundled in production.
 */

/** How many frames one "Teach" press captures — a few samples make KNN voting stable. */
const SAMPLES_PER_TEACH = 6;
const TEACH_LABELS = ['Thing A', 'Thing B'] as const;

export function DevCameraSim({ ai }: { ai: AIServices }): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taught, setTaught] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Classification | null>(null);

  /** Release the camera (stop tracks + detach) — see context7 /mdn/content getUserMedia cleanup. */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  // Always release the webcam on unmount — a dangling stream keeps the camera light on.
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      // video-only: we never want the mic for an image-classification demo.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => resolve();
      });
      await video.play();
      setCameraOn(true);
    } catch (e) {
      setError(`Camera blocked or unavailable: ${(e as Error).name} — ${(e as Error).message}`);
    }
  }, []);

  /** Capture SAMPLES_PER_TEACH frames of the live video as KNN samples for `label`. */
  const teach = useCallback(
    async (label: string) => {
      const video = videoRef.current;
      if (!video || !cameraOn) return;
      setBusy(`Teaching ${label}…`);
      for (let i = 0; i < SAMPLES_PER_TEACH; i++) {
        await ai.trainImageClass(label, video);
        await new Promise((r) => setTimeout(r, 80)); // small gap → slightly varied frames
      }
      setTaught((prev) => ({ ...prev, [label]: (prev[label] ?? 0) + SAMPLES_PER_TEACH }));
      setBusy(null);
    },
    [ai, cameraOn],
  );

  const test = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !cameraOn) return;
    setBusy('Looking…');
    const r = await ai.classifyImage(video);
    setResult(r);
    setBusy(null);
  }, [ai, cameraOn]);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.4rem' }}>📷 Camera toolbox — live teach → test</h1>
      <p style={{ color: '#555' }}>
        Teach the camera two things (hold an object up, press <b>Teach Thing A</b> a few times, then a
        different object for <b>Thing B</b>), then press <b>What is it?</b>. The taught class should win.
      </p>

      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: '100%', maxWidth: 480, background: '#111', borderRadius: 12, aspectRatio: '4 / 3' }}
      />

      {error && <p style={{ color: '#c0392b', fontWeight: 600 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {!cameraOn ? (
          <button type="button" className="edu-btn" onClick={() => void startCamera()}>
            Start camera
          </button>
        ) : (
          <>
            {TEACH_LABELS.map((label) => (
              <button key={label} type="button" className="edu-btn" disabled={!!busy} onClick={() => void teach(label)}>
                Teach {label} {taught[label] ? `(${taught[label]})` : ''}
              </button>
            ))}
            <button type="button" className="edu-btn" disabled={!!busy} onClick={() => void test()}>
              What is it?
            </button>
            <button type="button" className="edu-btn" onClick={stopCamera}>
              Stop camera
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: 16, minHeight: 60 }} aria-live="polite">
        {busy && <p>{busy}</p>}
        {result && (
          <p style={{ fontSize: '1.3rem' }}>
            I think this is <b>{result.label}</b>{' '}
            <span style={{ color: '#777' }}>({Math.round(result.confidence * 100)}% sure)</span>
          </p>
        )}
        <p style={{ color: '#777', fontSize: '0.85rem' }}>
          Taught classes: {Object.keys(taught).length === 0 ? 'none yet' : Object.entries(taught).map(([l, n]) => `${l}×${n}`).join(', ')}
          {' · '}With nothing taught, classify falls back to coco-ssd object detection.
        </p>
      </div>
    </div>
  );
}
