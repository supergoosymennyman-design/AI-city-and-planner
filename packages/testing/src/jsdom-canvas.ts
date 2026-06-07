/**
 * Minimal Canvas 2D + `Path2D` stub for jsdom (which ships neither, short of the heavy native
 * `canvas` package). Lets canvas-touching components — e.g. the draw-to-fill PaintableShape —
 * RENDER in tests; drawing and coverage-sampling collapse to no-ops, so tests exercise the
 * keyboard/tap fallback (the guaranteed-accessible path, §6b) rather than real strokes.
 *
 * Call once from a Vitest setup file. Safe no-op outside a DOM env.
 */

/** A do-nothing 2D context covering the methods our components call (drawing is irrelevant here). */
function makeContext2D(): Record<string, unknown> {
  const noop = (): void => {};
  return {
    setTransform: noop,
    clearRect: noop,
    save: noop,
    restore: noop,
    clip: noop,
    fillRect: noop,
    drawImage: noop,
    stroke: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    arcTo: noop,
    closePath: noop,
    fill: noop,
    putImageData: noop,
    // Coverage sampling reads `.data`; return transparent pixels so "painted" count is 0.
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(0, (w | 0) * (h | 0) * 4)),
    }),
    createLinearGradient: () => ({ addColorStop: noop }),
    // Settable style props (assignments must not throw).
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '',
  };
}

/** Install the stub onto a global (defaults to `globalThis`). Idempotent; respects a real canvas. */
export function installJsdomCanvas(g: unknown = globalThis): void {
  const env = g as { document?: unknown; Path2D?: unknown; HTMLCanvasElement?: { prototype: Record<string, unknown> } };
  if (typeof env.document === 'undefined') return; // not a DOM environment — nothing to stub

  if (typeof env.Path2D === 'undefined') {
    // A constructible no-op; all path-building methods are ignored (drawing is stubbed).
    class Path2DStub {
      addPath(): void {}
      arc(): void {}
      arcTo(): void {}
      bezierCurveTo(): void {}
      closePath(): void {}
      ellipse(): void {}
      lineTo(): void {}
      moveTo(): void {}
      quadraticCurveTo(): void {}
      rect(): void {}
    }
    env.Path2D = Path2DStub;
  }

  // jsdom's getContext returns null + logs "Not implemented" noise → replace with our stub.
  if (env.HTMLCanvasElement) {
    env.HTMLCanvasElement.prototype.getContext = () => makeContext2D();
  }
}
