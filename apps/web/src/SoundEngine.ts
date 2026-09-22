/**
 * SoundEngine: Web Audio API sensory synthesizer for UATU.
 * Provides ethereal Solfeggio harmonic chimes and crisp tactile mechanical clicks
 * without requiring any external audio asset downloads.
 */

type Listener = (muted: boolean) => void;

class CelestialSoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private listeners: Set<Listener> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("uatu_sound_muted");
        if (saved !== null) {
          this.muted = saved === "true";
        }
      } catch {
        /* ignore storage access error */
      }
    }
  }

  private initCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {
        /* browser autoplay policy */
      });
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("uatu_sound_muted", String(this.muted));
      } catch {
        /* ignore */
      }
    }
    this.notify();
    if (!this.muted) {
      this.playTactileClick();
    }
    return this.muted;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) {
      l(this.muted);
    }
  }

  /**
   * Celestial Harmonic Chime: Resonant Solfeggio 528Hz & 792Hz harmonic sine decay.
   * Triggered on triage completion, grant authorization, and branch expansion.
   */
  public playCelestialChime(volume: number = 0.16): void {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Master gain node
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(volume, now + 0.04);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      master.connect(ctx.destination);

      // Fundamental Solfeggio 528Hz tone (clarity & transformation)
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(528, now);
      osc1.connect(master);

      // Harmonic fifth overtone 792Hz for celestial resonance
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(792, now);
      const gain2 = ctx.createGain();
      gain2.gain.value = 0.45;
      osc2.connect(gain2);
      gain2.connect(master);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.6);
      osc2.stop(now + 0.6);
    } catch {
      /* safe fallback if audio context blocked */
    }
  }

  /**
   * Tactile Acoustic Click: 18ms filtered high-frequency pulse.
   * Triggered on interactive controls, toggles, and neuron inspection.
   */
  public playTactileClick(volume: number = 0.12): void {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.022);

      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.025);
    } catch {
      /* ignore */
    }
  }

  /**
   * Celestial Shockwave Pulse: Low-end expansive pulse for dramatic zoom-in.
   */
  public playShockwavePulse(volume: number = 0.18): void {
    if (this.muted) return;
    const ctx = this.initCtx();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.35);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    } catch {
      /* ignore */
    }
  }
}

export const sound = new CelestialSoundEngine();
