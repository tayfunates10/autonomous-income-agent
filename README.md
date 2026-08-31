# Autonomous Income Agent

Owner-controlled, policy-governed autonomous AI system for discovering legitimate online opportunities, building digital products/services, and tracking revenue without impersonating the owner or bypassing platform, identity, KYC, contractual, payment, tax, or legal controls.

## Project status

**Overall completion: 4%** — R0 foundation implementation is in progress.

| Release | Scope | Target | Status |
|---|---|---:|---|
| R0 | Foundation, policy model, approval gate, audit contract, CI | 10% | In progress |
| R1 | Agent brain & task runtime | 25% | Planned |
| R2 | Planner, memory & evaluator | 40% | Planned |
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

- [ ] Typed capability model
- [ ] Default-deny policy engine
- [ ] Explicit owner approval gate for high-impact actions
- [ ] Tamper-evident audit event contract
- [ ] Unit tests for allow / deny / approval-required paths
- [ ] CI running tests and type checks
- [ ] Security and architecture documentation

## Engineering workflow

- Work is developed on feature branches and reviewed through pull requests.
- CI must be green before merge.
- README progress is updated as each release milestone is completed.
- Safety/policy gates are tested as product behavior, not treated as documentation only.
- Waiting is used only when an external asynchronous system (for example CI) actually needs time; otherwise development continues immediately.

## License

No license has been selected yet. Until one is added, normal copyright rules apply.
