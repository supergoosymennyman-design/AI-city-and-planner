import type { FC } from 'react';
import type { Shape } from '../logic/types.js';

/** Props for {@link ShapeSvg} — purely presentational; interactivity is a wrapping control. */
export interface ShapeProps {
  shape: Shape;
  /** Fill colour (hex). Grey placeholder until painted. */
  fill: string;
  size?: number;
  /** Accessible name when the shape conveys meaning on its own (e.g. the quiz swatch). */
  ariaLabel?: string;
  /** Hide from assistive tech when a wrapping control already provides the label. */
  decorative?: boolean;
}

/**
 * The filled display shape used in the quiz (React port of the prototype's `createShape`).
 * A `feTurbulence` + `feDisplacementMap` filter gives the edge a hand-drawn CRAYON wobble
 * so it matches the draw-to-fill teaching surface (the platform's colouring-book standard).
 * Presentational only — the answer buttons carry interaction (§6b).
 */
export const ShapeSvg: FC<ShapeProps> = ({ shape, fill, size = 220, ariaLabel, decorative }) => {
  const common = { fill, stroke: '#4a3f2f', strokeWidth: 5, strokeLinejoin: 'round' as const };
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': ariaLabel };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} {...a11y}>
      <defs>
        <filter id="ctr-crayon">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.5" />
        </filter>
      </defs>
      <g filter="url(#ctr-crayon)">
        {shape === 'circle' && <circle cx={50} cy={50} r={42} {...common} />}
        {shape === 'square' && <rect x={9} y={9} width={82} height={82} rx={10} {...common} />}
        {shape === 'triangle' && <polygon points="50,8 92,92 8,92" {...common} />}
      </g>
    </svg>
  );
};
