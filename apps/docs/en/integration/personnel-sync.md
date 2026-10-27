# Personnel synchronization contract

For institutional IT teams and integration vendors. Airalogy Scholar accepts standard JSON. Extraction from HR/student systems, column mapping, cleansing and source aggregation belong in an institution's private adapter. This is not a SCIM server and does not replace existing personnel systems.

Companion references: [six record types and their fields](/en/integration/personnel-fields), [library operating handbook](/en/administration/personnel-review), and [OpenAPI](/en/reference/openapi). The API path version `/v1` and batch `schemaVersion` are separate concepts. Check the deployed version before sending v2 data; older instances may not support it.

Personnel synchronization fields use case-sensitive `camelCase`, such as `externalId`, `personExternalId` and `expectedRows`; alternatives such as `external_id` are rejected. The token exchange below retains existing fields such as `client_id` and `access_token`, and enum values such as `doctoral_student` remain unchanged. Follow the separate field dictionaries for legacy paper/scholar imports; do not transform keys across all APIs.

## 1. Before integration

1. An institution owner or platform administrator creates a directory source and supplies the institution `slug` and source UUID `sourceId`. Agree on its personnel scope, full-snapshot completeness and upstream owner.
2. Create a credential with only `directory:sync`, bound to that source through `directorySourceId`. Do not combine it with paper/scholar import scopes. Ordinary admins or members with `can_import_data` do not thereby gain directory management authority.
3. Store credentials in a secret manager and confirm the HTTPS API base URL, for example `https://scholar.example.edu/api`. Keep secrets and real personnel data out of public repositories, screenshots and logs.
4. Complete the example and acceptance checklist using a test source. Start incrementally or with missing-record deactivation disabled. Directory-only admission, reviewer grants and workflow configuration are separate administrator decisions.

Source settings: `enabled` allows new synchronization; `authoritative` declares authoritative ownership; `deactivateMissing` enables full-snapshot omission handling and requires an authoritative source. `maxDeactivationPercent` (0–100) sets the mass-deactivation confirmation threshold. `expectedIntervalHours` (1–720) detects overdue synchronization; it does not cause Scholar to fetch upstream data.

## 2. Identifiers and ownership

| Identifier | Issuer | Purpose |
| --- | --- | --- |
| `sourceId` | Scholar when creating a source | Boundaries for synchronization and credentials |
| `person.externalId` | Institution adapter | Stable source key for a real person; retain when employee/student numbers change |
| `identifiers` | Institution-verified employee/student numbers | Connect SSO identities; multiple numbers allowed, without name/email merging |
| `institution_people.id` | Scholar | Internal person UUID; directory references still use `personExternalId` |
| Account ID / scholar profile ID | Scholar | Internal association properties are `userId` / `scholarId`; neither is personnel synchronization input |

Each person has one owning source record; other sources or source keys cannot take ownership. An authoritative source can adopt a person not yet source-owned through **consistent, conflict-free existing numbers**, never names or email. Resolve multiple upstream owners in the private adapter. Revoked numbers or numbers belonging to different people require verification; do not automatically merge, renumber or create replacement people to evade a conflict.

## 3. Versions, batches and limits

`schemaVersion: 1` supports `person/unit/position/appointment`; version 2 additionally supports `identity/relationship`. Omission defaults to 1. The legacy `category` remains compatible but does not infer precise identities such as doctoral student or PI.

The create-run body has these fields. It is distinct from the client manifest containing `rows`:

| Field | Required | Constraints |
| --- | --- | --- |
| `schemaVersion` | No | Integer 1 or 2; default 1 |
| `sequence` | Yes | Increasing per-source integer, 1–2147483647; new batches exceed the source's last applied sequence, without requiring consecutive values |
| `mode` | Yes | `incremental` or `full` |
| `expectedPages` | Yes | Integer 1–1000; pages are numbered from 1 through this value |
| `expectedRows` | Yes | Integer 0–100000; the sum of rows across all pages must match exactly |

Each page permits up to 500 records and a request body of 4 MiB. Creation requires a 1–128 character `Idempotency-Key`, scoped to the source. The same source/key returns the original batch; changing its version, sequence, mode or counts conflicts. A batch cannot repeat `(kind, externalId)`.

### Incremental, full and null semantics

