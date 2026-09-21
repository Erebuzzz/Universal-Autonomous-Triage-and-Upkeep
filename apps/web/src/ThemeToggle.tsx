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
    return "dark";
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
  const isLight = theme === "light";

  return (
    <div
      className={`theme-toggle-squish-wrap ${className}`}
      style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
      title={isLight ? "Switch to AMOLED dark mode" : "Switch to porcelain green light mode"}
    >
      <span
        style={{
          fontSize: "0.75rem",
          fontFamily: "var(--font-mono)",
          color: isLight ? "var(--text-muted)" : "var(--signal)",
          fontWeight: 600,
          userSelect: "none",
        }}
      >
        {isLight ? "LIGHT" : "AMOLED"}
      </span>
      <SquishSwitch
        checked={isLight}
        onChange={(checked) => setTheme(checked ? "light" : "dark")}
        width={50}
        height={26}
        radius={13}
        trackColor="#0c121e"
        trackOnColor="#10b981"
        thumbColor="#64748b"
        thumbOnColor="#ffffff"
        ariaLabel="Toggle between AMOLED dark and porcelain green light mode"
      />
    </div>
  );
}
