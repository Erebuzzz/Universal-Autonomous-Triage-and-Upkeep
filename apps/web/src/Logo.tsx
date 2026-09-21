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
        aria-label="UATU Minimal Logo"
      >
        <defs>
          <radialGradient id="uatu-u-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00ff9d" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#00ff9d" stopOpacity="0" />
          </radialGradient>
          <filter id="uatu-neon-red" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="uatu-neon-green" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ambient Emerald Aura */}
        <circle cx="50" cy="52" r="42" fill="url(#uatu-u-glow)" />

        {/* Minimal Antenna with Glowing Crimson Beacon */}
        <line x1="50" y1="36" x2="50" y2="20" stroke="#00ff9d" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="50" cy="18" r="4.5" fill="#ff0055" filter="url(#uatu-neon-red)" />
        <circle cx="50" cy="18" r="1.5" fill="#ffffff" />

        {/* Cute Minimal Rounded Robot Head Silhouette */}
        <path
          d="M 37 66 L 37 49 C 37 37 63 37 63 49 L 63 66 Z"
          fill="#060d12"
          stroke="#00ff9d"
          strokeWidth="2"
        />

        {/* Dual Glowing Red Pill Eyes */}
        <rect x="42.5" y="47" width="4.5" height="11" rx="2.25" fill="#ff0055" filter="url(#uatu-neon-red)" />
        <rect x="53" y="47" width="4.5" height="11" rx="2.25" fill="#ff0055" filter="url(#uatu-neon-red)" />

        {/* Minimal Iconic U-Collar Embracing the Robot */}
        <path
          d="M 23 26 
             L 23 60 
             C 23 83 77 83 77 60 
             L 77 26 
             L 66 26 
             L 66 59 
             C 66 73 34 73 34 59 
             L 34 26 
             Z"
          fill="#04090c"
          stroke="#00ff9d"
          strokeWidth="2.5"
          strokeLinejoin="round"
          filter="url(#uatu-neon-green)"
        />
      </svg>
    </div>
  );
}
export default Logo;
