# Integration Overview

Scholar supports two institution data import paths. Both call the same JSON import service, so validation, idempotency, review, and auditing behave consistently.

| Scenario | Recommended path | Identity | Intended user |
| --- | --- | --- | --- |
| Occasional import or manual review | Institution admin console | User account | Institution administrators and authorized members |
| Scheduled synchronization from institutional systems | Bulk Import API | Short-lived JWT exchanged from a system credential | Research or education information systems |

## Recommended onboarding flow

1. Ask the institution owner to confirm the import scope and data steward.
2. Enable “Allow data import” for a human operator, or let the owner create a least-privilege system credential.
3. Submit a small sample in a test environment and inspect row-level results and review states.
4. Reuse a stable `Idempotency-Key` after a network failure to prevent duplicate writes.
5. Import papers before scholars that reference them through `paper_dois`.
6. Rotate system credentials regularly and revoke credentials as soon as they are no longer used.

## When data becomes effective

- Public multi-institution mode: submissions enter the review flow; integration credentials cannot approve their own submissions.
- Private single-institution mode: valid records are applied directly, while the import and audit history is still retained.

Continue with [Authentication and Access](/en/integration/authentication) or open the [Bulk Import API](/en/integration/bulk-import).
