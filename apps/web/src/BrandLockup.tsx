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
      ? "0.82rem"
      : size === "lg"
        ? "1.25rem"
        : "1rem";

  const tagSize =
    size === "sm"
      ? "0.62rem"
      : size === "lg"
        ? "0.72rem"
        : "0.68rem";

  const content = (
    <div
      className={`brand brand-header-group ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size === "sm" ? "0.45rem" : "0.75rem",
        textDecoration: "none",
        cursor: href || onClick ? "pointer" : "default",
        ...style,
      }}
      onClick={onClick}
    >
      <Logo size={pixelSize} glow={glow} />
      <div className="brand-text" style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
        <div
          className="brand-mark"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            letterSpacing: "0.08em",
            fontSize: titleSize,
          }}
        >
          <span className="brand-duotone-ua">UA</span>
          <span className="brand-duotone-tu">TU</span>
        </div>
        {showTag && (subtitle || variant !== "minimal") && (
          <div
            className="brand-tag"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: tagSize,
              letterSpacing: "0.06em",
              color: "var(--text-dim)",
              marginTop: "0.15rem",
            }}
          >
            {subtitle
              ? subtitle
              : variant === "tagline"
                ? "Observe · Understand · Repair · Contribute"
                : "Universal Autonomous Triage & Upkeep"}
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
