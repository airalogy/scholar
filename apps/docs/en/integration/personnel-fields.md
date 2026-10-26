# Personnel and organization field reference

For institutional IT teams and integration vendors. Start with the [personnel synchronization contract](/en/integration/personnel-sync) for authentication, batches and update semantics. “Required” applies to **every submitted record**; incremental synchronization is not an arbitrary-field PATCH.

## Shared constraints

- Send UTF-8 JSON with case-sensitive `camelCase` business fields. Records and request bodies reject undefined fields. `external_id` cannot replace `externalId`; enum values such as `doctoral_student` retain their exact spelling.
- IDs are strings: retain leading zeros. Source `externalId` values contain 1–100 characters, including at least one non-whitespace character. A record is identified within its source and `kind`; a Scholar UUID is not required. Keep case, whitespace and encoding stable. Never use a person's name, an array index or a newly generated value on each run as their key.
- `personExternalId`, `relatedPersonExternalId`, `unitExternalId`, `positionExternalId` and non-null `parentExternalId` reference an `externalId` in the same source, not an employee/student number or Scholar UUID. References must already exist or be included in this batch. Records may span pages; application resolves dependencies.
- Boolean fields require JSON `true/false`, not `"true"`, `"false"` or `0/1`. Convert upstream values explicitly in the private adapter.
- Dates use timezone-qualified ISO 8601, such as `2026-09-01T08:00:00+08:00` or `2026-09-01T00:00:00Z`, not unqualified local time. Unknown dates are `null`, never an empty string, `"null"` or `0`.
- Effective intervals are `[startsAt, endsAt)`: inclusive start, exclusive end. When both are provided, end must strictly follow start. An `active` record is still constrained by its dates; `ended` records do not become effective because dates are null.
- Send only necessary data. Do not include passwords, tokens, government ID numbers, arbitrary institutional columns, `userId`, `scholarId`, administrator roles, reviewer grants or `can_import_data`.

## Record fields

### person

Personnel facts can exist before first login. Available in versions 1 and 2.

| Field | Required | Type and constraints | Meaning |
| --- | --- | --- | --- |
| `kind` | Yes | String, exactly `person` | Record type |
| `externalId` | Yes | String, 1–100 | Permanent source person key; unchanged when employee/student numbers change |
| `name` | Yes | String, 1–100 | Display name; clean whitespace before sending; not an automatic merge key |
| `identifiers` | Yes | Array of 1–20 unique strings, each 1–100 | Verified institutional numbers belonging to this person, e.g. `["STU-0001", "EMP-0002"]` |
| `email` | No | Email-format string up to 100, or `null` | Personnel contact email; not account-linking evidence and does not rewrite the login account email |
| `category` | Yes | Enum below | Compatible coarse personnel category |
| `status` | Yes | Enum below | Personnel lifecycle status, not reviewer authority |

`category`: `staff`, `undergraduate`, `postgraduate`, `visitor`, `other`, `unknown`. Use `identity` for finer distinctions such as doctoral student; do not put `doctoral_student` in `category`.

`status`: `active` (enrolled/employed), `departed`, `graduated`, `suspended` (suspended upstream). There is no `deleted` status. Non-active statuses affect admission and revoke applicable privileges; returning to active does not restore old grants. Manual suspension remains independent.

Identifier matching trims leading/trailing whitespace and ignores case. Normalized duplicates within the array conflict; do not distinguish people by letter case. The first identifier initializes a new person's canonical number. Later additions or reordering do not replace an existing canonical number. Omitted old identifiers are retained; revocation requires separate administrator verification. Resending a revoked identifier does not restore it.

### unit

Organizational unit, such as a school, department or research group. Available in versions 1 and 2.

| Field | Required | Type and constraints | Meaning |
| --- | --- | --- | --- |
| `kind` | Yes | String, exactly `unit` | Record type |
| `externalId` | Yes | String, 1–100 | Stable unit key; retain when only the name changes |
| `name` | Yes | String, 1–200 | Unit name |
| `active` | Yes | Boolean | Whether the unit is active; not a personnel status string |
| `parentExternalId` | No | String, 1–100, or `null` | Same-source parent; omission preserves the relationship, `null` removes it |

A parent cannot be the unit itself or introduce a cycle. Synchronization cannot replace a parent relationship managed manually or by another source. Reorganizations must not rewrite historical publication affiliations.

### position

A position within a unit, which may have multiple personnel appointments. Available in versions 1 and 2.

