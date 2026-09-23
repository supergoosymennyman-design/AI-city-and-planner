export default function CitySkyline() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 400"
      preserveAspectRatio="xMidYMax slice"
      className="h-full w-full"
    >
      <defs>
        <linearGradient id="skyline-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(64,182,232,0.10)" />
          <stop offset="100%" stopColor="rgba(64,182,232,0.34)" />
        </linearGradient>
        <linearGradient id="building-glow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="rgba(86,205,250,0.55)" />
          <stop offset="100%" stopColor="rgba(86,205,250,0.05)" />
        </linearGradient>
      </defs>

      <rect width="1200" height="400" fill="url(#skyline-fade)" />

      {/* Back row of buildings */}
      <g fill="rgba(64,182,232,0.16)">
        <rect x="40" y="180" width="60" height="220" />
        <rect x="120" y="120" width="50" height="280" />
        <rect x="190" y="210" width="70" height="190" />
        <rect x="300" y="150" width="55" height="250" />
        <rect x="380" y="90" width="70" height="310" />
        <rect x="470" y="200" width="60" height="200" />
        <rect x="560" y="130" width="55" height="270" />
        <rect x="650" y="170" width="75" height="230" />
        <rect x="760" y="100" width="60" height="300" />
        <rect x="850" y="190" width="70" height="210" />
        <rect x="950" y="140" width="55" height="260" />
        <rect x="1040" y="210" width="65" height="190" />
        <rect x="1120" y="160" width="60" height="240" />
      </g>

      {/* Glowing windows on back row */}
      <g fill="url(#building-glow)">
        <rect x="130" y="140" width="8" height="8" />
        <rect x="150" y="170" width="8" height="8" />
        <rect x="395" y="110" width="8" height="8" />
        <rect x="415" y="150" width="8" height="8" />
        <rect x="570" y="150" width="8" height="8" />
        <rect x="590" y="180" width="8" height="8" />
        <rect x="775" y="120" width="8" height="8" />
        <rect x="795" y="160" width="8" height="8" />
        <rect x="960" y="160" width="8" height="8" />
        <rect x="980" y="190" width="8" height="8" />
      </g>

      {/* Front row of buildings (slightly brighter) */}
      <g fill="rgba(64,182,232,0.26)">
        <rect x="0" y="260" width="80" height="140" />
        <rect x="90" y="230" width="60" height="170" />
        <rect x="165" y="290" width="70" height="110" />
        <rect x="255" y="250" width="60" height="150" />
        <rect x="335" y="210" width="70" height="190" />
        <rect x="425" y="280" width="55" height="120" />
        <rect x="500" y="235" width="80" height="165" />
        <rect x="600" y="295" width="60" height="105" />
        <rect x="680" y="245" width="65" height="155" />
        <rect x="765" y="205" width="70" height="195" />
        <rect x="855" y="270" width="60" height="130" />
        <rect x="935" y="225" width="75" height="175" />
        <rect x="1030" y="290" width="60" height="110" />
        <rect x="1110" y="250" width="70" height="150" />
      </g>

      {/* Glowing windows on front row */}
      <g fill="url(#building-glow)">
        <rect x="105" y="250" width="8" height="8" />
        <rect x="125" y="280" width="8" height="8" />
        <rect x="350" y="230" width="8" height="8" />
        <rect x="370" y="265" width="8" height="8" />
        <rect x="515" y="255" width="8" height="8" />
        <rect x="540" y="285" width="8" height="8" />
        <rect x="695" y="265" width="8" height="8" />
        <rect x="715" y="295" width="8" height="8" />
        <rect x="780" y="225" width="8" height="8" />
        <rect x="800" y="260" width="8" height="8" />
        <rect x="950" y="245" width="8" height="8" />
        <rect x="970" y="275" width="8" height="8" />
      </g>

      {/* Glow tips on the tallest towers */}
      <g fill="rgba(86,205,250,0.7)">
        <circle cx="415" cy="88" r="3" />
        <circle cx="795" cy="98" r="3" />
      </g>
    </svg>
  );
}
