import assert from "node:assert/strict";
import test from "node:test";
import { createHealthSnapshot } from "../src/production/health.js";

test("health snapshot exposes only readiness state and failed check names", () => {
  const snapshot = createHealthSnapshot({
    status: "not_ready",
    checkedAt: "2026-09-01T09:00:00.000Z",
    checks: [
      { name: "owner_public_key", ok: false, detail: "missing" },
      { name: "network_limits", ok: true, detail: "configured" },
    ],
  });

  assert.deepEqual(snapshot, {
    status: "degraded",
    ready: false,
    checkedAt: "2026-09-01T09:00:00.000Z",
    failedChecks: ["owner_public_key"],
  });
  assert.equal("detail" in snapshot, false);
});
