// CityRender — a layered "3D city render" scene built in SVG: far mountain
// range, mid city block, near district with river reflection, atmospheric
// haze, stars and street-level glow. Used as the Hero backdrop and the
// fly-into-city demo preview. Vector, brand-controlled, no raster assets.
export default function CityRender({
  className = "",
}: {
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 560"
      preserveAspectRatio="xMidYMax slice"
      className={className}
    >
      <defs>
        <linearGradient id="cr-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B132B" />
          <stop offset="55%" stopColor="#14305C" />
          <stop offset="100%" stopColor="#1D3E78" />
        </linearGradient>
        <linearGradient id="cr-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(64,182,232,0)" />
          <stop offset="100%" stopColor="rgba(64,182,232,0.28)" />
        </linearGradient>
        <linearGradient id="cr-river" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(86,205,250,0.32)" />
          <stop offset="100%" stopColor="rgba(86,205,250,0.05)" />
        </linearGradient>
        <linearGradient id="cr-win" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="rgba(86,205,250,0.75)" />
          <stop offset="100%" stopColor="rgba(86,205,250,0.08)" />
        </linearGradient>
        <radialGradient id="cr-moon" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="rgba(241,245,249,0.9)" />
          <stop offset="100%" stopColor="rgba(241,245,249,0)" />
        </radialGradient>
      </defs>

      {/* Sky */}
      <rect width="1200" height="560" fill="url(#cr-sky)" />

      {/* Stars */}
      <g fill="rgba(241,245,249,0.5)">
        <circle cx="120" cy="48" r="1.4" />
        <circle cx="280" cy="90" r="1" />
        <circle cx="430" cy="34" r="1.6" />
        <circle cx="610" cy="70" r="1.1" />
        <circle cx="780" cy="42" r="1.5" />
        <circle cx="930" cy="95" r="1" />
        <circle cx="1050" cy="55" r="1.3" />
        <circle cx="90" cy="140" r="1" />
        <circle cx="700" cy="150" r="1.2" />
        <circle cx="1120" cy="130" r="1" />
      </g>

      {/* Moon glow */}
      <circle cx="990" cy="90" r="90" fill="url(#cr-moon)" opacity="0.5" />
      <circle cx="990" cy="90" r="16" fill="#EDF2F9" opacity="0.85" />

      {/* Far mountain range */}
      <path
        d="M0 330 L90 240 L170 300 L260 215 L340 290 L420 235 L500 305 L580 250 L660 310 L740 225 L820 295 L900 245 L980 305 L1060 255 L1140 310 L1200 275 L1200 400 L0 400 Z"
        fill="rgba(23,48,92,0.9)"
      />
      <path
        d="M0 355 L120 295 L230 345 L330 280 L450 340 L560 290 L680 345 L800 285 L920 340 L1040 295 L1200 330 L1200 400 L0 400 Z"
        fill="rgba(19,36,70,0.95)"
      />

      {/* Far city blocks (back row) */}
      <g fill="rgba(64,182,232,0.20)">
        <rect x="30" y="290" width="70" height="110" />
        <rect x="115" y="250" width="60" height="150" />
        <rect x="195" y="305" width="75" height="95" />
        <rect x="290" y="270" width="60" height="130" />
        <rect x="370" y="225" width="75" height="175" />
        <rect x="465" y="300" width="65" height="100" />
        <rect x="550" y="260" width="60" height="140" />
        <rect x="630" y="285" width="80" height="115" />
        <rect x="730" y="240" width="65" height="160" />
        <rect x="815" y="300" width="75" height="100" />
        <rect x="910" y="265" width="60" height="135" />
        <rect x="990" y="295" width="70" height="105" />
        <rect x="1080" y="255" width="70" height="145" />
      </g>
      {/* Far windows */}
      <g fill="url(#cr-win)" opacity="0.7">
        <rect x="130" y="268" width="7" height="7" />
        <rect x="148" y="290" width="7" height="7" />
        <rect x="385" y="245" width="7" height="7" />
        <rect x="403" y="270" width="7" height="7" />
        <rect x="565" y="278" width="7" height="7" />
        <rect x="583" y="300" width="7" height="7" />
        <rect x="745" y="258" width="7" height="7" />
        <rect x="763" y="282" width="7" height="7" />
        <rect x="925" y="283" width="7" height="7" />
        <rect x="943" y="305" width="7" height="7" />
        <rect x="1095" y="275" width="7" height="7" />
        <rect x="1113" y="297" width="7" height="7" />
      </g>

      {/* Mid city block (main silhouette) */}
      <g fill="rgba(64,182,232,0.30)">
        <rect x="0" y="380" width="85" height="120" />
        <rect x="95" y="345" width="65" height="155" />
        <rect x="172" y="400" width="72" height="100" />
        <rect x="258" y="360" width="62" height="140" />
        <rect x="335" y="320" width="78" height="180" />
        <rect x="428" y="390" width="60" height="110" />
        <rect x="505" y="350" width="82" height="150" />
        <rect x="602" y="408" width="64" height="92" />
        <rect x="682" y="355" width="68" height="145" />
        <rect x="765" y="315" width="78" height="185" />
        <rect x="858" y="385" width="64" height="115" />
        <rect x="938" y="345" width="80" height="155" />
        <rect x="1035" y="400" width="64" height="100" />
        <rect x="1115" y="360" width="72" height="140" />
      </g>
      {/* Mid windows */}
      <g fill="url(#cr-win)">
        <rect x="110" y="365" width="8" height="8" />
        <rect x="130" y="395" width="8" height="8" />
        <rect x="350" y="340" width="8" height="8" />
        <rect x="370" y="368" width="8" height="8" />
        <rect x="520" y="370" width="8" height="8" />
        <rect x="545" y="398" width="8" height="8" />
        <rect x="697" y="375" width="8" height="8" />
        <rect x="717" y="403" width="8" height="8" />
        <rect x="780" y="335" width="8" height="8" />
        <rect x="800" y="363" width="8" height="8" />
        <rect x="953" y="365" width="8" height="8" />
        <rect x="973" y="393" width="8" height="8" />
      </g>

      {/* Glow tips on tallest towers */}
      <g fill="rgba(86,205,250,0.8)">
        <circle cx="374" cy="318" r="3.5" />
        <circle cx="804" cy="313" r="3.5" />
      </g>

      {/* Ground / river strip */}
      <rect x="0" y="480" width="1200" height="80" fill="url(#cr-river)" />
      {/* River reflections */}
      <g opacity="0.35">
        <rect x="340" y="492" width="60" height="3" rx="1.5" fill="rgba(86,205,250,0.8)" />
        <rect x="370" y="508" width="40" height="2.5" rx="1.25" fill="rgba(86,205,250,0.6)" />
        <rect x="700" y="496" width="50" height="3" rx="1.5" fill="rgba(86,205,250,0.7)" />
        <rect x="790" y="514" width="45" height="2.5" rx="1.25" fill="rgba(86,205,250,0.5)" />
        <rect x="980" y="502" width="55" height="3" rx="1.5" fill="rgba(86,205,250,0.7)" />
      </g>

      {/* Atmospheric haze (bottom) */}
      <rect x="0" y="400" width="1200" height="160" fill="url(#cr-haze)" />
    </svg>
  );
}
