import { useEffect, useState } from "react";
import { SquishSwitch } from "./components/SquishSwitch";

export type Theme = "dark" | "light";

export function useTheme(): { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void } {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem("uatu_theme");
      if (stored === "light" || stored === "dark") return stored;
    } catch {
      /* ignore */
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("uatu_theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return { theme, toggleTheme, setTheme };
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      className={`theme-toggle-squish-wrap ${className}`}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
      title={isDark ? "Switch to porcelain light mode" : "Switch to AMOLED dark mode"}
    >
      <span
        style={{
          fontSize: "0.75rem",
          fontFamily: "var(--font-mono)",
          color: isDark ? "var(--signal)" : "var(--paper-dim)",
          fontWeight: 600,
          userSelect: "none",
          letterSpacing: "0.06em",
        }}
      >
        {isDark ? "AMOLED" : "LIGHT"}
      </span>
      <SquishSwitch
        checked={isDark}
        onChange={(checked) => setTheme(checked ? "dark" : "light")}
        width={50}
        height={26}
        radius={13}
        trackColor="#ded8d0"
        trackOnColor="#ff3b00"
        thumbColor="#635a52"
        thumbOnColor="#ffffff"
        ariaLabel="Toggle between porcelain light and AMOLED dark mode"
      />
    </div>
  );
}
