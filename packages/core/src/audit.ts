import { randomUUID } from "node:crypto";
import type { AuditEvent, TaskState } from "@uatu/domain";

const SECRET_PATTERNS: RegExp[] = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
  /\b(?:sk|pk)-[A-Za-z0-9]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /x-access-token:[^@\s]+@/gi,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[^\s'"]{8,}/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
];

export function redactSecrets(input: string): { text: string; redacted: boolean } {
  let text = input;
  let redacted = false;
  for (const pattern of SECRET_PATTERNS) {
    const next = text.replace(pattern, "[REDACTED]");
    if (next !== text) redacted = true;
    text = next;
  }
  return { text, redacted };
}

export class AuditTrail {
  private readonly events: AuditEvent[] = [];

  append(partial: Omit<AuditEvent, "id" | "at" | "redacted"> & { redacted?: boolean }): AuditEvent {
    const detail = redactSecrets(partial.detail);
    const event: AuditEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      redacted: partial.redacted ?? detail.redacted,
      ...partial,
      detail: detail.text,
    };
    this.events.push(Object.freeze({ ...event }));
    return event;
  }

  forTask(taskId: string): AuditEvent[] {
    return this.events.filter((e) => e.taskId === taskId);
  }

  all(): AuditEvent[] {
    return [...this.events];
  }

  load(events: AuditEvent[]): void {
    this.events.length = 0;
    for (const e of events) this.events.push(Object.freeze({ ...e }));
  }
}

export function transitionAudit(
  trail: AuditTrail,
  taskId: string,
  actor: string,
  from: TaskState,
  to: TaskState,
  detail: string,
): AuditEvent {
  return trail.append({
    taskId,
    actor,
    action: "state_transition",
    fromState: from,
    toState: to,
    detail,
  });
}
