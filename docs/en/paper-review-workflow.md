# Platform Content Review and Paper Review

English | [简体中文](../zh/paper-review-workflow.md)

This document describes the shared Airalogy Scholar content-review engine and how ordinary papers use it for submission, review, publication, revisions, and audit history. Degree-thesis fields and pages are described in the [degree-thesis workflow](./degree-thesis-workflow.md).

## Motivation

Uploaded scholarly metadata can contain misspelled names, incorrect affiliations, wrong journal or year information, invalid DOI values, and revisions that diverge from an already published record. Publishing unverified metadata would propagate errors through search, recommendations, bookmarks, and laboratory pages. Airalogy Scholar therefore follows a submit, review, then publish model.

## Core principles

### 1. Submission does not imply publication

- Users may upload a paper and work on a draft.
- Submission enters the review workflow.
- Only an approved institution claim enters the public library, search results, and representative-paper displays.

### 2. Public surfaces show confirmed content only

- Public pages select `approved` claims.
- Draft, pending, rejected, or change-requested claims do not appear in anonymous or authenticated public discovery.
- Editing a published paper removes the changed claim from public display until approval completes again.

### 3. Review authority is resolved from explicit scope

- `platform_admin` can review every paper.
- Institution `owner/admin` roles can review claims whose `institutionId` matches their institution.
- Laboratory `owner/admin` roles can review claims whose `labId` matches their laboratory.
- When a claim has `reviewNodeId` and the institution has a workflow, only users resolved into the current step may review that step.
- Every v3 paper claim belongs to an institution.

### 4. Member-paper bindings support presentation and reporting only

- Institution administrators may bind a member to one author of a paper in that institution's library.
- The relationship is institution-scoped operational data, not a global authorship merge.
- A binding never bypasses review or publishes an unapproved paper.
- Member paper lists and counts remain bounded by the institution's own claims.

### 5. Business data is separate; the review engine is shared

- `papers` and `paper_claims` represent DOI, journal, authorship, and institution claims for ordinary papers.
- `degree_theses` and `degree_thesis_versions` represent student identifiers, training units, degree categories, versions, and full text.
- Both use `content_review_cases`, `content_review_step_instances`, and `content_review_actions` for submission, staged approval, change requests, resubmission, and audit history.
- Review scope, current step, status, and action history come from the shared review tables.

## Visibility rules

- Anonymous visitors and signed-in users may browse approved public papers and public metadata.
- A submitter's personal workspace shows all of that user's `paper_submissions` and review states.
- Review queues show only `paper_claims` within the current user's review scope.
- Institution administration exposes member-paper bindings and institution-scoped counts only to authorized accounts.
- Non-approved paper details are limited to the submitter, current reviewers, and platform administrators.
- Protected files require a signed-in user and a fresh server authorization check; anonymous responses contain no protected access link or private author email.

## Institution member statistics

- `paperCount` counts papers explicitly bound to the member within the institution.
- `approvedPaperCount` counts those bound papers whose claim for that institution is `approved`.
- Joining an institution does not import all papers associated with the user's platform account.
- The same paper may be independently claimed, bound, and reviewed by multiple institutions.

## State machine

The shared states are:

- `draft`: editable and not submitted.
- `pending_review`: submitted and waiting for the current review step.
- `changes_requested`: a reviewer requested corrections.
- `approved`: every required step has approved the version.
- `archived`: closed and no longer accepts submission.

Each submission snapshots the selected one-to-three-stage workflow and reviewers. Later workflow edits never rewrite completed or active history.

For an ordinary paper, submission creates or reuses a global `papers` record by DOI, creates `paper_submissions`, creates or refreshes `paper_claims`, and creates the matching `content_review_cases` with step snapshots. The review case is the source of truth; `papers` and `paper_claims` do not independently own review state.

## Transitions

1. An unsubmitted editable version begins as `draft`.
2. Submission moves the case to `pending_review`.
3. Approval advances to the next step; approval of the last step moves the case to `approved`.
4. A change request requires a note and moves the case to `changes_requested`.
5. A corrected resubmission resolves and snapshots the workflow again, then returns to `pending_review`.
6. The content remains outside public discovery until the new review completes.
7. Claims by different institutions advance independently.

## Institution organization workflows

Institutions can maintain organization nodes, edges, positions, appointments, and workflow templates. Uploads may include `review_node_id`. When a workflow matches, the service snapshots its resolved users into `content_review_step_instances`; intermediate approval advances one step, final approval publishes, and any change request returns the whole case for correction.

Platform administrators and institution owners or administrators configure separate defaults for `paper` and `degree_thesis` through `PUT /v1/institutions/:slug/review-workflows/:contentType`.

See [institution organization structure and review workflows](./institution-org-structure.md) for the snapshot schema and resolver rules.

## Why review precedes publication

An unreviewed label does not prevent incorrect content from being searched, bookmarked, cited, or propagated. A trustworthy academic discovery product needs a publication threshold, so review is a precondition for public display rather than a warning added afterward.

## API and frontend constraints

- Public `GET /papers` and `GET /papers/search` results contain approved claims only.
- `GET /papers/review-queue` is restricted to reviewable claims.
- `POST /papers/claims/:id/review` accepts only a claim waiting for review by the current user.
- `POST /papers/create` and `PUT /papers/:id` may accept `review_node_id`.
- Editing published content starts a new review instead of retaining public approval.
- Member-author binding controls must enforce institution member-management permission.
- Institution pages must distinguish bound-paper and approved-paper counts.
- New content domains must call the shared review service rather than mutate review steps or history in their routes.

## Related documentation

- [Content governance and role boundaries](./content-governance.md)
- [Institution organization structure and review workflows](./institution-org-structure.md)
- [API architecture](./api.md)
- [Web architecture](./web.md)
