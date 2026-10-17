# Admin Console

Scholar provides layered administration in the same product. After sign-in, the application retrieves the current access summary from the server and shows only the tools and institutions assigned to that account.

## Administration levels

### Platform console

Platform administrators can manage the global subject catalog, user feedback, cross-institution review queues, and administration entry points for every institution.

### Institution console

Institution owners and administrators can manage institution content, member permissions, subject mappings, labs, and review work. An ordinary member receives only capabilities delegated explicitly:

- `can_review_content`: process content review for the member's institution.
- `can_import_data`: import paper and scholar data into the member's institution.

These capabilities are independent from each other and do not grant member administration or system-credential management access. `can_review_content` applies to legacy workflows only; opting into governed review requires the explicit grants below, even for owners or platform administrators.

## Institution identity verification

Institution owners and platform administrators can review **Identity verification requests** and manage **Institution identifiers** on the institution Members page. This permission is not included in ordinary administrator, import, or content-review access.

When school sign-in succeeds but the new student/employee ID conflicts with an existing account, the sign-in page offers **Request identity verification**. Applicants provide their prior ID, an explanation, and a declaration that the account is theirs. A request does not grant access to that account. They can check the result by signing in with the institution again; an expired verification session does not delete the request.

Verify the change against authoritative institution records, explicitly select the existing person, and record the verification basis. Matching names or email addresses are not enough. You can approve, decline, or ask for more information. Keep private evidence in the verification notes; the separate applicant message is visible to the applicant. Do not request passwords or sensitive identity-document uploads.

Approval makes the new ID sign in to the same account, preserving its papers, profile, and permissions. Administrators can also add a verified ID directly. Revoked IDs remain reserved to the original person. Restoring one requires fresh verification. An administrator's own additional ID must be verified by another authorized administrator.

Revocation immediately invalidates new SSO sessions bound to that ID. Older sessions created before this feature and password sign-ins retain their original expiry; this is not an account-wide sign-out.

## People and review governance

Institution owners and platform administrators open **People and review governance** from Members. Configure personnel facts, admission and review authority separately:

1. Create a directory source; import a small standard JSON sample and inspect the baseline, incoming rows, errors and counts. Validation does not change personnel. Confirm application separately. The browser accepts a JSON **array** of standard rows; the scheduled client accepts the manifest described in the integration guide.
2. Keep the default SSO admission policy during onboarding. To enable **Active personnel directory only**, first apply a complete authoritative snapshot and configure an independent platform recovery administrator. Optionally require a current appointment. Existing configured reviewer roles must still have eligible reviewers under the proposed policy; otherwise the switch is rejected. A manually created person alone does not satisfy directory admission. Unknown SSO identities receive only a limited verification request, not an ordinary account/session. Correct the authoritative directory record before approving admission; the first subsequent sign-in creates a normal member account.
3. Grant library intake, department or library final review explicitly. A person may receive a grant before ever signing in. Department grants require a current appointment in that unit. Dates and personnel status are checked again at decision time. School authentication, import rights, names and email matches never confer approval rights.
4. Configure paper and degree-thesis workflows independently, e.g. intake → all institution authors and all publication departments in parallel → library final review. Each author must confirm; one currently eligible representative satisfies each department task. CC is informational. A final library reviewer is mandatory; submitters cannot perform their own role-based review.
5. Verify all institution author bindings and **publication-time** department scope for each material version. Current employment is not proof of the paper's historic affiliations. Missing scope/reviewers creates an exception, never an automatic approval. Confirming corrected participant scope starts a fresh round; existing approvals do not carry over. Author confirmation cannot be delegated to another person.

Personnel sync cannot set roles or permissions. Incremental omissions retain existing records. Only a complete authoritative full snapshot with explicit missing-record deactivation enabled may end omitted people and appointments. Large personnel deactivations or grant losses require human confirmation and a reason. A source cannot take over another source's person. Manual suspension remains effective across later syncs.

Departures/suspension immediately block existing ordinary sessions and file access, revoke grants and remove elevated membership permissions. Returning does not restore them. An ended appointment cannot regain its old scoped grant; unrelated valid appointments remain usable. The independent platform administrator remains available for recovery. Publicly accessible pages remain public.

## Personal tasks and proposals

**My reviews** shows personal tasks and applications. Open the frozen material/version and PDF before approving. Request changes with a reason, reject and close, or withdraw your own pending application; these are different audited outcomes. Re-submission creates a new round. Old decisions remain historical and cannot approve a replacement file.

On eligible published paper/thesis pages, request metadata corrections, your own paper-author binding/unbinding, full-text restrictions, or institutional withdrawal/restoration. Published content stays unchanged until approval and execution. Withdrawal does not delete the global paper. Restoration is available only for an actually withdrawn published record, not a rejected submission. Failed effects are visible to administrators; check the cause before retrying. Changed source data requires a fresh proposal.

When governed review is enabled, uploading the same paper again cannot replace an already published or archived claim; use a change request. Only the original submitter can replace a pending submission. File replacement for an already published ordinary paper is not part of the first change-request contract.

Notification failures do not undo an approval or cause publication. Administrators can retry failed deliveries and reconcile task states. External inbox links return to Scholar; all decisions are made here by authenticated, currently authorized people.

## Access and security

Browser menus and route checks provide a clear user experience. Every server API still enforces the actual authorization boundary independently. When an account lacks a required capability, Scholar displays a restricted-access page and does not expose administration data from another institution.

## Data import

For browser-based CSV upload and import history, read [Admin Console Import](/en/administration/data-import). For automated institution-system synchronization, read the [Integration Overview](/en/integration/).
