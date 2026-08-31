# Opportunity Engine

## Principle

The agent must not treat an idea as a business opportunity merely because an LLM can describe it convincingly. R3 requires explicit evidence and separates `pursue`, `validate`, and `discard` decisions.

## Candidate metrics

Every candidate is normalized to 0..1 across:

- demand,
- margin potential,
- automation fit,
- repeatability/recurring potential,
- speed to first revenue,
- differentiation,
- competition,
- platform/account risk,
- legal/compliance risk.

## Evidence

Evidence carries a unique evidence ID, source ID/type, evidence kind, confidence, observation timestamp, optional URI and a short factual summary. The scoring engine rewards both confidence and diversity of evidence/source types.

A candidate with zero evidence is discarded. High legal/compliance or platform/account risk can hard-stop a candidate regardless of attractive economics.

## Risk-adjusted scoring

Positive economics and automation factors create the base score. Platform and legal risk subtract explicit penalties. The decision thresholds are deliberately separated:

- `pursue`: strong score plus sufficient evidence quality,
- `validate`: promising but insufficiently proven,
- `discard`: weak evidence/economics or hard risk ceiling.

The score is a prioritization mechanism, not a legal determination or guarantee of revenue.

## Validation plan

The engine can create a bounded R2 DAG that asks for demand, pricing and competition research, then drafts a summary that is explicitly instructed not to invent missing facts. Live research providers are connected only in R5.

## Memory integration

Opportunity evidence is copied into R2 memory using its original provenance, confidence and timestamps. Web evidence is public memory; user/execution evidence is internal memory. This lets later decisions trace claims back to their source instead of relying on ungrounded model recall.
