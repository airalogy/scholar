# Admin Console Import

The institution admin console provides CSV selection, header validation, data preview, submission, and import history. The browser converts CSV to JSON and calls the same bulk import API used by system integrations. The server always performs full validation again.

## Grant member access

An institution owner or administrator with member-management access can enable “Allow data import”. This setting maps to `can_import_data` and does not grant review, member administration, or credential management access.

These roles can import without the additional setting:

- Platform `platform_admin`
- Institution `owner`
- Institution `admin`

## CSV requirements

A file can contain at most 500 rows. A paper requires `title` and `doi`; a scholar requires `external_id` and `name`.

Common paper columns:

```text
title,doi,publish_year,paper_type,language,abstract,journal_name,publish_date,citation_count,pages,link,keywords
```

Common scholar columns:

```text
external_id,name,avatar,college,title,lab,office,email,phone,bio,join_year,research_directions,education,achievements,research_timeline,letter_index,subjects,subject_codes,paper_dois
```

Array fields such as `keywords`, `research_directions`, `education`, `achievements`, `research_timeline`, `subjects`, `subject_codes`, and `paper_dois` must contain a valid JSON array inside the CSV cell:

```csv
external_id,name,research_directions,paper_dois
HR-00042,Example Scholar,"[""synthetic biology"",""bioinformatics""]","[""10.1000/example.1""]"
```

## After submission

Use Import History to inspect:

- Overall status and created, pending, and failed counts.
- Each row's `created/updated/unchanged/pending/error` result.
- Validation errors, review state, and reviewer notes.

Pending records in public multi-institution mode do not overwrite published data. Private single-institution mode applies valid data directly but retains the same audit trail.