- `incremental` processes supplied records and retains omitted records. Every supplied record still needs all required fields.
- `full` declares a complete source snapshot, not the current query page, department or change set. Omission handling requires `authoritative=true`, `deactivateMissing=true` and successful completeness checks. v1 full snapshots never end v2 identities/relationships; v2 full snapshots cover all six kinds owned by that source.
- Deactivation retains people, numbers and history; no hard deletion. Personnel departures, ending identity/relationship facts and reductions in reviewer grants can require confirmation.
- Incomplete extraction, failure or timeout must not become an empty full snapshot. `expectedRows: 0` is allowed only when intentionally correct; an empty batch still uploads one page with `{"rows":[]}`.
- `null` differs from omission and booleans are not numbers. Omitted `email` is retained; `null` clears it. Required dates set to `null` become unknown, and an empty identifiers array is invalid. See [null semantics](/en/integration/personnel-fields#omission-null-and-ending-relationships).

## 4. Complete integration example

Business endpoints share `/v1/institutions/:slug/directory/sources/:sourceId`, relative to the API base URL above. All require a Bearer token:

| Method and suffix | Request | Successful `data` |
| --- | --- | --- |
| `POST /runs` | Declaration + `Idempotency-Key` | Batch object |
| `PUT /runs/:runId/pages/:page` | `{rows}` | `null` |
| `POST /runs/:runId/validate` | `{}` | Validated batch object |
| `POST /runs/:runId/apply` | `{}`; human confirmation also needs notes | Applied batch object |
| `GET /runs/:runId?offset=0` | No request body | `{run,rows}` |

Download the [synthetic directory example](/examples/personnel-sync-v2.json) as `personnel-sync-v2.json`. Its 11 records comprise two people, two units, two positions, two appointments, two identities and a supervision relationship, covering all six kinds. It is **incremental**, not an institution's complete directory. Do not convert it into a production full replacement.

The client manifest is `{ schemaVersion, sequence, mode, rows }`. The repository command `pnpm directory:sync /private/path/personnel-sync-v2.json` handles pagination, validation and application; see the [integration overview](/en/integration/#personnel-directory-synchronization) for environment variables and scheduling. One-shot execution exits with code 2 when application is incomplete, such as awaiting confirmation. The manifest is limited to 30 MiB; individual pages must still meet server limits.

For a custom integration, follow this HTTP sequence. Commands require `curl` and `jq`; replace the URL, institution and source. Inject `SCHOLAR_DIRECTORY_CLIENT_ID` and `SCHOLAR_DIRECTORY_CLIENT_SECRET` from a private runtime. Never enable shell tracing, print token responses or use `curl -v`.

### 4.1 Exchange a token

`POST /auth/integration-token` returns **no** `{ code, data }` envelope:

```bash
set -euo pipefail
API='https://scholar.example.edu/api'
SLUG='example-university'
SOURCE_ID='00000000-0000-4000-8000-000000000001'
TOKEN=$(jq -n '{client_id: env.SCHOLAR_DIRECTORY_CLIENT_ID, client_secret: env.SCHOLAR_DIRECTORY_CLIENT_SECRET}' |
  curl --fail-with-body --silent --show-error "$API/auth/integration-token" \
    -H 'Content-Type: application/json' --data-binary @- | jq -er '.access_token')
RUNS="$API/v1/institutions/$SLUG/directory/sources/$SOURCE_ID/runs"
```

```json
{ "access_token": "YOUR_INTEGRATION_JWT", "token_type": "bearer", "expires_in": 3600, "scope": "directory:sync" }
```

Tokens last one hour. Each request also checks credential expiry, revocation and rotation. Exchange a fresh token to resume the original batch, not duplicate data. Integration tokens can access only allowed synchronization endpoints, not source administration, admission policy, reviewer grants or content decisions.

### 4.2 Create a batch

Example for a new test source:

<!-- contract: directory-run -->
```json
{ "schemaVersion": 2, "sequence": 1, "mode": "incremental", "expectedPages": 1, "expectedRows": 11 }
```

```bash
RUN=$(jq '{schemaVersion, sequence, mode, expectedPages: 1, expectedRows: (.rows | length)}' personnel-sync-v2.json |
  curl --fail-with-body --silent --show-error "$RUNS" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
    -H 'Idempotency-Key: example-directory-1' --data-binary @-)
RUN_ID=$(printf '%s' "$RUN" | jq -er '.data.id')
```

Success returns HTTP 200 with `{ "code": 0, "data": { ...batch fields... } }`. A new run is `staging`; a replay can return its existing `validated`, `needs_confirmation`, `failed` or `applied` state. Check that state before continuing. Stop when already applied; pages cannot be uploaded after leaving staging.

### 4.3 Upload pages

For a new `staging` batch, call `PUT .../runs/:runId/pages/1`. Its body contains only `rows`, not the other manifest fields:

```bash
jq '{rows}' personnel-sync-v2.json |
  curl --fail-with-body --silent --show-error -X PUT "$RUNS/$RUN_ID/pages/1" \
    -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data-binary @-
```

`{"code":0,"data":null}` acknowledges staging, not updated personnel. Upload all pages and retain their numbers. Retry with exactly the same JSON content and field/row ordering; do not revise an already accepted page.

### 4.4 Validate, inspect and apply

<!-- contract: directory-apply -->
```json
{}
```

```bash
curl --fail-with-body --silent --show-error "$RUNS/$RUN_ID/validate" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
curl --fail-with-body --silent --show-error "$RUNS/$RUN_ID?offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

Validation does not change personnel. Inspect status, counts and differences. Only a `validated` result can proceed to automatic application:

```bash
curl --fail-with-body --silent --show-error "$RUNS/$RUN_ID/apply" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
```

Send `needs_confirmation` to an administrator for inspection and a reasoned confirmation in the console. Automation must not try `confirmDeactivation: true` to bypass this. Application revalidates current data and commits the whole batch atomically; one conflicting row rolls back the batch, rather than allowing partial writes.

Both validate and apply return `{code:0,data:batch}`. This successful application response is a **field excerpt**, not a full object:

```json
{ "code": 0, "data": {
  "id": "00000000-0000-4000-8000-000000000002",
  "schemaVersion": 2, "sequence": 1, "mode": "incremental", "status": "applied",
  "expectedPages": 1, "expectedRows": 11,
  "createdCount": 11, "updatedCount": 0, "deactivatedCount": 0,
  "endedIdentityCount": 0, "endedRelationshipCount": 0, "error": null
} }
```

Counts include all record kinds, not just people. An update count does not guarantee every record's values changed. GET returns `{code:0,data:{run,rows}}`; `run` is the batch and `rows` contains up to 100 records per call, paginated with `offset=0/100/200`. Rows include `kind/externalId/payload/previousSnapshot/outcome/error`. Successful preview writes roll back, so inspect `run.status`, not only row outcomes, to determine validation/application success. Errors and before-values can contain personal information: use controlled channels.

## 5. States, errors and safe retries

The normal sequence is `staging → validated → applied`. High-impact changes follow `staging → needs_confirmation → applied after human confirmation`. Invalid data can record `failed`; authentication errors, incomplete pages or stale sequences do not necessarily change the current run state. HTTP success alone does not mean personnel have changed: confirm `applied`.

Errors normally use `{"code":409,"message":"..."}`. Message text can change between versions; do not program against English strings. Gateway errors may not be JSON.

| HTTP / state | Typical cause | Action |
| --- | --- | --- |
| 400 | Invalid field, type, enum, version, page or count | Correct the input. Accepted pages cannot be edited; use a new sequence/key for revised data |
| 401 | Expired token, invalid or rotated credential | Check credentials, exchange a new token and resume the same batch/key; do not retry invalid credentials indefinitely |
| 403 | Missing scope, wrong source binding, integration access to administration | Have the owner inspect authorization; changing personnel numbers or adding permission fields cannot fix it |
| 404 | Incorrect or inaccessible institution/source/run | Check deployment and identifiers, without probing other institutions |
| 409 | Stale sequence, conflicting key/page, missing pages, identity/reference conflict or invalid state | Query the original run; complete unstaged pages or repair upstream and create a new batch. Never auto-merge people |
| 413 | Page larger than 4 MiB | Repaginate into a new run with accurate page counts, not a smaller declared row count |
| 429 | Deployment rate limit | Honor `Retry-After` when present and use bounded backoff |
| 5xx / network failure / timeout | Outcome unknown | Query the original run before changing keys; use bounded exponential backoff and alert on persistent failure |
| `needs_confirmation` | Mass personnel/identity/relationship deactivation or loss of authority | Pause automatic application and request human review; the machine cannot confirm |

If creation times out before returning `runId`, resend the same declaration and `Idempotency-Key` to retrieve the original run. Retry pages with original contents. After an apply timeout, GET first: if applied, do not create a new batch; replaying apply is idempotent. Retain failed runs and submit corrected content with a **new sequence and key**, above the last applied sequence. Apply each source's batches serially so a newer success does not render an older batch stale. Stopping a scheduler does not cancel an already submitted batch.

## 6. Representing personnel changes

| Change | Upstream submission | Expected result |
| --- | --- | --- |
| Arrival before first login | `person` plus necessary organization/identity records | Person exists first; first admitted SSO creates an ordinary account |
| Another employee/student number for the same person | Same `externalId`, verified `identifiers` | Retain person and paper links; added numbers cannot belong to anyone else |
| Transfer / concurrent appointment | End an old appointment or add another stable appointment key | Retain history; concurrent posts allowed; no automatic reviewer grants or restoration |
| Supervisor changes | Update/end the `relationship`, keeping its subject | Preserve revisions; existing tasks are not silently reassigned; administrator starts a new round when needed |
| Departure / graduation | Complete `person` with `departed/graduated` status | Restrict admission, retain records/history and revoke applicable privileges |
| Return | Same person key, `active`, current relationships | No duplicate person; old elevated permissions require explicit regrant |
| Unit rename / merger | Keep key for rename; create a real successor and end old relationships for merger | Preserve history and historical publication affiliations |
| Incorrect upstream fact | Repair upstream/adapter and send an increment | Temporary exceptions require independent approval, expiry and audit |

## 7. Integration acceptance checklist

Use fictional people in a test environment. Record run IDs, outcomes, failures and resolutions; do not attach real personnel lists to public issues.

- [ ] Apply all 11 example records; replay creation/pages/application without duplicate people.
- [ ] Provision a person without an account; first SSO resolves a verified number and creates an ordinary user without reviewer authority.
- [ ] Keep same-name people distinct; keep two verified numbers on one person; conflicting numbers fail atomically.
- [ ] Verify name updates, email omission/null, date `null`, booleans and invalid numeric `0/1` against the reference.
- [ ] Reject missing pages, duplicate rows, foreign-source references, hierarchy cycles and stale applied sequences without mass departures on failure.
- [ ] Retain omitted incremental records; require human confirmation for large authoritative full-snapshot deactivation and reject machine confirmation.
- [ ] Preserve v2 facts during v1 full synchronization; retain history and enforce mass-change protection for v2 omissions.
- [ ] Revoke old authority after departure/transfer; do not restore it after return/reappointment or rewrite past rounds after supervisor changes.
- [ ] Reject old JWTs after credential revocation/rotation, cross-source calls, member management and review decisions.
- [ ] Recover from simulated create/page/apply timeouts with original keys and confirmed final states.
- [ ] Simulate concurrent identities and multi-unit review routes; unverified material or equal-priority conflicts cannot publish directly.
- [ ] Hand over upstream ownership, private adapter, schedule, alerts, credential rotation, batch verification and human-confirmation responsibilities.

## Human administration endpoints

These endpoints require institution owner/platform administrator sessions, reject integration JWTs, and return `{ code, data }`:

| Endpoint under `/v1/institutions/:slug` | Purpose |
| --- | --- |
| `GET /directory/people/:personId/history` | Provenance, identities, relationships, appointments and corrections |
| `GET /directory/organization-history` | Observed organizational history |
| `GET/POST /directory/corrections` | List/request temporary corrections |
| `POST /directory/corrections/:id/decision` | `approve`, `reject`, `revoke` with `notes` |
| `GET/POST /review-governance/routes` | List/publish routing versions |
| `POST /review-governance/simulate` | Preview routing for people and publication units |
| `POST /review-governance/cases/:caseId/reroute` | New round for current pending material, with `versionId` and `notes` |

Correction input: `personId`, `field` (`name` or `admission`), `value`, `expiresAt`, `reason`. Admission value is `allow`, at most 7 days; names at most 30 days. Independent verification is mandatory. Source status and authority remain unchanged.

Rule input: `key`, `name`, `contentType`, `priority`, `identityCodes`, `nodeIds`, `requestKinds`, `enabled`, `expectedRevision`, `notes`, `steps`. Use revision 0 to create or the current revision to update. Stale writes fail. At most 100 rule keys per institution. Stages use the existing `name`, `groups`, `deadlineHours` and optional `ccPersonIds`. New groups `supervisors` and `responsible` require explicit `supervisor` and `responsible` grants respectively.

Request kinds: `submission`, `metadata`, `attribution`, `access`, `bibliography`, `institutional_withdrawal` (also restoration). Simulation takes `contentType`, `requestKind`, `personIds`, `nodeIds`, and reads published rules only. Conflicts are returned as blocking explanations without creating tasks. History endpoints use `offset`; route lists accept `history=true`.

## Upgrade

The additive migration records an observed baseline for existing appointments and organization edges, retaining people, identifiers, papers and review rounds. It does not infer older history. Populate v2 identities before publishing identity rules. Upgrading does not enable strict admission or governed review automatically.

Once a governed default is enabled, new submissions and governed imports/changes share routing. Rule updates never rewrite existing rounds. Legacy single-step import approval cannot bypass enabled governance. Validate institutional examples and handover procedures using the [operating handbook](/en/administration/personnel-review).
