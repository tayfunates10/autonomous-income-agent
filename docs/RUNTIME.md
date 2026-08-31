# Agent Runtime

## Purpose

The R1 runtime turns a requested capability into a bounded execution. It does not decide business strategy; it enforces the execution contract produced by higher-level planners.

## Runtime sequence

1. Reject a completed or currently in-flight `actionId`.
2. Evaluate the task through the R0 policy and owner-approval gate.
3. Stop with `denied` when policy denies the capability.
4. Stop with `awaiting_approval` when explicit owner approval is required.
5. Resolve the registered capability executor.
6. Respect cancellation before and during execution.
7. Execute once, or retry only `TransientExecutionError` up to the configured bound.
8. Mark successful action IDs completed to prevent replay.
9. Append authorization and execution outcomes to the tamper-evident audit chain.

## Task states

- `succeeded`: executor completed and action ID is now replay-protected.
- `awaiting_approval`: no external execution occurred; a scoped owner grant is required.
- `denied`: policy prevented execution.
- `failed`: allowed execution could not complete or no executor exists.
- `cancelled`: execution was aborted before or during the run.
- `rejected_duplicate`: action was already completed or is currently in flight.

## Retry policy

Retries are opt-in and bounded. Only `TransientExecutionError` is retryable. Policy denials, missing approvals, permanent executor failures and duplicate actions are never retried automatically.

## Executor boundary

Executors are registered against one typed capability. Later integration adapters must stay narrow: a publishing adapter should not silently obtain financial permissions, and a research adapter should not receive payment credentials.

R1 executors are in-process abstractions. Live internet/account integrations are deferred to R5 after opportunity, product and revenue layers exist.
