// WorkshopCanvas — a mini node-graph mock of the Workshop: nodes
// (Camera → Sense → Teach → Sorter gate → Bin) wired with glowing lines.
// Two-row layout at 16:9 (620×349) so the thumbnail matches the other pillars.
const NODES = [
  { id: "camera", x: 40, y: 60, label: "Camera", icon: "📷" },
  { id: "sense", x: 210, y: 45, label: "Sense", icon: "👁" },
  { id: "teach", x: 210, y: 115, label: "Teach", icon: "🎓" },
  { id: "gate", x: 380, y: 200, label: "Sorter gate", icon: "🚪" },
  { id: "bin", x: 530, y: 200, label: "Bin", icon: "🗑" },
] as const;

export default function WorkshopCanvas({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 620 349"
      preserveAspectRatio="xMidYMid meet"
      className={className}
    >
      <defs>
        <linearGradient id="wc-wire" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="rgba(33,113,181,0.85)" />
          <stop offset="100%" stopColor="rgba(30,158,94,0.85)" />
        </linearGradient>
      </defs>

      {/* Wires — Camera fans out to Sense + Teach, both feed the gate, gate → bin */}
      <g stroke="url(#wc-wire)" strokeWidth="2.5" fill="none" opacity="0.85" strokeLinecap="round">
        <path d="M145 77 Q 178 62 200 62" />
        <path d="M145 77 Q 178 130 200 132" />
        <path d="M262 79 Q 320 130 372 195" />
        <path d="M262 149 Q 320 168 372 198" />
        <path d="M485 217 Q 506 217 520 217" />
      </g>

      {/* Node connector dots */}
      <g fill="#F2F6FB" stroke="rgba(33,113,181,0.7)" strokeWidth="2">
        <circle cx="145" cy="77" r="5" />
        <circle cx="200" cy="62" r="5" />
        <circle cx="200" cy="132" r="5" />
        <circle cx="262" cy="79" r="5" />
        <circle cx="262" cy="149" r="5" />
        <circle cx="372" cy="196" r="5" />
        <circle cx="485" cy="217" r="5" />
        <circle cx="520" cy="217" r="5" />
      </g>

      {/* Nodes */}
      {NODES.map((n) => (
        <g key={n.id}>
          <rect
            x={n.x}
            y={n.y}
            width="105"
            height="34"
            rx="10"
            fill="#FFFFFF"
            stroke="rgba(33,113,181,0.45)"
            strokeWidth="1.5"
          />
          <text
            x={n.x + 17}
            y={n.y + 22}
            fontSize="15"
            textAnchor="middle"
          >
            {n.icon}
          </text>
          <text
            x={n.x + 62}
            y={n.y + 22}
            fontSize="12.5"
            fontWeight="700"
            fill="#0B132B"
            textAnchor="middle"
            fontFamily="Nunito, system-ui, sans-serif"
          >
            {n.label}
          </text>
        </g>
      ))}

      {/* Glow on the bin */}
      <rect
        x="530"
        y="200"
        width="105"
        height="34"
        rx="10"
        fill="none"
        stroke="rgba(30,158,94,0.8)"
        strokeWidth="1.5"
      />
    </svg>
  );
}
