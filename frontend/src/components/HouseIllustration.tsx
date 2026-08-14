/**
 * Original line-art elevation of a private house, drawn as an architect's
 * measured drawing rather than a picture: setting-out grid, dimension line,
 * and a single brass note on the door handle (the "key of the house").
 */
export function HouseIllustration({ className }: { className?: string }) {
  const line = "#9EC6D8";
  const faint = "#5C8CA3";
  const brass = "#E0A94A";

  return (
    <svg viewBox="0 0 480 360" className={className} role="img" aria-label="איור קווי של בית פרטי">
      <defs>
        <pattern id="mh-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke={faint} strokeOpacity="0.22" strokeWidth="0.75" />
        </pattern>
        <linearGradient id="mh-glass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={line} stopOpacity="0.24" />
          <stop offset="100%" stopColor={line} stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="mh-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={brass} stopOpacity="0.22" />
          <stop offset="100%" stopColor={brass} stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="480" height="360" fill="url(#mh-grid)" />

      {/* morning light over the site */}
      <circle cx="392" cy="86" r="52" fill="url(#mh-sky)" />
      <circle cx="392" cy="86" r="21" fill="none" stroke={brass} strokeOpacity="0.6" strokeWidth="1.2" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const r = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1={392 + Math.cos(r) * 29}
            y1={86 + Math.sin(r) * 29}
            x2={392 + Math.cos(r) * 38}
            y2={86 + Math.sin(r) * 38}
            stroke={brass}
            strokeOpacity="0.45"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        );
      })}

      <g fill="none" stroke={line} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        {/* main mass */}
        <path d="M126 300V152h204v148" />
        <path d="M112 152h232" />
        <path d="M112 152v-9h232v9" strokeWidth="2.2" />

        {/* single-storey wing */}
        <path d="M330 300v-96h84v96" />
        <path d="M320 204h104" />
        <path d="M320 204v-8h104v8" strokeWidth="2.2" />

        {/* glazing, main mass */}
        <rect x="150" y="178" width="96" height="70" fill="url(#mh-glass)" />
        <path d="M182 178v70M214 178v70M150 213h96" strokeWidth="0.9" strokeOpacity="0.75" />

        {/* clerestory slot */}
        <rect x="150" y="262" width="42" height="24" fill="url(#mh-glass)" />

        {/* wing window */}
        <rect x="346" y="226" width="52" height="44" fill="url(#mh-glass)" />
        <path d="M372 226v44" strokeWidth="0.9" strokeOpacity="0.75" />

        {/* entrance: recess, door, steps */}
        <path d="M262 300v-84h44v84" strokeOpacity="0.55" />
        <rect x="270" y="222" width="28" height="70" />
        <path d="M262 292h48M256 300h60" strokeWidth="1.3" strokeOpacity="0.8" />

        {/* pergola over the terrace */}
        <path d="M40 300v-98M118 300v-98M32 202h94" />
        {[48, 60, 72, 84, 96, 108].map((x) => (
          <line key={x} x1={x} y1="202" x2={x} y2="212" strokeOpacity="0.6" strokeWidth="1.1" />
        ))}

        {/* boundary wall + gate */}
        <path d="M18 300v-40h30v40" strokeOpacity="0.5" />

        {/* tree */}
        <path d="M448 300v-46" strokeOpacity="0.65" />
        <path d="M448 254c-16-4-22-18-16-30 10-4 22 2 26 12M448 262c16-6 20-22 12-32" strokeOpacity="0.5" />
      </g>

      {/* brass door handle — the key of the house */}
      <circle cx="276" cy="258" r="7" fill={brass} fillOpacity="0.18" />
      <circle cx="276" cy="258" r="2.6" fill={brass} />

      {/* ground / chalk line */}
      <path d="M8 300h464" stroke={line} strokeWidth="2" strokeLinecap="round" />
      <path
        d="M8 306h464"
        stroke={faint}
        strokeWidth="1"
        strokeDasharray="2 7"
        strokeLinecap="round"
        strokeOpacity="0.8"
      />

      {/* dimension line */}
      <g stroke={brass} strokeOpacity="0.75" strokeWidth="1">
        <path d="M126 326h288" />
        <path d="M126 320v12M414 320v12M330 320v12" />
      </g>
      <text
        x="270"
        y="346"
        textAnchor="middle"
        fill={brass}
        fillOpacity="0.85"
        fontSize="12"
        fontFamily="'IBM Plex Sans Hebrew', sans-serif"
      >
        חזית הבית
      </text>
    </svg>
  );
}
