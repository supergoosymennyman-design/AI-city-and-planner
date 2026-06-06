import type { CSSProperties, FC, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Shape } from '../logic/types.js';

/**
 * Props for {@link PaintableShape}.
 *
 * The hero interaction: the child drags to scribble crayon strokes inside a
 * colouring-book outline; coverage progressively fills it; at `threshold` it snaps full
 * and fires {@link onFilled}. A keyboard/tap "Fill it!" button does the same instantly —
 * so drawing is the DELIGHT and the button is the GUARANTEED-accessible path (§6b).
 */
export interface PaintableShapeProps {
  shape: Shape;
  /** Selected paint colour (hex), or null = none picked yet (drawing is inert). */
  colour: string | null;
  /** Controlled completed state — once true, the shape renders fully filled. */
  filled: boolean;
  /** Fired exactly once when coverage crosses `threshold` OR "Fill it!" is pressed. */
  onFilled: () => void;
  /** Coverage fraction (0–1) that auto-completes the fill. Default 0.6. */
  threshold?: number;
  /** Honour prefers-reduced-motion: skip the sparkle burst (§6b R19). */
  reducedMotion?: boolean;
  fillLabel: string;
  ariaLabel: string;
  /** i18n for the live coverage announcement, e.g. (40) => "40% filled". */
  coverageLabel: (pct: number) => string;
}

/** Logical canvas size; the CSS size is responsive, pointer coords map back to this. */
const SIZE = 300;
const MARGIN = 18; // keeps the thick outline inside the canvas bounds

/** Build the shape outline as a Path2D (used for clipping, stroking, and filling). */
function shapePath(shape: Shape): Path2D {
  const p = new Path2D();
  const a = MARGIN;
  const b = SIZE - MARGIN;
  if (shape === 'circle') {
    p.arc(SIZE / 2, SIZE / 2, (SIZE - MARGIN * 2) / 2, 0, Math.PI * 2);
  } else if (shape === 'square') {
    const r = 26; // rounded corners
    p.moveTo(a + r, a);
    p.arcTo(b, a, b, b, r);
    p.arcTo(b, b, a, b, r);
    p.arcTo(a, b, a, a, r);
    p.arcTo(a, a, b, a, r);
    p.closePath();
  } else {
    p.moveTo(SIZE / 2, a);
    p.lineTo(b, b);
    p.lineTo(a, b);
    p.closePath();
  }
  return p;
}

/** Count painted (alpha>0) pixels on a context over the full SIZE×SIZE area. */
function paintedPixels(ctx: CanvasRenderingContext2D): number {
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) n++;
  return n;
}

/**
 * Draw-to-fill colouring surface (the platform's signature interaction).
 *
 * Implementation: an offscreen "paint" canvas holds the child's strokes, clipped to the
 * shape path; the visible canvas composites paint + a hand-drawn ink outline. Coverage =
 * painted pixels ÷ shape-area pixels (sampled cheaply, not every frame). All view-side —
 * no store, `Math.random` is fine here (KG game, not the deterministic sim).
 */
