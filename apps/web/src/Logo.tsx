interface LogoProps {
  size?: number;
  className?: string;
  glow?: boolean;
}

/**
 * The All-Seeing Ocular Monolith
 * A minimalist geometric watcher symbol inscribed in an architectural navigation seal
 * with cardinal ticks, precision aperture arcs, and a surgical ember targeting pupil.
 */
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
        aria-label="UATU All-Seeing Ocular Monolith"
      >
        <defs>
          <radialGradient id="ocular-ember-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff3b00" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#ff3b00" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff3b00" stopOpacity="0" />
          </radialGradient>
          <filter id="ocular-filter" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Targeting Glow */}
        {glow && <circle cx="50" cy="50" r="42" fill="url(#ocular-ember-glow)" opacity="0.35" />}

        {/* Outer Architectural Navigation Ring */}
        <circle
          cx="50"
          cy="50"
          r="45"
          stroke="#f5f5f7"
          strokeWidth="1.2"
          strokeOpacity="0.3"
        />

        {/* Outer Concentric Ticks and Graduation Ring */}
        <circle
          cx="50"
          cy="50"
          r="41"
          stroke="#f5f5f7"
          strokeWidth="0.8"
          strokeDasharray="2 4"
          strokeOpacity="0.4"
        />

        {/* Cardinal Navigation Orientation Marks (N, S, E, W) */}
        <line x1="50" y1="3" x2="50" y2="10" stroke="#ff3b00" strokeWidth="2" strokeLinecap="square" />
        <line x1="50" y1="90" x2="50" y2="97" stroke="#f5f5f7" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="square" />
        <line x1="3" y1="50" x2="10" y2="50" stroke="#f5f5f7" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="square" />
        <line x1="90" y1="50" x2="97" y2="50" stroke="#f5f5f7" strokeWidth="1.5" strokeOpacity="0.5" strokeLinecap="square" />

        {/* Sub-cardinal Micro Ticks (NE, NW, SE, SW) */}
        <line x1="20" y1="20" x2="23" y2="23" stroke="#f5f5f7" strokeWidth="1" strokeOpacity="0.35" />
        <line x1="80" y1="20" x2="77" y2="23" stroke="#f5f5f7" strokeWidth="1" strokeOpacity="0.35" />
        <line x1="20" y1="80" x2="23" y2="77" stroke="#f5f5f7" strokeWidth="1" strokeOpacity="0.35" />
        <line x1="80" y1="80" x2="77" y2="77" stroke="#f5f5f7" strokeWidth="1" strokeOpacity="0.35" />

        {/* Inner Obsidian Monolith Chamber */}
        <circle cx="50" cy="50" r="37" fill="#050507" stroke="#f5f5f7" strokeWidth="1" strokeOpacity="0.2" />

        {/* Geometric Watcher Eye Aperture (Precision Hairline Arcs) */}
        <path
          d="M 17 50 Q 50 18 83 50 Q 50 82 17 50 Z"
          fill="#0a0a0e"
          stroke="#f5f5f7"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />

        {/* Inner Secondary Eyelid Contour */}
        <path
          d="M 24 50 Q 50 26 76 50 Q 50 74 24 50 Z"
          fill="none"
          stroke="#ff3b00"
          strokeWidth="1"
          strokeOpacity="0.4"
        />

        {/* Iris Outer Concentric Gear / Segment Ring */}
        <circle
          cx="50"
          cy="50"
          r="17"
          fill="#000000"
          stroke="#f5f5f7"
          strokeWidth="1.4"
          strokeDasharray="8 3"
        />

        {/* Iris Inner Target Reticle Ring */}
        <circle
          cx="50"
          cy="50"
          r="11"
          fill="#09090d"
          stroke="#ff3b00"
          strokeWidth="1.2"
          strokeOpacity="0.75"
        />

        {/* Reticle Fine Crosshairs */}
        <line x1="36" y1="50" x2="44" y2="50" stroke="#ff3b00" strokeWidth="1" strokeOpacity="0.8" />
        <line x1="56" y1="50" x2="64" y2="50" stroke="#ff3b00" strokeWidth="1" strokeOpacity="0.8" />
        <line x1="50" y1="36" x2="50" y2="44" stroke="#ff3b00" strokeWidth="1" strokeOpacity="0.8" />
        <line x1="50" y1="56" x2="50" y2="64" stroke="#ff3b00" strokeWidth="1" strokeOpacity="0.8" />

        {/* Surgical Ember Vermilion Focal Pupil */}
        <circle
          cx="50"
          cy="50"
          r="5.5"
          fill="#ff3b00"
          filter={glow ? "url(#ocular-filter)" : undefined}
        />

        {/* Starlight White Focal Center Point */}
        <circle cx="50" cy="50" r="1.8" fill="#ffffff" />
      </svg>
    </div>
  );
}

export default Logo;
