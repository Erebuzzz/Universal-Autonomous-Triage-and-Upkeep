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
        viewBox="0 0 120 120"
        fill="none"
        width={size}
        height={size}
        className="uatu-logo-svg"
        aria-label="UATU Guardian Watcher Logo"
      >
        <defs>
          <radialGradient id="uatu-aura-dyn" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#ef4444" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="armor-helm-dyn" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="50%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>

          <linearGradient id="armor-left-dyn" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          <linearGradient id="armor-right-dyn" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0f172a" />
          </linearGradient>

          <filter id="glow-filter-dyn" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Ambient Aura */}
        <circle cx="60" cy="60" r="54" fill="url(#uatu-aura-dyn)" />

        {/* Outer Synaptic Horns (Left) */}
        <path d="M 40 32 L 24 14 L 32 36 L 42 42 Z" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M 46 26 L 36 6 L 44 26 Z" fill="#1e293b" stroke="#00ff88" strokeWidth="1.2" strokeLinejoin="round" />

        {/* Outer Synaptic Horns (Right) */}
        <path d="M 80 32 L 96 14 L 88 36 L 78 42 Z" fill="#0f172a" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M 74 26 L 84 6 L 76 26 Z" fill="#1e293b" stroke="#ff4444" strokeWidth="1.2" strokeLinejoin="round" />

        {/* Central Crown Crest */}
        <path d="M 60 12 L 68 28 L 60 34 L 52 28 Z" fill="#1e293b" stroke="#ffffff" strokeWidth="1.5" strokeLinejoin="round" />
        <line x1="60" y1="12" x2="60" y2="34" stroke="#00ff88" strokeWidth="1" />

        {/* Main Helm Body */}
        <path
          d="M 40 34 L 60 26 L 80 34 L 92 56 L 88 84 L 60 106 L 32 84 L 28 56 Z"
          fill="url(#armor-helm-dyn)"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />

        {/* Left Armor Facet */}
        <path d="M 40 34 L 60 26 L 60 62 L 34 58 Z" fill="url(#armor-left-dyn)" stroke="#10b981" strokeWidth="1" strokeOpacity="0.85" />

        {/* Right Armor Facet */}
        <path d="M 80 34 L 60 26 L 60 62 L 86 58 Z" fill="url(#armor-right-dyn)" stroke="#ef4444" strokeWidth="1" strokeOpacity="0.85" />

        {/* Center Brow Diamond */}
        <polygon points="60,42 66,50 60,58 54,50" fill="#000000" stroke="#ffffff" strokeWidth="1.5" />
        <circle cx="60" cy="50" r="2.5" fill="#ffffff" filter="url(#glow-filter-dyn)" />

        {/* Left Optic (Emerald Circuit Eye) */}
        <path d="M 38 66 L 54 64 L 52 72 L 36 70 Z" fill="#020617" stroke="#10b981" strokeWidth="1.5" />
        <ellipse cx="45" cy="67" rx="5" ry="3" fill="#00ff88" filter="url(#glow-filter-dyn)" className="optic-pulse-green" />
        <circle cx="45" cy="67" r="1.5" fill="#ffffff" />
        <polyline points="36,70 30,76 30,86" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" />

        {/* Right Optic (Laser Crimson Eye) */}
        <path d="M 82 66 L 66 64 L 68 72 L 84 70 Z" fill="#020617" stroke="#ef4444" strokeWidth="1.5" />
        <ellipse cx="75" cy="67" rx="5" ry="3" fill="#ff4444" filter="url(#glow-filter-dyn)" className="optic-pulse-red" />
        <circle cx="75" cy="67" r="1.5" fill="#ffffff" />
        <polyline points="84,70 90,76 90,86" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" />

        {/* Lower Jaw Grille */}
        <path d="M 44 80 L 60 76 L 76 80 L 68 98 L 60 102 L 52 98 Z" fill="#050914" stroke="#ffffff" strokeWidth="1.2" />
        <line x1="56" y1="84" x2="55" y2="92" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="60" y1="83" x2="60" y2="94" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="64" y1="84" x2="65" y2="92" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round" />

        {/* Temporal Synapse Nodes */}
        <circle cx="28" cy="56" r="3" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
        <circle cx="28" cy="56" r="1" fill="#00ff88" />
        <circle cx="92" cy="56" r="3" fill="#0f172a" stroke="#ef4444" strokeWidth="1.5" />
        <circle cx="92" cy="56" r="1" fill="#ff4444" />
      </svg>
    </div>
  );
}
