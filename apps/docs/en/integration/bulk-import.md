# Bulk Import API

Paper imports use the versioned Scholar JSON contract. Each batch contains 1–500 records and is limited to 10 MB. The browser CSV importer uses the same contract and the server validates every record again.

Human callers need institution import permission; ordinary members require `can_import_data`. System callers exchange `client_id` and `client_secret` at `/auth/integration-token` for a short-lived JWT. Use `YOUR_CLIENT_SECRET` only as a placeholder, never put real credentials in source control. See [Authentication and Access](/en/integration/authentication).

## Endpoint summary

All paths below are relative to the API root. When using the website gateway, prefix them with `/api`.

| Method | Path | Permission |
| --- | --- | --- |
| POST | `/v2/institutions/:slug/imports/papers` | `papers:import`; preview only |
| POST | `/v2/institutions/:slug/imports/:importId/apply` | `papers:import`; confirm selected rows |
| POST | `/v2/institutions/:slug/imports/:importId/review` | Platform administrator account; no system JWT |
| GET | `/v2/institutions/:slug/imports` | `imports:read` |
| GET | `/v2/institutions/:slug/imports/:importId` | `imports:read` |
| GET | `/v2/institutions/:slug/imports/:importId/items/:itemId` | `imports:read`; differences, issues and decisions |
| GET | `/v2/institutions/:slug/paper-fields` | `papers:import` |
| PUT | `/v2/institutions/:slug/paper-fields` | Institution member-management permission; field `key` in JSON; no system JWT |
| POST | `/v1/institutions/:slug/imports/scholars` | `scholars:import` |
| GET | `/v1/institutions/:slug/imports/:importId` | `imports:read`; legacy and scholar results |

History endpoints accept `limit` (1–100, default 20) and `offset`. Consult the instance's [OpenAPI reference](/en/reference/openapi) for exact field schemas.

## Identity and idempotency

The preview request requires an `Idempotency-Key` of 8–128 characters. Repeating the same key and body returns the same import; changing the body under that key returns `409`. After a timeout, retry with the original key. Use distinct keys across batches and API versions.

Each paper needs a title (or primary multilingual title) and at least one stable identity:

- `doi`, normalized by removing URL prefixes and normalizing case.
- `identifiers`: namespaced strings, for example Scopus EID, CNKI ID, WOS ID, or your stable catalog identifier.
- `paper_id`: an existing Scholar paper UUID.

Do not fabricate a DOI or deduplicate by title or author name. Conflicting IDs are reported, not automatically merged. An import cannot replace an existing DOI with a different one.

## Preview papers

```bash
curl -X POST 'https://scholar.example.edu/api/v2/institutions/example-university/imports/papers' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: papers-2026-09-01-001' \
  -d '{
    "schema_version": 2,
    "source": "library-catalog",
    "items": [
      {
        "source_row": 2,
        "paper": {
          "doi": "10.1000/example.1",
          "titles": [
            {"language": "en", "title": "A reproducible research example", "is_primary": true},
            {"language": "zh", "title": "可复现研究示例", "kind": "translated"}
          ],
          "language_tags": ["en"],
          "document_type": "article",
          "publish_year": 2026,
          "authors": [
            {"source_key": "author-1", "name": "Example Author", "order": 1, "corresponding": true}
          ],
          "sources": [{"provider": "library-catalog", "collected_on": "2026-09-01"}]
        }
      }
    ]
  }'
```

The response is `{ "code": 0, "data": { "id": "...", "status": "ready", "summary": {}, "items": [] } }`. Previewing writes an import record but rolls back all trial changes to papers, authors, journals, audit events and search-index jobs. Row actions `created/updated/unchanged` describe the proposed change, not a completed import.

## Confirm, review and retry

```bash
curl -X POST 'https://scholar.example.edu/api/v2/institutions/example-university/imports/IMPORT_ID/apply' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT' \
  -H 'Content-Type: application/json' \
  -d '{"item_ids":["ITEM_ID"],"acknowledge_warnings":true}'
```

Omit `item_ids` to confirm all eligible rows. Acknowledge warnings only after inspecting them. Self-hosted instances apply confirmed valid rows; an Airalogy Managed tenant queues them for platform review. The review request uses `decision: "approve" | "reject"`, nonempty `notes`, and optionally `item_ids` and `acknowledge_warnings`. System credentials cannot review.

New managed claims still go through the institution's content review before publication. Existing claims keep their files, submitter, scope and review decisions in both modes. A metadata update never implicitly re-approves rejected content.

Rows use `ready`, `pending_review`, `completed`, `rejected` or `error` (and `pending` while preparing). Batches use `previewing`, `ready`, `pending_review`, `completed` or `completed_with_errors`. A row's detail includes field differences, issues, decision history and its separate content-review status.

Confirmation rechecks permissions and data fingerprints. If data or field definitions changed after preview, submit a new preview with a new key; do not force an outdated result. Repeating confirmation does not reapply completed rows. Correct failed rows and submit them in a new batch.

