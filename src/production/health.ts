import type { ReadinessReport } from "./readiness.js";

export interface HealthSnapshot {
  status: "ok" | "degraded";
  ready: boolean;
  checkedAt: string;
  failedChecks: readonly string[];
}

export function createHealthSnapshot(readiness: ReadinessReport): HealthSnapshot {
  const failedChecks = readiness.checks.filter((item) => !item.ok).map((item) => item.name).sort();
  return {
    status: readiness.status === "ready" ? "ok" : "degraded",
    ready: readiness.status === "ready",
    checkedAt: readiness.checkedAt,
    failedChecks,
  };
}
