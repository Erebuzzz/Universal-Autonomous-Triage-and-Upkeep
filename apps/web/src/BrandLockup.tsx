import type { CSSProperties } from "react";
import { Logo } from "./Logo";

export interface BrandLockupProps {
  size?: "sm" | "md" | "lg" | number;
  variant?: "default" | "tagline" | "minimal";
  subtitle?: string;
  showTag?: boolean;
  glow?: boolean;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  href?: string;
}

export function BrandLockup({
  size = "md",
  variant = "default",
  subtitle,
  showTag = true,
  glow = true,
  className = "",
  style = {},
  onClick,
  href,
}: BrandLockupProps) {
  const pixelSize =
    typeof size === "number"
      ? size
      : size === "sm"
        ? 24
        : size === "lg"
          ? 38
          : 32;

  const titleSize =
    size === "sm"
      ? "0.85rem"
      : size === "lg"
        ? "1.3rem"
        : "1.05rem";

  const tagSize =
    size === "sm"
      ? "0.62rem"
      : size === "lg"
        ? "0.72rem"
        : "0.66rem";

  const content = (
    <div
      className={`brand brand-header-group ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size === "sm" ? "0.5rem" : "0.75rem",
        textDecoration: "none",
        cursor: href || onClick ? "pointer" : "default",
        ...style,
      }}
      onClick={onClick}
    >
      <Logo size={pixelSize} glow={glow} />
      <div className="brand-text" style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
        <div
          className="brand-mark"
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 800,
            letterSpacing: "0.14em",
            fontSize: titleSize,
            color: "var(--paper)",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            textTransform: "uppercase",
          }}
        >
          <span>UATU</span>
          <span style={{ color: "var(--signal-ember)", fontSize: "0.65em" }}>●</span>
        </div>
        {showTag && (subtitle || variant !== "minimal") && (
          <div
            className="brand-tag"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: tagSize,
              letterSpacing: "0.12em",
              color: "var(--paper-dim)",
              marginTop: "0.15rem",
              textTransform: "uppercase",
            }}
          >
            {subtitle
              ? subtitle
              : variant === "tagline"
                ? "[ OBSERVED · TRIAGED · REPAIRED ]"
                : "[ 19.0760°N // 72.8777°E // AUTONOMOUS_UPKEEP ]"}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </a>
    );
  }

  return content;
}

export default BrandLockup;
