import { useCallback, useEffect, useRef, useState } from 'react';
import type { AIServices, Landmark } from '@edu/contract';

/**
 * DevPoseSim — a DEV-only manual harness for the hand/pose path (§5), now backed by
 * @mediapipe/tasks-vision (HandLandmarker). Mounted from main.tsx when `?pose` is present.
 *
 * It runs the exact `ctx.ai.detectPose` a game receives in a loop and draws the returned landmarks
 * over the live video, so a real hand in front of the webcam lights up 21 tracked points. The fake
 * flat-canvas camera (used in headless smoke tests) yields zero landmarks — proving the pipeline
 * loads/runs — while a real webcam proves it actually tracks. Not bundled in production.
 */
export function DevPoseSim({ ai }: { ai: AIServices }): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState('Loading the hand model on first detect…');

  const stop = useCallback(() => {
    runningRef.current = false;
    if (loopRef.current != null) window.clearTimeout(loopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }, []);

  useEffect(() => stop, [stop]);

  /** Draw the returned landmarks as dots over the video for visual confirmation. */
  const draw = useCallback((points: Landmark[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#57e6a5';
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x * canvas.width, p.y * canvas.height, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
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
      runningRef.current = true;

      const tick = async () => {
        if (!runningRef.current || !videoRef.current) return;
        const points = await ai.detectPose(videoRef.current);
        draw(points);
        setCount(points.length);
        setStatus(points.length > 0 ? '✋ Hand detected!' : 'Show a hand to the camera…');
        if (runningRef.current) loopRef.current = window.setTimeout(() => void tick(), 120);
      };
      void tick();
    } catch (e) {
      setError(`Camera blocked or unavailable: ${(e as Error).name} — ${(e as Error).message}`);
    }
  }, [ai, draw]);

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24, fontFamily: 'system-ui' }}>
      <h1 style={{ fontSize: '1.4rem' }}>✋ Joints toolbox — live hand tracking</h1>
      <p style={{ color: '#555' }}>
        Press <b>Start</b>, allow the camera, then hold your hand up. Green dots = the 21 hand landmarks
        MediaPipe Tasks Vision is tracking through <code>ctx.ai.detectPose</code>.
      </p>

      <div style={{ position: 'relative', width: 480, maxWidth: '100%' }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: '100%', borderRadius: 12, background: '#111', transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          width={480}
          height={360}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'scaleX(-1)' }}
        />
      </div>

      {error && <p style={{ color: '#c0392b', fontWeight: 600 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        {!cameraOn ? (
          <button type="button" className="edu-btn" onClick={() => void start()}>
            Start
          </button>
        ) : (
          <button type="button" className="edu-btn" onClick={stop}>
            Stop
          </button>
        )}
      </div>

      <p style={{ marginTop: 16, fontSize: '1.2rem' }} aria-live="polite">
        {status} <span style={{ color: '#777' }}>({count} landmarks)</span>
      </p>
    </div>
  );
}