## Structured fields

| Field | Meaning |
| --- | --- |
| `titles` | BCP 47 language tag, title, original/translated/machine-translated kind, and a single primary title |
| `language_tags`, `document_type`, `publication_status` | Publication languages; article/review/etc.; published or early access |
| `authors` | Paper-specific name, order, stable source key, corresponding/equal-contribution flags, optional ORCID and affiliation keys |
| `affiliations` | Original affiliation text, organization, department, country and optional ROR |
| `journal` | Journal UUID or checksum-valid ISSN/eISSN/ISSN-L; names alone do not merge journals |
| `funding` | Original funding text plus optional funder, award and source key |
| `sources` | Provider, external ID and ISO collection date |
| `institution_metadata` | Owning units, signature and cooperation information, plus typed `custom_fields` |
| `rankings` | Explicit journal edition, category level, category, metric, quartile and Top flag |
| `indicators` | Paper-level, dated ESI highly-cited/hot observations, including explicit `false` |

Imported author names do not identify real accounts. Keep paper-specific author occurrences; subsequently verify person bindings through institution identity administration. An `author_id` must refer to an existing authorship identity already on that paper.

JCR requires an explicit JIF or JCI metric and category; CAS requires broad/narrow categories and the CAS metric. Never infer a one-to-one mapping between mismatched lists of categories and quartiles. An edition records its system, version, revision, year/dates and source. Imported editions are drafts; published editions are immutable and corrections require a new revision.

## Custom fields and missing values

Define institution-specific fields before importing them. Supported types are text, number, boolean, date, single-select and multi-select, with requiredness, bounds, choices and visibility. Field keys are stable. Changing constraints must not invalidate existing values; deactivate an in-use field instead of reinterpreting it.

- Omitted optional fields preserve stored values.
- Boolean values are JSON `true`/`false`, not numbers or strings.
- `null` clears only nullable fields, such as optional custom values or unknown author flags. It is not a universal clearing instruction.
- Required custom values cannot be omitted on creation or cleared; an existing required value can be retained by omission.
- Invalid optional custom values become warnings and are not written; required-field errors reject the row.

The generic CSV mapper supports an explicit `0/1 → false/true` mapping. Blank cells default to omission, not `false`; clearing a nullable custom value requires an explicit mapping choice.

Institution-specific source-column mappings and cleaning rules belong to the integrating institution's private configuration. Raw source files and import reports are private data, not Scholar source code. The canonical JSON contract is the integration boundary.

## Legacy paper imports

The DOI-only `POST /v1/institutions/:slug/imports/papers` remains available for existing integrations, without the v2 preview/confirmation flow. Its `paper_type` and `language` fields are integer legacy enums, not strings. Use v2 for new integrations, multilingual titles, external IDs, authorship and journal metadata.

Managed v1 metadata refreshes of existing claims are independent pending import reviews, approved or rejected by a platform administrator at `POST /v1/institutions/:slug/imports/:importId/review` with `status: "approved" | "rejected"` and nonempty `notes`. New v1 claims continue through content review. Neither path resets an existing claim.

## Import scholars

Scholars use an institution-scoped unique `external_id`. This wire field contains the institution's canonical employee/student identifier. External systems do not create Scholar UUIDs, and email or name must not be used as identity keys. The platform links the institution person, scholarly profile, user account, and prebound papers independently.

```bash
curl -X POST 'https://scholar.example.edu/api/v1/institutions/example-university/imports/scholars' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: scholars-2026-08-14-001' \
  -d '{
    "items": [
      {
        "external_id": "HR-00042",
        "name": "Example Scholar",
        "college": ["School of Life Sciences"],
        "title": "Researcher",
        "email": "researcher@example.edu",
        "research_directions": [{"name": "synthetic biology"}],
        "subject_codes": ["0710"],
        "paper_dois": ["10.1000/example.1"]
      }
    ]
  }'
```

Every DOI in `paper_dois` must already exist in the database, so import papers first during initial synchronization. Scholar profile changes in an Airalogy Managed tenant become effective only after managed review; self-hosted changes apply directly.

## Read v1 results

The create response includes `data.id`, aggregate counts, and row-level results. A row `action` can be:

- `created`: a record was created.
- `updated`: a record was updated.
- `unchanged`: the submitted data was already current.
- `pending`: the record is waiting for review.
- `error`: validation or processing failed for this row.

Batch status can be `processing`, `pending_review`, `completed`, `completed_with_errors`, `rejected`, or `failed`. When only some rows fail, correct those rows and submit a new batch with a new `Idempotency-Key`.

```bash
curl 'https://scholar.example.edu/api/v1/institutions/example-university/imports/IMPORT_ID' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT'
```

::: tip Request size
Each batch is limited to 500 items and the server request-body limit is 10 MB. Split larger datasets in a stable order and assign a traceable key to every batch.
:::
