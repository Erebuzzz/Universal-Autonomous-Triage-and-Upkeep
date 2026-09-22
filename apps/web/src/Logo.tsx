interface LogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

export function Logo({ size = 36, className = "", glow = true }: LogoProps) {
  return (
    <div
      className={`uatu-logo-wrapper ${glow ? "uatu-logo-glow" : ""} ${className}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        width={size}
        height={size}
        className="uatu-logo-svg"
        aria-label="UATU Sacred Monolithic Monogram"
      >
        <defs>
          <radialGradient id="celestial-core-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00ff9d" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00ff9d" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="celestial-crimson-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff0055" stopOpacity="0.8" />
            <stop offset="60%" stopColor="#ff0055" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ff0055" stopOpacity="0" />
          </radialGradient>
          <filter id="monolith-neon-emerald" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="monolith-neon-crimson" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Celestial Aura */}
        <circle cx="50" cy="50" r="44" fill="url(#celestial-core-glow)" />

        {/* Outer Monolithic U Profile in Architectural Sacred Geometry */}
        <path
          d="M 24 18 
             L 24 58 
             C 24 74 36 86 50 86 
             C 64 86 76 74 76 58 
             L 76 18 
             L 66 18 
             L 66 58 
             C 66 68 59 75 50 75 
             C 41 75 34 68 34 58 
             L 34 18 
             Z"
          fill="#03070b"
          stroke="#00ff9d"
          strokeWidth="2.2"
          strokeLinejoin="round"
          filter={glow ? "url(#monolith-neon-emerald)" : undefined}
        />

        {/* Celestial Astrolabe Equator Line */}
        <line
          x1="12"
          y1="50"
          x2="88"
          y2="50"
          stroke="#00ff9d"
          strokeWidth="1.2"
          strokeDasharray="2 3"
          strokeOpacity="0.5"
        />

        {/* Celestial Watcher Iris Outer Orbit Ring */}
        <circle
          cx="50"
          cy="48"
          r="16"
          fill="none"
          stroke="#00ff9d"
          strokeWidth="1.6"
          strokeDasharray="22 4"
        />

        {/* Celestial Watcher Iris Inner Orbit Ring */}
        <circle
          cx="50"
          cy="48"
          r="10"
          fill="#050a0e"
          stroke="#ffffff"
          strokeWidth="1.2"
          strokeOpacity="0.85"
        />

        {/* All-Seeing Radiant Crimson Starlight Pupil */}
        <circle
          cx="50"
          cy="48"
          r="4.5"
          fill="#ff0055"
          filter={glow ? "url(#monolith-neon-crimson)" : undefined}
        />
        <circle cx="50" cy="48" r="1.5" fill="#ffffff" />

        {/* Northern Celestial Meridian Tick */}
        <line
          x1="50"
          y1="10"
          x2="50"
          y2="18"
          stroke="#00ff9d"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="50" cy="9" r="1.5" fill="#ff0055" />
      </svg>
    </div>
  );
}

export default Logo;
