export type DetectionMode = "general" | "fixture" | "auto";
export type DetectionModeUsed = "general" | "fixture";

export function readDetectionMode(): DetectionMode {
  const raw = (process.env.UATU_DETECTION_MODE ?? "auto").trim().toLowerCase();
  if (raw === "general" || raw === "fixture" || raw === "auto") return raw;
  return "auto";
}

export interface DetectionFallbackResult<T> {
  result: T;
  modeUsed: DetectionModeUsed;
}

/**
 * Run general detection first when mode is general|auto.
 * On timeout, error, or empty findings, silently fall back to fixture (auto)
 * or return empty (general-only).
 */
export async function withDetectionFallback<T>(
  runGeneral: () => Promise<T>,
  runFixture: () => Promise<T>,
  isEmpty: (value: T) => boolean,
  emptyGeneral: () => T,
): Promise<DetectionFallbackResult<T>> {
  const mode = readDetectionMode();

  if (mode === "fixture") {
    return { result: await runFixture(), modeUsed: "fixture" };
  }

  try {
    const general = await runGeneral();
    if (!isEmpty(general)) {
      return { result: general, modeUsed: "general" };
    }
    if (mode === "general") {
      return { result: general, modeUsed: "general" };
    }
  } catch {
    if (mode === "general") {
      return { result: emptyGeneral(), modeUsed: "general" };
    }
  }

  return { result: await runFixture(), modeUsed: "fixture" };
}
