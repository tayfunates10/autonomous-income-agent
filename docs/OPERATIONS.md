# Production Operations Runbook

## Deployment contract

The agent runs only with explicit production configuration. Secrets are injected by the deployment environment or an external secret manager; they are never committed. The owner approval private signing key must remain outside the agent runtime. The agent receives only the owner public key needed to verify approvals.

## Startup checklist

1. Install dependencies with Node.js 22+.
2. Run `npm run check` and require success.
3. Populate production environment settings from `.env.example` without copying secrets into source control.
4. Configure one or more explicitly authorized HTTPS origins.
5. Configure persistent checkpoint storage on durable local or mounted storage.
6. Verify the runtime does not contain `AIA_OWNER_PRIVATE_KEY_PEM`.
7. Evaluate production readiness and refuse startup when the report is `not_ready`.

## Network security

Production network access is HTTPS-only. DNS is resolved before connection and every returned address must be public. The selected address is pinned for the TLS connection while SNI/certificate verification continues to use the requested hostname. Private, loopback, link-local, documentation, multicast and other reserved address classes are denied. Redirects are denied. Credentials are attached only to the exact configured origin and are resolved from secret references at runtime.

## Resource limits

Configure request timeout, maximum response bytes, maximum request body bytes and request-rate window conservatively. Increasing limits is an operational decision and must not disable the policy/approval gates.

## Recovery

The runtime writes integrity-protected checkpoints through the file checkpoint store. Checkpoint persistence must use durable storage. On restart, restore the last valid checkpoint and keep replay/idempotency protections enabled. Corrupted or tampered checkpoints must fail closed rather than being ignored.

## Health and readiness

Readiness is a configuration/security gate. Health output is intentionally non-sensitive: it reports only ready/degraded state and failed check names, never credentials, private keys, request bodies, customer data or secret values.

## Incident response

If credential leakage, unexpected origin access, checkpoint corruption, approval verification failure, policy bypass or anomalous financial activity is suspected: disable external execution, revoke/rotate affected credentials outside the agent, preserve audit/checkpoint evidence, investigate the exact event chain, and resume only after the root cause is fixed and the full CI gate is green.

## Financial and identity boundary

KYC, legally binding contracts, account ownership changes, loans/credit, bank/payment onboarding, withdrawals/transfers and other high-impact financial actions require explicit owner approval. Forgery, credential theft, platform-control bypass and fake-human impersonation remain permanently denied.
