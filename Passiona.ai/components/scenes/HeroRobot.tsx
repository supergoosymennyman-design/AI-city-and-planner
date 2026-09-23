// HeroRobot — the Passiona mascot robot standing in front of the city.
// Rounded, friendly, but tech-edged: teal visor glow, glowing core, antenna
// light, floating idle animation. Brand-controlled SVG, no raster assets.
export default function HeroRobot({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 260 320"
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      <defs>
        <linearGradient id="hr-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8F1FA" />
          <stop offset="100%" stopColor="#C9DCEF" />
        </linearGradient>
        <linearGradient id="hr-edge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(134,222,255,0.95)" />
          <stop offset="100%" stopColor="rgba(64,182,232,0.4)" />
        </linearGradient>
        <radialGradient id="hr-halo" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="rgba(64,182,232,0.35)" />
          <stop offset="100%" stopColor="rgba(64,182,232,0)" />
        </radialGradient>
        <radialGradient id="hr-visor" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(190,242,255,0.95)" />
          <stop offset="60%" stopColor="rgba(86,205,250,0.85)" />
          <stop offset="100%" stopColor="rgba(64,182,232,0.55)" />
        </radialGradient>
      </defs>

      {/* Back halo */}
      <circle cx="130" cy="150" r="140" fill="url(#hr-halo)" />

      {/* Antenna */}
      <rect x="124" y="8" width="12" height="20" rx="6" fill="#D7E7F5" stroke="url(#hr-edge)" strokeWidth="2" />
      <circle cx="130" cy="8" r="6" fill="rgba(60,219,132,0.95)" className="hr-antenna" />

      {/* Head */}
      <rect x="68" y="26" width="124" height="96" rx="32" fill="url(#hr-body)" stroke="url(#hr-edge)" strokeWidth="3" />

      {/* Visor */}
      <rect x="82" y="50" width="96" height="42" rx="21" fill="url(#hr-visor)" />
      {/* Visor inner shading — two soft eye highlights */}
      <circle cx="112" cy="71" r="9" fill="rgba(11,19,43,0.75)" />
      <circle cx="148" cy="71" r="9" fill="rgba(11,19,43,0.75)" />
      <circle cx="109" cy="68" r="3" fill="rgba(241,245,249,0.9)" />
      <circle cx="145" cy="68" r="3" fill="rgba(241,245,249,0.9)" />

      {/* Mouth line */}
      <rect x="114" y="102" width="32" height="5" rx="2.5" fill="rgba(134,222,255,0.6)" />

      {/* Ears / side nodes */}
      <circle cx="62" cy="74" r="10" fill="#D7E7F5" stroke="url(#hr-edge)" strokeWidth="2" />
      <circle cx="198" cy="74" r="10" fill="#D7E7F5" stroke="url(#hr-edge)" strokeWidth="2" />

      {/* Torso */}
      <path
        d="M78 130 h104 v20 c0 22 -12 40 -30 50 l-8 22 h-28 l-8 -22 c-18 -10 -30 -28 -30 -50 z"
        fill="url(#hr-body)"
        stroke="url(#hr-edge)"
        strokeWidth="3"
      />

      {/* Chest core */}
      <circle cx="130" cy="168" r="20" fill="rgba(64,182,232,0.25)" stroke="rgba(86,205,250,0.7)" strokeWidth="2" />
      <circle cx="130" cy="168" r="10" fill="rgba(64,182,232,0.7)" className="hr-core" />
      <circle cx="130" cy="168" r="4" fill="rgba(241,245,249,0.95)" />

      {/* Panel lines on torso */}
      <rect x="100" y="196" width="60" height="4" rx="2" fill="rgba(134,222,255,0.35)" />
      <rect x="108" y="208" width="44" height="4" rx="2" fill="rgba(134,222,255,0.25)" />

      {/* Arms */}
      <rect x="30" y="130" width="26" height="96" rx="13" fill="#D7E7F5" stroke="url(#hr-edge)" strokeWidth="3" />
      <rect x="204" y="130" width="26" height="96" rx="13" fill="#D7E7F5" stroke="url(#hr-edge)" strokeWidth="3" />
      {/* Hands */}
      <circle cx="43" cy="236" r="16" fill="#D7E7F5" stroke="rgba(86,205,250,0.8)" strokeWidth="2.5" />
      <circle cx="217" cy="236" r="16" fill="#D7E7F5" stroke="rgba(86,205,250,0.8)" strokeWidth="2.5" />

      {/* Legs */}
      <rect x="82" y="252" width="38" height="42" rx="12" fill="#D7E7F5" stroke="url(#hr-edge)" strokeWidth="3" />
      <rect x="140" y="252" width="38" height="42" rx="12" fill="#D7E7F5" stroke="url(#hr-edge)" strokeWidth="3" />
      {/* Feet */}
      <rect x="70" y="288" width="62" height="18" rx="9" fill="#D7E7F5" stroke="rgba(86,205,250,0.7)" strokeWidth="2.5" />
      <rect x="128" y="288" width="62" height="18" rx="9" fill="#D7E7F5" stroke="rgba(86,205,250,0.7)" strokeWidth="2.5" />

      {/* Ground glow */}
      <ellipse cx="130" cy="312" rx="82" ry="8" fill="rgba(64,182,232,0.3)" />
    </svg>
  );
}
