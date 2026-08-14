# Content Governance and Review Rules

English | [简体中文](../zh/content-governance.md)

This document explains the design of laboratory-page maintenance, paper review, role boundaries, membership provisioning, and content state transitions in Airalogy Scholar.

See the [paper review workflow](./paper-review-workflow.md) for the detailed state machine and public-display rules.

## Motivation

Scholarly metadata is error-prone: author names may be misspelled, affiliations misassigned, DOI or publication details incorrect, and representative papers linked to the wrong laboratory. Unconfirmed data must not flow directly into public search, recommendations, and profile pages.

Institutions also need member-level reporting and presentation without rewriting global authorship facts. Airalogy Scholar therefore separates global paper facts, institution claims, content review, and institution-scoped member-author bindings.

## Core principles

### 1. Upload first, publish only after review

- Users can upload and edit papers.
- Submission enters the review workflow, normally as `pending_review`.
- Only approval admits the institution claim to the public library and search.
- A change request remains visible to the submitter with reviewer notes and may be resubmitted.

### 2. Laboratory pages use institution and laboratory authority

- A platform scholar cannot edit an arbitrary laboratory page.
- Authorized institution and laboratory roles maintain the page.
- Platform administrators retain emergency authority.

### 3. Editable page content is distinct from referenced facts

Editable laboratory content includes the introduction, contact information, website, layout, ordering, and selected representative papers. Referenced content includes member profiles, paper metadata, and scholar cards. A laboratory chooses what to present but cannot mutate the underlying person or paper facts through page editing.

### 4. Administrators provision identities, not passwords

- An institution may pre-provision members before launch using an institution email, employee or student identifier, college, and laboratory information.
- If the person already has an Airalogy Scholar account, the provision attaches the existing `user`.
- Otherwise it remains `pending_activation` until the person completes first-login activation.
- Administrators assign institution identity and permission but do not create or retain member passwords.
- Institution SSO may use JIT provisioning, but the first successful SSO login grants only `member` by default.

This preserves bulk onboarding, one account per person, future SSO protocol support, and a strict separation between authentication and elevated authorization. See [institution authentication](./institution-auth.md).

### 5. Member-paper bindings are institution-scoped

- An authorized administrator may bind an institution member to one author of a paper in that institution's library.
- Bindings support institution reporting and member presentation only.
- They do not rewrite `papers` or `paper_authors`, merge global identities, or import all historical papers associated with a user.
- Counts remain bounded by the institution's claims and review status.

## Role model

### Platform roles

- `platform_admin`: manage all institutions and laboratories, member permissions, and paper reviews.
- `member`: ordinary platform account.

### Institution roles

- `owner`: edit institution content, manage all institution roles, and review institution claims.
- `admin`: edit institution content, manage `admin/member` relationships, and review institution claims; cannot create, change, or remove an `owner`.
- `member`: no institution administration or review capability by default. Independent capabilities such as `can_review_content` and `can_import_data` may be delegated explicitly.

### Laboratory roles

- `owner`: edit the laboratory page, manage laboratory roles, and review laboratory claims.
- `admin`: edit the page and review laboratory claims; does not manage member permissions by default.
- `member`: no page editing or review capability by default.

## Data relationships

- `users`: platform accounts and base profiles.
- `institutions`: institution entities.
- `institution_memberships`: institution membership, role, and delegated capabilities.
- `institution_user_provisions`: administrator provisioning, activation state, and activation tokens.
- `labs`: laboratory pages owned by an institution.
- `lab_memberships`: laboratory membership and role.
- `papers`: globally unique paper facts.
- `paper_submissions`: upload event, submitter, scope, file, and metadata snapshot.
- `paper_claims`: an institution or laboratory claim, its review case, and display scope.
- `institution_paper_author_bindings`: an institution-scoped mapping from a member to an author on a paper in that institution's library.

A user may simultaneously be a scholar, institution owner or administrator, laboratory owner or administrator, and a reviewer. These relationships are explicit and independent.

## Paper review flow

### States

- `draft`: editable and not submitted.
- `pending_review`: submitted and waiting for the first or current review step.
- `changes_requested`: returned to the submitter with required corrections.
- `approved`: accepted for public display.
- `archived`: closed to further submission.

### Flow

1. A user uploads a paper and the service stores the paper and extracted metadata.
2. Every v3 claim is assigned to an institution.
3. Institution owners and administrators can review matching institution claims.
4. Laboratory owners and administrators can also review a claim assigned to their laboratory.
5. An institution organization workflow may narrow the active reviewer to the users snapshotted into its current step.
6. Approval admits the claim to the public library.
7. A change request keeps the submission and reviewer notes in the submitter workspace.
8. Editing and resubmission returns the claim to `pending_review`.
9. Previously public changed content remains outside public display until reapproval.

## Laboratory-page permissions

### Page editing

- `platform_admin`
- owner or administrator of the owning institution
- owner or administrator of the laboratory

### Laboratory membership management

- `platform_admin`
- owner of the owning institution
- owner of the laboratory

### Removing a departing institution member

- Remove the `institution_memberships` relationship to revoke institution-private access.
- Cascade removal of laboratory memberships under that institution.
- Remove institution-scoped member-author bindings.
- Transfer ownership before removing the last owner of a laboratory.
- Retain the global account unless the separate account-deletion process applies.

### Paper review

- `platform_admin`
- owner or administrator of the claim's institution
- owner or administrator of the claim's laboratory
- current reviewers resolved by the institution workflow

## API conventions

### Activation

- `GET /auth/institution-provisions/:token`: validate an activation token and return a safe provision preview.
- `POST /auth/institution-provisions/activate`: bind an existing account or create and bind a new account during first activation.

### Laboratories

- `GET /labs/:slug`: public laboratory details plus the current viewer's capability summary.
- `PUT /labs/:slug`: update authorized page content.
- `GET /labs/:slug/memberships`: protected membership administration.
- `POST /labs/:slug/memberships`: create or update a laboratory membership.
- `DELETE /labs/:slug/memberships/:userId`: remove a membership.

### Papers

- `POST /papers/create`: upload a paper with optional `institution_id`, `lab_id`, and `review_node_id`.
- `GET /papers/review-queue`: claims in the current account's review scope.
- `POST /papers/claims/:id/review`: act on the current review step.

### Institution member-author bindings

- `POST /institutions/:slug/paper-author-bindings`: bind a member to an author on a paper in the institution library.
- `DELETE /institutions/:slug/paper-author-bindings/:bindingId`: remove a binding.

Only accounts with institution member-management permission may bind or unbind. A paper must already belong to the institution library. Within one institution and paper, one author maps to at most one member and one member maps to at most one author.

## Current implementation choices

- Anonymous and authenticated public discovery selects `approved` claims only.
- Public search and laboratory representative-paper lists use the same approval boundary.
- Authorization combines `platform_role`, institution membership, laboratory membership, and workflow step snapshots.
- Institutions and laboratories share one layered capability model.
- `papers` stores global facts; `paper_claims` and the shared review case store institution ownership and approval.
- `institution_user_provisions` stores pre-provisioned, pending-activation, and linked states.
- `institution_paper_author_bindings` stores institution presentation and reporting relationships without changing global authorship.
- Member counts include only institution-scoped bindings; approved counts additionally require that institution's claim to be approved.

These choices establish a quality threshold for public information, prevent unrelated accounts from editing laboratory pages, and leave the role system extensible for future administrative capabilities.
