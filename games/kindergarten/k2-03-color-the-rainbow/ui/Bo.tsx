import type { FC } from 'react';

/**
 * Bo's fixed expression set (kindergarten UI standard — docs/standards/kindergarten-ui-ux.md).
 * Six faces reused across the whole lesson; the screen shows one so a pre-reader reads Bo's
 * emotion without words.
 */
export type BoFace = 'hello' | 'hmm' | 'listening' | 'learning' | 'knows' | 'oops';

/** Cream "ink" the face is drawn in, on Bo's blue screen. Character ART (not themeable UI), so
 * literal colours are intentional here — like an asset, not a hardcoded UI colour (§3 spirit). */
const FACE = '#fff4e6';
const PUPIL = '#13384f';

/** The face elements drawn inside Bo's screen rect (x 26–94, y 40–98; eyes ~y61, mouth ~y84). */
function faceArt(face: BoFace) {
  switch (face) {
    case 'hello':
      return (
        <>
          <circle cx="48" cy="62" r="7" fill={FACE} /><circle cx="72" cy="62" r="7" fill={FACE} />
          <circle cx="49" cy="63" r="3" fill={PUPIL} /><circle cx="73" cy="63" r="3" fill={PUPIL} />
          <path d="M50 82 q10 8 20 0" fill="none" stroke={FACE} strokeWidth="4" strokeLinecap="round" />
        </>
      );
    case 'hmm':
      return (
        <>
          <circle cx="48" cy="60" r="6" fill={FACE} /><circle cx="72" cy="60" r="6" fill={FACE} />
          <circle cx="50" cy="57" r="3" fill={PUPIL} /><circle cx="74" cy="57" r="3" fill={PUPIL} />
          <path d="M52 85 h15" stroke={FACE} strokeWidth="4" strokeLinecap="round" />
          <text x="76" y="60" fontSize="20" fontWeight="800" fill="#ffd23f" fontFamily="var(--edu-font)">?</text>
        </>
      );
    case 'listening':
      return (
        <>
          <circle cx="48" cy="62" r="6.5" fill={FACE} /><circle cx="72" cy="62" r="6.5" fill={FACE} />
          <circle cx="48" cy="62" r="3" fill={PUPIL} /><circle cx="72" cy="62" r="3" fill={PUPIL} />
          <ellipse cx="60" cy="85" rx="5" ry="6" fill={FACE} />
          <path d="M31 60 q-5 9 0 18" fill="none" stroke="#bfe6ff" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M89 60 q5 9 0 18" fill="none" stroke="#bfe6ff" strokeWidth="3.5" strokeLinecap="round" />
        </>
      );
    case 'learning':
      return (
        <>
          <circle cx="48" cy="60" r="8" fill={FACE} /><circle cx="72" cy="60" r="8" fill={FACE} />
          <circle cx="48" cy="60" r="3.5" fill={PUPIL} /><circle cx="72" cy="60" r="3.5" fill={PUPIL} />
          <ellipse cx="60" cy="85" rx="6" ry="7" fill={FACE} />
          <path d="M82 46 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 z" fill="#ffd23f" />
        </>
      );
    case 'knows':
      return (
        <>
          <path d="M42 62 q6 -8 12 0" fill="none" stroke={FACE} strokeWidth="4" strokeLinecap="round" />
          <path d="M66 62 q6 -8 12 0" fill="none" stroke={FACE} strokeWidth="4" strokeLinecap="round" />
          <path d="M46 80 q14 13 28 0" fill="none" stroke={FACE} strokeWidth="5" strokeLinecap="round" />
        </>
      );
    case 'oops':
      return (
        <>
          <circle cx="48" cy="60" r="6" fill={FACE} /><circle cx="72" cy="60" r="6" fill={FACE} />
          <circle cx="48" cy="61" r="3" fill={PUPIL} /><circle cx="72" cy="61" r="3" fill={PUPIL} />
          <path d="M50 84 q6 -6 12 0 q6 6 12 0" fill="none" stroke={FACE} strokeWidth="4" strokeLinecap="round" />
          <path d="M88 60 q4 6 0 10 q-4 -4 0 -10 z" fill="#7ec8ff" />
        </>
      );
  }
}

/**
 * Bo — the kindergarten "screen-robot" AI character. Its SCREEN is its face, so children read
 * how it feels; because the face is on a *display* it stays honestly a machine, not a creature
 * that already knows things (keeps Big Idea 3 honest). All art is hand-drawn SVG — self-hosted,
 * identical on every device, offline (no CDN, golden rule #4). The face is decorative
 * (`aria-hidden`); meaning is carried by the spoken/written bubble + `aria-live` (§6b).
 */
export const Bo: FC<{ face: BoFace; ariaLabel: string }> = ({ face, ariaLabel }) => (
  <span className="ctr-bo" data-face={face} role="img" aria-label={ariaLabel}>
    <svg className="ctr-bo-svg" viewBox="0 0 120 124" aria-hidden="true">
      <line x1="60" y1="4" x2="60" y2="22" stroke="var(--edu-ink)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="60" cy="6" r="6" fill="var(--edu-yellow)" stroke="var(--edu-ink)" strokeWidth="3" />
      <rect x="3" y="62" width="10" height="26" rx="5" fill="var(--edu-yellow)" stroke="var(--edu-ink)" strokeWidth="3" />
      <rect x="107" y="62" width="10" height="26" rx="5" fill="var(--edu-yellow)" stroke="var(--edu-ink)" strokeWidth="3" />
      <rect x="14" y="22" width="92" height="96" rx="22" fill="#fffdf7" stroke="var(--edu-ink)" strokeWidth="4" />
      <rect x="26" y="40" width="68" height="58" rx="14" fill="#1d6fb8" stroke="var(--edu-ink)" strokeWidth="2" />
      <path d="M30 44 h60 a10 10 0 0 1 0 6 h-60 z" fill="#ffffff" opacity="0.18" />
      {faceArt(face)}
    </svg>
  </span>
);
