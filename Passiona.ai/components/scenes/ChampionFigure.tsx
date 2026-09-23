// ChampionFigure — a stylized AI champion with a teal light edge, at 16:9
// (320×180) so the thumbnail matches the other pillars. The figure is scaled
// and centered; decorative data bars fill the sides.
export default function ChampionFigure({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 180"
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      <defs>
        <linearGradient id="cf-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(33,113,181,0.85)" />
          <stop offset="100%" stopColor="rgba(33,113,181,0.4)" />
        </linearGradient>
        <radialGradient id="cf-core" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="rgba(64,182,232,0.35)" />
          <stop offset="100%" stopColor="rgba(33,113,181,0.06)" />
        </radialGradient>
      </defs>

      {/* Left data bars */}
      <g fill="rgba(33,113,181,0.35)">
        <rect x="24" y="96" width="4" height="24" rx="2" />
        <rect x="34" y="78" width="4" height="42" rx="2" />
        <rect x="44" y="104" width="4" height="16" rx="2" />
      </g>
      {/* Left spark dots */}
      <circle cx="24" cy="64" r="2.5" fill="rgba(33,113,181,0.6)" />
      <circle cx="36" cy="54" r="2" fill="rgba(33,113,181,0.4)" />

      {/* Right data bars */}
      <g fill="rgba(33,113,181,0.35)">
        <rect x="272" y="88" width="4" height="28" rx="2" />
        <rect x="282" y="66" width="4" height="50" rx="2" />
        <rect x="292" y="100" width="4" height="16" rx="2" />
      </g>
      {/* Right spark dots */}
      <circle cx="272" cy="128" r="2.5" fill="rgba(33,113,181,0.6)" />
      <circle cx="284" cy="136" r="2" fill="rgba(33,113,181,0.4)" />

      {/* The figure — scaled from the original 200×260 canvas, centered */}
      <g transform="translate(105, 24) scale(0.55)">
        {/* Halo */}
        <circle cx="100" cy="130" r="115" fill="url(#cf-core)" />

        {/* Head */}
        <rect x="62" y="18" width="76" height="58" rx="18" fill="#FFFFFF" stroke="url(#cf-edge)" strokeWidth="2.5" />
        {/* Visor */}
        <rect x="74" y="36" width="52" height="14" rx="7" fill="rgba(33,113,181,0.85)" />
        <rect x="84" y="40" width="6" height="6" rx="3" fill="#FFFFFF" opacity="0.85" />
        <rect x="112" y="40" width="6" height="6" rx="3" fill="#FFFFFF" opacity="0.85" />
        {/* Antenna */}
        <rect x="96" y="6" width="8" height="12" rx="3" fill="#FFFFFF" stroke="url(#cf-edge)" strokeWidth="1.5" />
        <circle cx="100" cy="4" r="4" fill="rgba(60,219,132,0.9)" />

        {/* Torso */}
        <path
          d="M62 92 h76 v14 c0 12 -8 22 -20 26 l-6 14 h-24 l-6 -14 c-12 -4 -20 -14 -20 -26 z"
          fill="#FFFFFF"
          stroke="url(#cf-edge)"
          strokeWidth="2.5"
        />
        {/* Core light */}
        <circle cx="100" cy="112" r="9" fill="rgba(33,113,181,0.5)" />
        <circle cx="100" cy="112" r="4" fill="rgba(241,245,249,0.85)" />

        {/* Arms */}
        <rect x="24" y="92" width="16" height="66" rx="8" fill="#FFFFFF" stroke="url(#cf-edge)" strokeWidth="2.5" />
        <rect x="160" y="92" width="16" height="66" rx="8" fill="#FFFFFF" stroke="url(#cf-edge)" strokeWidth="2.5" />
        {/* Hands */}
        <circle cx="32" cy="168" r="9" fill="#FFFFFF" stroke="rgba(33,113,181,0.65)" strokeWidth="2" />
        <circle cx="168" cy="168" r="9" fill="#FFFFFF" stroke="rgba(33,113,181,0.65)" strokeWidth="2" />

        {/* Legs */}
        <rect x="62" y="180" width="26" height="54" rx="10" fill="#FFFFFF" stroke="url(#cf-edge)" strokeWidth="2.5" />
        <rect x="112" y="180" width="26" height="54" rx="10" fill="#FFFFFF" stroke="url(#cf-edge)" strokeWidth="2.5" />
        {/* Feet */}
        <rect x="52" y="228" width="46" height="14" rx="7" fill="#FFFFFF" stroke="rgba(33,113,181,0.55)" strokeWidth="2" />
        <rect x="102" y="228" width="46" height="14" rx="7" fill="#FFFFFF" stroke="rgba(33,113,181,0.55)" strokeWidth="2" />

        {/* Ground glow */}
        <ellipse cx="100" cy="248" rx="60" ry="6" fill="rgba(33,113,181,0.16)" />
      </g>
    </svg>
  );
}
