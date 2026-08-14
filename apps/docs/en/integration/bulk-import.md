# Bulk Import API

Bulk import endpoints accept JSON. A request can contain at most 500 records and must include an `Idempotency-Key` header.

Before calling the import endpoints, exchange `client_id` and `client_secret` for a short-lived JWT at `/auth/integration-token`; examples use `YOUR_CLIENT_SECRET` as the secret placeholder. Human imports require an account role with import access; a regular member must have `can_import_data` enabled explicitly. See [Authentication and Access](/en/integration/authentication) for the complete flow.

## Endpoint summary

| Method | Path | Required scope |
| --- | --- | --- |
| `POST` | `/v1/institutions/:slug/imports/papers` | `papers:import` |
| `POST` | `/v1/institutions/:slug/imports/scholars` | `scholars:import` |
| `GET` | `/v1/institutions/:slug/imports` | `imports:read` |
| `GET` | `/v1/institutions/:slug/imports/:importId` | `imports:read` |

When accessing the API through the Scholar website, prefix these paths with `/api`, for example `/api/v1/institutions/example-university/imports/papers`. Use the current Scholar instance's [OpenAPI reference](/en/reference/openapi) for the complete field schema.

## Idempotency

`Idempotency-Key` must be 8–128 characters and is scoped by institution and import type:

- The same key and request body return the original import without writing duplicates.
- Reusing a key with a different request body returns `409`.
- After a network timeout, retry with the original key instead of generating a new one.

## Import papers

Papers use a normalized DOI as the idempotent identity. Each item requires `title` and `doi`.

```bash
curl -X POST 'https://scholar.example.edu/api/v1/institutions/example-university/imports/papers' \
  -H 'Authorization: Bearer YOUR_INTEGRATION_JWT' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: papers-2026-08-14-001' \
  -d '{
    "items": [
      {
        "title": "A reproducible research example",
        "doi": "https://doi.org/10.1000/example.1",
        "publish_year": 2026,
        "paper_type": "journal_article",
        "language": "en",
        "journal_name": "Example Journal",
        "keywords": ["reproducibility", "data"]
      }
    ]
  }'
```

Scholar strips DOI URL prefixes and normalizes case. In public multi-institution mode, new papers and conflicting metadata enter review and do not overwrite shared global metadata immediately.

## Import scholars

Scholars use an institution-scoped unique `external_id`. External systems do not create Scholar UUIDs; the platform maintains the institution-to-scholar mapping.

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
        "college": "School of Life Sciences",
        "title": "Researcher",
        "email": "researcher@example.edu",
        "research_directions": ["synthetic biology"],
        "subject_codes": ["0710"],
        "paper_dois": ["10.1000/example.1"]
      }
    ]
  }'
```

Every DOI in `paper_dois` must already exist in the database, so import papers first during initial synchronization. Scholar profile changes in public multi-institution mode become effective only after platform administrator review.

## Read results

The create response includes an `import_id`, aggregate counts, and row-level results. A row `action` can be:

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
