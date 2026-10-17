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

- Airalogy Managed tenant: submissions enter the managed review flow; integration credentials cannot approve their own submissions.
- Self-hosted institution: valid records are applied directly by default. Opting into governed paper review makes imported updates review proposals; published metadata stays unchanged until human approval and application.

Continue with [Authentication and Access](/en/integration/authentication) or open the [Bulk Import API](/en/integration/bulk-import).

## Personnel directory synchronization

Keep institution-specific extraction/mapping in a private adapter. Scholar accepts typed facts, not account roles. A person has a stable source `externalId` and one or more institution identifiers. Names/email never merge people; new verified identifiers do not replace the primary identifier. People can exist without user accounts.

Standard client manifest:

```json
{
  "sequence": 1,
  "mode": "full",
  "rows": [
    { "kind": "person", "externalId": "person-1", "name": "Example Person", "identifiers": ["STAFF-001"], "category": "staff", "status": "active" },
    { "kind": "unit", "externalId": "unit-1", "name": "Example Department", "active": true, "parentExternalId": null },
    { "kind": "position", "externalId": "post-1", "unitExternalId": "unit-1", "name": "Researcher", "active": true },
    { "kind": "appointment", "externalId": "appointment-1", "personExternalId": "person-1", "positionExternalId": "post-1", "status": "active", "startsAt": null, "endsAt": null }
  ]
}
```

Use a monotonically increasing integer sequence per source; retry the same manifest after network errors. Maximum: 100,000 rows, 500 per page. `full` covers that source's people, units, positions and appointments; use `incremental` for partial updates. Never label a truncated feed as full. Booleans are `true`/`false`; unknown dates are `null`. Person status: `active`, `departed`, `graduated`, `suspended`; appointment status: `active`, `ended`. Category: `staff`, `undergraduate`, `postgraduate`, `visitor`, `other`, `unknown`. Omitted identifiers are not revoked; identifier revocation is a separate administrator action.

Paths relative to the API base:

1. `POST /v1/institutions/:slug/directory/sources/:sourceId/runs`, with `Idempotency-Key` and `{ sequence, mode, expectedPages, expectedRows }`.
2. `PUT .../runs/:runId/pages/:page`, with `{ rows }`; pages start at 1. Identical retries are safe; conflicting contents are rejected.
3. `POST .../runs/:runId/validate`, with `{}`; incomplete/conflicting snapshots change no personnel.
4. `GET .../runs/:runId?offset=0` reads the run and 100 staged rows, previous values and errors.
5. `POST .../runs/:runId/apply`, with `{}`; validated changes commit atomically. Handle `needs_confirmation` in the human admin console, not by bypassing it with credentials.

`pnpm directory:sync /private/path/directory.json` performs this protocol. Configure `SCHOLAR_API_URL` (including `/api` if applicable), `SCHOLAR_INSTITUTION_SLUG`, `SCHOLAR_DIRECTORY_SOURCE_ID`, `SCHOLAR_DIRECTORY_CLIENT_ID`, `SCHOLAR_DIRECTORY_CLIENT_SECRET` privately. HTTPS is mandatory except loopback development. Set `SCHOLAR_DIRECTORY_SYNC_INTERVAL_SECONDS` to an integer of at least 60 for periodic execution; a private extractor replaces the manifest atomically and advances its sequence. Runs do not overlap; restart safely reuses the manifest. Alternatively invoke once from an existing scheduler. Never commit real manifests or credentials.

## External task inbox

Optional configuration: HTTPS `REVIEW_INBOX_URL`, HTTPS `REVIEW_PUBLIC_ORIGIN`, and `REVIEW_INBOX_SECRET` of at least 32 characters. JSON notifications contain `eventId`, `taskId`, `sequence`, `eventType`, `currentStatus`, `institutionId`, `timestamp`, `recipientPersonIds`, and the Scholar task `url`. `Idempotency-Key` is the event ID. `X-Scholar-Signature` is `sha256=` followed by HMAC-SHA256 hex of the **exact raw body**.

The private receiver verifies signature/timestamp, deduplicates event IDs, stores the highest sequence per task, applies `currentStatus` (never reopens a terminal task because of delayed creation), maps opaque person IDs to campus recipients, and acknowledges only after durable acceptance. Retries may refresh the timestamp/body/signature while keeping event identity. Scholar orders delivery per task and retries with expiring leases; after eight attempts an administrator must inspect and retry. Reconciliation sends current-state events. No email, student/staff number or document payload is included. Campus mapping and message contracts require a separately tested private adapter; this is not an approval callback.
