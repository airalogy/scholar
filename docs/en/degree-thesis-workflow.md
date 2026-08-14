# Degree-Thesis Collection and Review Workflow

English | [简体中文](../zh/degree-thesis-workflow.md)

Airalogy Scholar treats degree theses as a distinct content domain while reusing the platform-wide review engine. Business fields, immutable versions, and full-text files remain thesis-specific. Submission, staged review, change requests, resubmission, and audit history use the shared `content_review_*` tables.

## Data and versions

- `degree_theses` stores the institution, submitter, current version, published version, and publication time.
- `degree_thesis_versions` stores the title, author, student identifier, training unit, major, degree category, award year, advisors, abstract, keywords, language, visibility, confidentiality date, and PDF association.
- Every save creates an immutable version, and each review action identifies the reviewed version.
- When a revision of an already published thesis is under review, public readers continue to see the previous published version.
- Public readers see only the published version and published status. Draft state, submitter identity, and review progress remain private.

### Identifier design

- `id` is an internal UUID used for foreign keys and transactions; it carries no business meaning.
- `record_code` is a server-generated, globally unique, immutable public identifier. It combines a readable institution prefix, `THS`, and 96 random bits. `THS` means thesis.
- `institution_reference` optionally preserves the institution's source archive identifier. It is unique within the institution and is returned only to the submitter, current reviewers, and authorized administrators.
- Student identifiers, degree categories, and award years are correctable business fields. They do not form the public identifier, and student identifiers are not returned in ordinary public responses.

## Review and permissions

- Submitters must belong to the institution; institution content administrators may edit on their behalf.
- Institution owners and administrators can review by default. A member may receive the independent `can_review_content` capability.
- An institution may configure separate one-to-three-stage default workflows for `paper` and `degree_thesis`.
- Once a staged workflow is selected, only reviewers snapshotted into the current step may act. General review capability cannot skip steps; platform administrators retain emergency authority.
- Every change request requires a note. Saving a corrected version and resubmitting resolves the current workflow again while preserving historical step, reviewer, action, note, and time snapshots.
- Only approval of the last step updates `publishedVersionId`.
- Integration JWTs cannot submit, read drafts, or call review endpoints.

## Display and file security

- The collection lists published approved versions only and supports title or author search plus award-year, training-unit, major, and degree-category filters.
- PDF uploads use the server-controlled `thesis` purpose. Browsers cannot choose object prefixes or protection policies.
- `public` records become visible after confidentiality expires; `institution` records require membership in the institution; `restricted` records are limited to the submitter and authorized managers or reviewers.
- Anonymous readers may browse public metadata. Full-text preview and download require a user session and a fresh authorization check.
- Preview and download use short-lived access links. Each request rechecks the user, institution, review status, visibility, and confidentiality date.

## Main endpoints

- `GET /v1/theses` and `GET /v1/theses/facets`: published collection and facets.
- `GET /v1/theses/by-code/:recordCode`: resolve a stable public identifier.
- `POST /v1/theses`, `PUT /v1/theses/:id`, and `POST /v1/theses/:id/submit`: drafts, versions, and submission.
- `GET /v1/theses/mine`: submitter workspace.
- `GET /v1/theses/review-queue` and `POST /v1/theses/:id/review`: review queue and staged actions.
- `GET/PUT /v1/institutions/:slug/review-workflows/:contentType`: institution default workflows.

See the [paper review workflow](./paper-review-workflow.md) for the shared state machine, reviewer resolution, and compatibility projection used by ordinary papers.
