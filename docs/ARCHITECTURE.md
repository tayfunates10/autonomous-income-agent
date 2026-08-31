# Architecture

## Goal

Autonomous Income Agent is an owner-controlled system that can discover legitimate online opportunities, create digital value, operate approved business workflows, and report outcomes while keeping identity, legal, financial and platform-risk boundaries enforceable in code.

## Execution model

```text
Signal/Opportunity
      |
      v
Planner -> Capability request -> Policy engine
                               |        |
                            allow     deny
                               |
                    approval required?
                       |            |
                      no           yes
                       |            |
                    execute   Owner Approval Gate
                       |            |
                       +------> execute only if valid
                                      |
                                      v
                               Audit + Revenue Ledger
```

## Core invariants

1. **Default deny**: a capability that is not explicitly classified cannot execute.
2. **Least authority**: every integration receives only the permissions needed for its task.
3. **Scoped approval**: owner approval is bound to one capability and one action ID, and expires.
4. **Permanent prohibitions**: some actions remain denied even if an approval object is supplied.
5. **Auditable execution**: material decisions produce append-only, hash-chained audit events.
6. **No secret-in-code design**: credentials belong in runtime secret stores, never Git history.

## Planned bounded contexts

- `policy`: capabilities, classification and risk decisions.
- `approval`: owner grants and approval verification.
- `audit`: tamper-evident event history.
- `agent`: task runtime and bounded autonomy.
- `planner`: goal decomposition and execution plans.
- `memory`: durable knowledge with provenance and retention controls.
- `opportunity`: discovery, scoring and validation of business opportunities.
- `product`: digital product/service creation workflows.
- `content`: authorized content production and publishing.
- `sales`: offer, lead and customer workflow orchestration.
- `revenue`: revenue/cost ledger and profitability metrics.
- `integrations`: least-privilege external adapters.

## R0 scope

R0 intentionally does not perform live payments, KYC, account creation, or autonomous production deployment. It establishes the policy and audit primitives that later releases must call before executing external actions.
