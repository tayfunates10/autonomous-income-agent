# Autonomous Income Agent

Owner-controlled, policy-governed autonomous AI system for discovering legitimate online opportunities, building digital products/services, and tracking revenue without impersonating the owner or bypassing platform, identity, KYC, contractual, payment, tax, or legal controls.

## Project status

**Overall completion: 35%** — R0/R1 complete; R2 planner, memory & evaluator is ready for CI validation.

| Release | Scope | Target | Status |
|---|---|---:|---|
| R0 | Foundation, policy model, approval gate, audit contract, CI | 10% | Complete |
| R1 | Agent brain & task runtime | 25% | Complete |
| R2 | Planner, memory & evaluator | 40% | In progress |
| R3 | Opportunity discovery & scoring | 55% | Planned |
| R4 | Product/content/service engines | 70% | Planned |
| R5 | Safe internet integrations | 82% | Planned |
| R6 | Security, identity & owner authorization hardening | 90% | Planned |
| R7 | Sandbox/e2e/recovery testing | 96% | Planned |
| R8 | Production readiness | 100% | Planned |

## Non-negotiable operating rules

1. The agent is an **authorized AI representative**, not a fake human identity.
2. It must never forge, fabricate, alter, or autonomously submit government IDs or KYC evidence.
3. Legally binding contracts, account ownership changes, loans/credit, bank/payment onboarding, withdrawals/transfers, and other high-impact financial actions require explicit owner approval.
4. The agent may research, draft, code, publish where authorized, optimize, support customers, and operate approved business workflows autonomously within configured limits.
5. Every material decision must be auditable: input context, policy decision, requested capability, result, and actor/approval state.
6. Credentials and secrets never belong in source control.
7. Revenue is owned by the owner/business entity; internal AI budget shares are accounting allocations, not independent legal ownership by the AI.

## Core loop

```text
Discover -> Evaluate -> Policy Check -> Plan -> Execute Allowed Work
       -> Approval Gate (when required) -> Verify -> Ledger -> Learn
```

## R0 acceptance criteria

- [x] Typed capability model
- [x] Default-deny policy engine
- [x] Explicit owner approval gate for high-impact actions
- [x] Tamper-evident audit event contract
- [x] Unit tests for allow / deny / approval-required paths
- [x] CI running tests and type checks
- [x] Security and architecture documentation

## R1 acceptance criteria

- [x] Typed task and task-result state model
- [x] Capability-scoped executor registry
- [x] Policy/approval gate integrated into every runtime execution
- [x] Replay protection for completed/in-flight action IDs
- [x] Bounded transient retry behavior
- [x] Cancellation before/during execution
- [x] Runtime outcomes appended to tamper-evident audit trail
- [x] Unit tests for execution, deny, approval, retry, replay and cancellation
- [x] CI green
- [x] Merged to main

## R2 acceptance criteria

- [x] Bounded DAG planner with unique action/step IDs
- [x] Dependency validation, cycle detection and deterministic ordering
- [x] Policy annotation before execution
- [x] Provenance-aware memory with confidence, tags and expiry
- [x] Deterministic weighted evaluator with hard minimums
- [x] Tests for planner, memory and evaluator failure/success paths
- [x] Decision-system documentation
- [ ] CI green
- [ ] Merge to main

## Engineering workflow

- Work is developed on feature branches and reviewed through pull requests.
- CI must be green before merge.
- README progress is updated as each release milestone is completed.
- Safety/policy gates are tested as product behavior, not treated as documentation only.
- Waiting is used only when an external asynchronous system (for example CI) actually needs time; otherwise development continues immediately.

## License

No license has been selected yet. Until one is added, normal copyright rules apply.
