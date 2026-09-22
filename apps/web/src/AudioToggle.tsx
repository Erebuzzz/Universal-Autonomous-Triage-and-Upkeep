import { useEffect, useState } from "react";
import { sound } from "./SoundEngine";

export function AudioToggle() {
  const [muted, setMuted] = useState(() => sound.isMuted());

  useEffect(() => {
    return sound.subscribe((m) => setMuted(m));
  }, []);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm audio-toggle-btn"
      onClick={() => sound.toggleMute()}
      aria-label={muted ? "Enable celestial audio feedback" : "Mute celestial audio feedback"}
      title={muted ? "Celestial Sound: Off (Click to enable)" : "Celestial Sound: On (Click to mute)"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        color: muted ? "var(--text-dim)" : "var(--signal)",
        borderColor: muted ? "var(--ink-line)" : "rgba(0, 255, 157, 0.35)",
        background: muted ? "transparent" : "rgba(0, 255, 157, 0.08)",
        transition: "all var(--dur-fast) var(--ease)",
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {muted ? (
          <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </>
        ) : (
          <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </>
        )}
      </svg>
      <span style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {muted ? "Mute" : "Audio"}
      </span>
    </button>
  );
}

export default AudioToggle;
