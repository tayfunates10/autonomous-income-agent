# Planner, Memory and Evaluator

## Planner

The planner accepts an explicit goal plus bounded capability steps. It validates unique step/action IDs, referenced dependencies, a maximum step count and DAG acyclicity. The resulting plan is topologically ordered and every step is annotated with the current policy decision before execution.

Planning never counts as owner approval. A financial/legal/identity step can appear in a plan as `require_owner_approval`, but the R1 runtime still requires a valid scoped approval grant before execution.

## Memory

R2 memory is deliberately provenance-first. Every stored entry must include:

- a source ID,
- a source type (`web`, `user`, `system`, or `execution`),
- observation time,
- confidence score,
- sensitivity (`public` or `internal`),
- optional URI and expiration.

Expired entries are hidden automatically and can be pruned. Query results can filter text/tags/sensitivity and are ranked by confidence then recency.

This is an in-memory reference implementation. Durable/vector storage can replace the backend later without weakening the provenance contract.

## Evaluator

The evaluator receives measurable criteria in the range 0..1 with positive weights. It computes a normalized weighted score and supports hard minimums for non-negotiable qualities such as compliance, safety, correctness, or profitability floors.

Decisions:

- `accept`: weighted score meets the acceptance threshold and no hard minimum failed.
- `revise`: score is useful but below acceptance threshold.
- `reject`: score is too low or any hard minimum failed.

## Closed-loop direction

R3+ components will use the sequence below:

```text
Goal -> Planner -> Runtime -> Evidence/Outcome -> Evaluator
  ^                                            |
  |--------------- Memory feedback -----------|
```

The loop may revise business tactics and content/product choices, but it cannot revise away R0 policy boundaries or owner-approval requirements.
