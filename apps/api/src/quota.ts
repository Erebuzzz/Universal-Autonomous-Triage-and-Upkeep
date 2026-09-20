import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { UsageQuotaSnapshot } from "@uatu/domain";

export interface QuotaLimits {
  maxConcurrent: number;
  maxDaily: number;
  maxMonthly: number;
  wallClockMs: number;
}

export function readQuotaLimits(): QuotaLimits {
  return {
    maxConcurrent: Number(process.env.UATU_QUOTA_MAX_CONCURRENT ?? 1),
    maxDaily: Number(process.env.UATU_QUOTA_MAX_DAILY ?? 20),
    maxMonthly: Number(process.env.UATU_QUOTA_MAX_MONTHLY ?? 200),
    wallClockMs: Number(process.env.UATU_RUN_WALL_CLOCK_MS ?? 10 * 60_000),
  };
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

export class QuotaStore {
  constructor(private readonly dataDir: string) {}

  private file(userId: string): string {
    return path.join(this.dataDir, "quota", `${userId}.json`);
  }

  async get(userId: string): Promise<UsageQuotaSnapshot> {
    try {
      const raw = JSON.parse(await readFile(this.file(userId), "utf8")) as UsageQuotaSnapshot;
      const now = new Date();
      if (raw.dayKey !== dayKey(now)) {
        raw.dailyRuns = 0;
        raw.dayKey = dayKey(now);
      }
      if (raw.monthKey !== monthKey(now)) {
        raw.monthlyRuns = 0;
        raw.monthKey = monthKey(now);
      }
      return raw;
    } catch {
      return {
        userId,
        concurrentRuns: 0,
        dailyRuns: 0,
        monthlyRuns: 0,
        dayKey: dayKey(),
        monthKey: monthKey(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  async save(snap: UsageQuotaSnapshot): Promise<void> {
    await mkdir(path.dirname(this.file(snap.userId)), { recursive: true });
    snap.updatedAt = new Date().toISOString();
    await writeFile(this.file(snap.userId), JSON.stringify(snap, null, 2), "utf8");
  }

  async assertCanStart(userId: string): Promise<UsageQuotaSnapshot> {
    const limits = readQuotaLimits();
    const snap = await this.get(userId);
    if (snap.concurrentRuns >= limits.maxConcurrent) {
      throw new QuotaExceededError(`Concurrent run limit (${limits.maxConcurrent}) reached`);
    }
    if (snap.dailyRuns >= limits.maxDaily) {
      throw new QuotaExceededError(`Daily run limit (${limits.maxDaily}) reached`);
    }
    if (snap.monthlyRuns >= limits.maxMonthly) {
      throw new QuotaExceededError(`Monthly run limit (${limits.maxMonthly}) reached`);
    }
    return snap;
  }

  async beginRun(userId: string): Promise<UsageQuotaSnapshot> {
    const snap = await this.assertCanStart(userId);
    snap.concurrentRuns += 1;
    snap.dailyRuns += 1;
    snap.monthlyRuns += 1;
    await this.save(snap);
    return snap;
  }

  async endRun(userId: string): Promise<void> {
    const snap = await this.get(userId);
    snap.concurrentRuns = Math.max(0, snap.concurrentRuns - 1);
    await this.save(snap);
  }
}

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

/** Wall-clock kill switch wrapper for long remediation runs. */
export async function withWallClock<T>(
  ms: number,
  work: () => Promise<T>,
  onTimeout: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new Error(`Run wall-clock exceeded (${ms}ms)`));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
