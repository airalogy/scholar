# Admin Console Import

Use the institution admin console to preview, confirm and track imports. Paper CSV files are converted to Scholar v2 JSON in the browser; the server independently validates every row before applying it.

## Grant member access

An institution owner or administrator with member-management access can enable “Allow data import” (`can_import_data`). Platform administrators and institution owners/admins already have import access. Import access does not grant review, member-management or credential-management permissions.

## Import papers

1. Open **Paper data import** and select CSV or standard JSON (at most 500 records and 10 MB per batch).
2. For CSV, explicitly map the columns you need. Unknown columns are ignored, not interpreted by name.
3. Select **Check and preview**. Inspect row errors, warnings and field differences; no paper data has changed yet.
4. Select the valid rows and acknowledge any warnings after reviewing them.
5. Confirm the import, or submit it for review in an Airalogy Managed tenant.
6. Check the import history, including each row's outcome and its separate content-review status.

A paper needs a title or a primary multilingual title, plus a DOI, a stable namespaced external identifier, or an existing Scholar paper ID. A DOI is not mandatory in v2. Never make one up, and do not treat a matching name or title as proof of identity.

The JSON template and [Bulk Import API](/en/integration/bulk-import) describe multilingual titles, language tags, ordered authors, corresponding-author flags, affiliations, funding, collection sources, and journal editions. Complex CSV cells use JSON arrays/objects. Keep stable author source keys when reordering authors; names do not automatically bind institution people or user accounts.

### CSV value conversion

- Blank cells normally mean “not provided”: preserve the existing value.
- A boolean field uses JSON `true`/`false`. If a source uses `0/1`, explicitly select that mapping.
- To clear an optional custom field, explicitly choose the blank-to-`null` policy. Required fields cannot be cleared.
- Malformed CSV, invalid JSON and non-finite numeric values are rejected rather than silently converted.

Save institution-specific mapping configurations in private storage or a private deployment repository. Original spreadsheets, converted JSON and import reports are data, not public source code.

## Configure institution-specific fields

Owners/admins can configure **Institution-specific fields**. Choose a stable key, labels, type, requiredness and visibility. Supported types are text, number, boolean, date, single-select and multi-select. Set applicable limits or choices.

Fields default to administrator-only visibility. Only explicitly public fields appear to visitors; institution-only fields require membership. Deactivation preserves historical values. An in-use field cannot change type or lose existing choices. New constraints must be compatible with existing records. If definitions change after a preview, create a fresh preview.

## Manage journals and evaluation editions

Authorized administrators can open **Journals and metric editions**. A self-hosted institution owner/admin can manage its catalog; in Airalogy Managed, this requires a platform administrator.

Journal imports identify journals by their Scholar ID or valid ISSN/eISSN/ISSN-L. Names alone do not merge journals. Each JCR, CAS or ESI edition records a source, version/revision and any known dates. Review draft observations before publishing. Published editions are frozen; corrections create a new revision.

Keep JCR categories and JIF/JCI quartiles paired explicitly. CAS broad and narrow categories are separate. ESI highly-cited/hot flags belong to individual papers and a dated edition. Missing observations are unknown, not `false`.

Paper details show only published editions and let readers select the edition. The site does not guess a paper's applicable edition from its publication year.

## Import scholars

Scholar CSV files require the exact headers in the downloadable template. Each row requires `external_id` (the institution's canonical student/staff identifier) and `name`; this identifier is not a Scholar UUID, email or name.

Fields such as `college`, `research_directions`, `education`, `achievements`, `research_timeline`, `subject_codes` and `paper_dois` contain JSON arrays. For example, research directions are objects, not bare strings:

```csv
external_id,name,research_directions,paper_dois
HR-00042,Example Scholar,"[{""name"":""synthetic biology""}]","[""10.1000/example.1""]"
```

This excerpt shows the cell syntax, not the full upload template. Keep all template headers when uploading. Import the referenced papers before using `paper_dois`.

## Review, retry and history

Self-hosted valid paper imports apply after confirmation. Managed metadata changes require platform review, and new managed paper claims also follow the institution's content-review workflow. Updating metadata preserves existing files, author-person bindings and review decisions; it never silently approves rejected content.

History shows each row's proposed action, processing/review status, errors, warnings and decision notes. Correct failed rows and create a new batch. If stored data changed after preview, preview again instead of overriding the conflict. Repeated confirmations do not reapply completed rows.

Legacy v1 paper imports remain supported for existing integrations. Managed metadata refreshes of existing claims appear as separate pending import reviews; new claims use content review.