| Field | Required | Type and constraints | Meaning |
| --- | --- | --- | --- |
| `kind` | Yes | String, exactly `position` | Record type |
| `externalId` | Yes | String, 1–100 | Stable position key |
| `unitExternalId` | Yes | String, 1–100 | Same-source unit key |
| `name` | Yes | String, 1–100 | Position name |
| `active` | Yes | Boolean | Whether the position is active |

A title such as “Dean” or “PI” grants no review authority. Deactivating or moving a position to another unit removes the associated appointments' old reviewer authorization basis.

### appointment

Connects a person to a position. A person may have several appointments. Available in versions 1 and 2.

| Field | Required | Type and constraints | Meaning |
| --- | --- | --- | --- |
| `kind` | Yes | String, exactly `appointment` | Record type |
| `externalId` | Yes | String, 1–100 | Stable appointment key; cannot transfer to another person |
| `personExternalId` | Yes | String, 1–100 | Same-source person key |
| `positionExternalId` | Yes | String, 1–100 | Same-source position key |
| `status` | Yes | `active` or `ended` | Appointment status |
| `startsAt` | Yes | Timezone-qualified date-time string or `null` | Effective start |
| `endsAt` | Yes | Timezone-qualified date-time string or `null` | Effective end |

For a transfer, preferably end the previous appointment and use a new key for the new appointment, retaining the business relationship history. Scholar records observed appointment changes. Reappointment does not restore old reviewer grants.

### identity

A precise personnel identity fact. Several may coexist for one person. Version 2 only.

| Field | Required | Type and constraints | Meaning |
| --- | --- | --- | --- |
| `kind` | Yes | String, exactly `identity` | Record type |
| `externalId` | Yes | String, 1–100 | Stable identity-record key; cannot transfer to another person |
| `personExternalId` | Yes | String, 1–100 | Same-source person key |
| `code` | Yes | Enum below | Identity code, not a permission label |
| `status` | Yes | `active` or `ended` | Identity status |
| `startsAt` | Yes | Timezone-qualified date-time string or `null` | Effective start |
| `endsAt` | Yes | Timezone-qualified date-time string or `null` | Effective end |

`code`: `undergraduate`, `masters_student`, `doctoral_student`, `postgraduate`, `postdoc`, `faculty`, `staff`, `pi`, `research_assistant`, `visitor`, `other`.

For example, separate records can represent concurrent `doctoral_student` and `research_assistant` identities. Verify unknown identities instead of guessing from names, position titles or coarse `category` values. Missing facts needed by identity-based routing cause verification tasks, not silent bypasses.

### relationship

Supervisor/responsible-person relationship between people. Version 2 only.

| Field | Required | Type and constraints | Meaning |
| --- | --- | --- | --- |
| `kind` | Yes | String, exactly `relationship` | Record type |
| `externalId` | Yes | String, 1–100 | Stable relationship key; its subject cannot move to another person |
| `personExternalId` | Yes | String, 1–100 | Subject person, for example the student |
| `relatedPersonExternalId` | Yes | String, 1–100 | Supervisor/responsible person; must differ from the subject |
| `relationship` | Yes | `supervisor` or `responsible` | Relationship type |
| `status` | Yes | `active` or `ended` | Relationship status |
| `startsAt` | Yes | Timezone-qualified date-time string or `null` | Effective start |
| `endsAt` | Yes | Timezone-qualified date-time string or `null` | Effective end |

Use separate stable relationship keys for multiple supervisors. A supervisor change creates a new revision; it does not silently replace reviewers in an existing round. Relationships do not confer review authority: explicit supervisor/responsible-person grants are still required.

## Omission, null and ending relationships

| Input | Meaning for an existing record |
| --- | --- |
| Record missing from an incremental batch | Leave that record unchanged |
| Required field omitted from a submitted record | Invalid; incremental mode does not waive required fields |
| `email` omitted / `null` | Retain existing personnel email / clear personnel email |
| `parentExternalId` omitted / `null` | Retain parent / remove parent relationship |
| `startsAt` or `endsAt` is `null` | Write an unknown/unspecified date, not “keep the previous value” |
| `identifiers: []` or `null` | Invalid; at least one verified number is required |
| Old number omitted from `identifiers` | Retain it; omission cannot revoke or transfer it |
| `active: false` | Explicitly deactivate a unit or position; not omission |
| Non-active personnel status or `ended` relationship | Retain the record and history; no hard deletion |
| Record missing from a complete full snapshot | Deactivate only with authoritative missing-record deactivation enabled; preview and confirm first |

Do not replace all blanks with `null` indiscriminately: nullability and meaning differ by field. Institution-specific columns must stay in the private adapter or become an explicitly agreed contract extension, not arbitrary properties on these objects.
