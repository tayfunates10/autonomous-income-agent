# Recovery and Replay Safety

## Goal

A process restart must not silently erase execution history or permit a completed action to run a second time.

## Runtime snapshot

`AgentRuntime.createSnapshot()` exports:

- snapshot schema version,
- sorted completed action IDs,
- the tamper-evident audit chain.

A restarted runtime accepts a snapshot only when:

1. the snapshot version is supported,
2. the complete audit hash chain verifies,
3. completed action IDs are non-empty and unique.

If any check fails, restore fails closed.

## Replay guarantee

After a valid restore, every action ID that completed before restart remains in the runtime replay set. A request using the same action ID returns `rejected_duplicate` before any capability executor is invoked.

## Fault testing

`SandboxTransport` provides deterministic transport outcomes so integration flows can be tested without touching real services. Routes can return normal responses, transient errors, or permanent errors. Runtime retry tests prove that transient faults remain bounded by `maxRetries`.

## Recovery boundary

Snapshots are application state, not owner authorization. A restored runtime must still satisfy current policy, channel authorization, budget, kill-switch, and signed owner approval requirements for new high-impact actions.

## Production persistence

R7 validates the serialization contract and restart semantics in memory. R8 is responsible for production persistence/adapters, readiness checks, and operational deployment guidance. Production storage must persist snapshots atomically and must never accept a snapshot whose audit chain fails verification.