export const PaintableShape: FC<PaintableShapeProps> = ({
  shape,
  colour,
  filled,
  onFilled,
  threshold = 0.6,
  reducedMotion = false,
  fillLabel,
  ariaLabel,
  coverageLabel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paintRef = useRef<HTMLCanvasElement | null>(null);
  const pathRef = useRef<Path2D>(shapePath(shape));
  const areaRef = useRef<number>(1);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const doneRef = useRef(false);
  const moveCountRef = useRef(0);
  const [coverage, setCoverage] = useState(0);
  const [sparkle, setSparkle] = useState(false);

  /** Repaint the visible canvas: filled state, or strokes-so-far + outline. */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const paint = paintRef.current;
    if (!canvas || !paint) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const path = pathRef.current;
    ctx.clearRect(0, 0, SIZE, SIZE);

    if (filled && colour) {
      // Completed: solid crayon fill with a soft inner sheen.
      ctx.save();
      ctx.clip(path);
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, SIZE, SIZE);
      ctx.restore();
    } else {
      ctx.drawImage(paint, 0, 0, SIZE, SIZE); // the child's strokes (already clipped)
    }

    // Hand-drawn ink outline (double-stroked with a tiny offset = colouring-book feel).
    ctx.strokeStyle = '#4a3f2f';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 7;
    ctx.stroke(path);
    ctx.lineWidth = 2.5;
    ctx.save();
    ctx.translate(1.2, -1.2);
    ctx.stroke(path);
    ctx.restore();
  }, [filled, colour]);

  // Set up canvases whenever the shape changes.
  useEffect(() => {
    pathRef.current = shapePath(shape);
    const canvas = canvasRef.current;
    if (!canvas) return;
    // VISIBLE canvas: scale to device pixels for a crisp outline.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    // OFFSCREEN paint buffer: kept at LOGICAL size (NO dpr) — it's never shown directly, only
    // composited + sampled. This keeps the coverage numerator (getImageData over SIZE×SIZE)
    // aligned with the area denominator below, so the fill threshold is correct on hi-DPI
    // tablets. (Previously the paint buffer was SIZE×dpr but sampled SIZE×SIZE → coverage read
    // ~1/dpr² of reality, so on a retina iPad the shape never auto-filled by drawing.)
    // willReadFrequently: we getImageData every few moves — keep it CPU-side (no GPU readback).
    const paint = (paintRef.current ??= document.createElement('canvas'));
    paint.width = SIZE; // (re)assigning width also clears the buffer between shapes
    paint.height = SIZE;
    paint.getContext('2d', { willReadFrequently: true });
    // Precompute the shape's paintable area (max pixels) for the coverage ratio.
    const tmp = document.createElement('canvas');
    tmp.width = SIZE;
    tmp.height = SIZE;
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    if (tctx) {
      tctx.fillStyle = '#000';
      tctx.fill(shapePath(shape));
      areaRef.current = Math.max(1, paintedPixels(tctx));
    }
    render();
  }, [shape, render]);

  // Reset the paint layer when the shape is cleared (new colour to teach / replay).
  useEffect(() => {
    if (!filled) {
      const paint = paintRef.current;
      const pctx = paint?.getContext('2d');
      if (pctx) pctx.clearRect(0, 0, SIZE, SIZE);
      doneRef.current = false;
      setCoverage(0);
    }
    render();
  }, [filled, render]);

  // Sparkle burst when the shape completes (motion-safe).
  useEffect(() => {
    if (filled && !reducedMotion) {
      setSparkle(true);
      const id = setTimeout(() => setSparkle(false), 800);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [filled, reducedMotion]);

  /** Map a pointer event to logical canvas coordinates (handles responsive CSS sizing). */
  const toLocal = (e: ReactPointerEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SIZE, y: ((e.clientY - r.top) / r.height) * SIZE };
  };

  /** Lay down one crayon segment on the paint layer (jittered for a waxy texture). */
  const paintSeg = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const pctx = paintRef.current?.getContext('2d');
    if (!pctx || !colour) return;
    pctx.save();
    pctx.clip(pathRef.current); // strokes never spill outside the outline
    pctx.strokeStyle = colour;
    pctx.lineCap = 'round';
    pctx.lineJoin = 'round';
    pctx.globalAlpha = 0.9;
    for (let pass = 0; pass < 2; pass++) {
      const j = pass === 0 ? 0 : 3;
      pctx.lineWidth = 46 - pass * 14;
      pctx.beginPath();
      pctx.moveTo(from.x + (Math.random() - 0.5) * j, from.y + (Math.random() - 0.5) * j);
      pctx.lineTo(to.x + (Math.random() - 0.5) * j, to.y + (Math.random() - 0.5) * j);
      pctx.stroke();
    }
    pctx.restore();
  };

  const complete = useCallback(() => {
    if (doneRef.current || filled) return;
    doneRef.current = true;
    onFilled();
  }, [filled, onFilled]);

  /** Sample coverage and auto-complete once past the threshold. */
  const checkCoverage = useCallback(() => {
    const pctx = paintRef.current?.getContext('2d');
    if (!pctx) return;
    const frac = paintedPixels(pctx) / areaRef.current;
    setCoverage(Math.min(1, frac));
    if (frac >= threshold) complete();
  }, [threshold, complete]);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (filled || !colour) return; // need a colour first; bubble/palette guide the child
    drawingRef.current = true;
    try {
      // Can throw InvalidPointerId if the OS already cancelled the touch (palm-reject).
      // Drawing still works without capture, so swallow it — never crash the game (§4h).
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released — proceed without capture */
    }
    const p = toLocal(e);
    lastRef.current = p;
    paintSeg(p, p); // a tap leaves a dot
    render();
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drawingRef.current || filled) return;
    const p = toLocal(e);
    if (lastRef.current) paintSeg(lastRef.current, p);
    lastRef.current = p;
    render();
    if (++moveCountRef.current % 8 === 0) checkCoverage(); // sample periodically, not every move
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastRef.current = null;
    checkCoverage(); // final, authoritative check on lift
  };

  return (
    <div className="ctr-paint">
      <canvas
        ref={canvasRef}
        className="ctr-paint-canvas"
        style={{ touchAction: 'none' }} /* claim gestures so dragging paints, not scrolls */
        role="img"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
        onPointerCancel={endStroke}
      />
      {sparkle && (
        <div className="ctr-sparkle" aria-hidden="true">
          {['✨', '⭐', '✨', '🌟', '✨'].map((s, i) => (
            <span key={i} style={{ '--i': String(i) } as CSSProperties}>
              {s}
            </span>
          ))}
        </div>
      )}
      {!filled && (
        <div
          className="ctr-coverage"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(coverage * 100)}
          aria-label={coverageLabel(Math.round(coverage * 100))}
        >
          <div className="ctr-coverage-fill" style={{ width: `${Math.round(coverage * 100)}%` }} />
        </div>
      )}
      <button
        type="button"
        className="edu-btn edu-btn--secondary ctr-fill-btn"
        disabled={!colour || filled}
        onClick={complete}
      >
        {fillLabel}
      </button>
    </div>
  );
};
