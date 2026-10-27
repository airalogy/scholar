# Personnel and review handbook

For library and institution administrators. Open **Personnel and review governance** from institution members to access synchronization, people and corrections, reviewer grants, and routing simulation.

## Reading review progress

Use **View review progress** in My reviews → My applications, a review task, or the administrative queue. Papers, degree theses and change requests share this page.

- **Flow / List**: stages run sequentially; all parallel approval tasks within a stage must pass. A role task is handled by one eligible reviewer, not separately by every candidate. CC recipients are listed separately and do not vote. Mobile screens default to a list; the canvas supports zoom and automatic layout.
- **Task details**: select a node for the designated reviewer, actual reviewer, assignment scope, deadline and task-specific activity. Overdue and blocked tasks never pass automatically. Only an actionable current task offers a review link.
- **Candidates and evidence**: current candidate names are administrator-only and do not mean assignment. New task/action records retain display-name snapshots. Missing legacy names are shown as not recorded, never reconstructed from today's directory. Reassignments retain the actor and new assignee names.
- **Rounds and versions**: switch rounds to inspect the actual material version, workflow and routing rule revision used at submission. New rules do not redraw previous rounds. Large task lists, round lists and histories are paginated.
- **Approval versus application**: approved does not necessarily mean applied to the repository. Administrators should resolve a failed application from the failure queue rather than re-uploading the paper.
- **Access**: submitters, relevant reviewers, the institution owner and platform administrators have scoped access. Unrelated members and integration credentials cannot read progress. This view grants no additional material, file or decision permissions; personnel suspension still blocks access.

Rule simulation reuses the diagram, explicitly marked as a simulation, without creating tasks. Use Refresh for the latest state. Unsaved rule edits never change existing rounds.

## Responsibilities

| Information or action | Owner |
| --- | --- |
| Employment/enrollment status, institutional identifiers, appointments and supervision | Institution-designated authoritative systems |
| Conversion into the Scholar contract | Institution/deployment-specific private adapter |
| Login account | Created and connected to the person on first permitted SSO sign-in |
| Reviewer grants and routing configuration | Institution owner or platform administrator |
| Material decisions | Explicitly authorized reviewers; administrative status is not approval authority |
| Temporary corrections | One administrator requests; another authorized administrator verifies and approves |

SSO does not grant review authority. People, prebound papers and reviewer appointments can exist before a login account. Do not merge people by name or email. Verify additional identifiers through the identity process; never delete and recreate a person to change their identifier. Revoked identifiers retain their ownership.

## Initial setup

1. Assign authoritative sources for personnel and organization facts. Each person has one owning source record. Aggregate multiple upstream systems and resolve authority in the private adapter, rather than letting them overwrite each other.
2. Create a directory source. Start with incremental synchronization or full synchronization without missing-record deactivation. Validate the differences before applying; validation alone does not change personnel.
3. Verify counts and relationships. Keep an independent platform recovery administrator. Apply a complete authoritative snapshot before opting into directory-only admission. Default SSO admission remains available; upgrading does not silently change policy.
4. Grant intake, department and final review authority, plus supervisor/responsible-person authority if needed. Department reviewers need a current appointment in scope. A supervision relationship alone grants no approval rights.
5. Configure a default workflow for each material type. Its last stage must include an explicit library final reviewer.
6. Publish routing rules and simulate students, PIs, people with concurrent identities, and cross-department authors. Simulation creates no tasks.
7. Complete a synthetic submission, participant verification, decisions, return and resubmission before enabling the policy for normal use.

## Personnel lifecycle

The people panel shows provenance, source/display values, identity revisions, appointments and responsible-person relationships. Multiple identities may coexist, such as doctoral student and research assistant.

Supported identity codes represent undergraduate, master's student, doctoral student, unspecified postgraduate, postdoc, faculty, staff, PI, research assistant, visitor and other. They are facts, not arbitrary labels or access privileges.

Effective intervals include their start and exclude their end. Null dates mean not provided. Recorded and superseded times separately track revisions; the system does not invent organization history from before initial import.

- Arrival: synchronize personnel and relationships; first admitted SSO sign-in creates an ordinary account.
- Identifier change: retain the person ID and verify an additional identifier.
- Transfer: update upstream appointments. New appointments do not revive revoked grants.
- Departure/graduation: synchronize status and retain historical papers, people and decisions. Returning personnel need new explicit grants.
- Unit rename: retain its identifier. A merger into a new organization uses a new identifier, ends old relationships and requires review-responsibility checks. Never rewrite publication affiliations from current employment.
- Supervisor change: synchronize the relationship, then start a new round for affected pending material when appropriate. Do not silently substitute the reviewer in an old round.

## Routing rules

A stable rule key has a new immutable version on every save. Higher priority wins. Multiple matching rules at the highest priority block routing instead of choosing arbitrarily.

Conditions include material type, request kind, author identities and publication units. Conditions use AND; values within a condition use OR. Empty identity/unit selections mean unrestricted. No match uses the institution default workflow.

Rules use **verified authors and publication units**, not the upload operator. Applicable identity/unit rules require verified participant scope. Incomplete author identity data blocks identity-based routing rather than bypassing it.

For supervisor/responsible-person stages, a route with identity conditions resolves relationships only for authors matching those identities. Without identity conditions, all verified authors are subjects. Every active responsible-person relationship produces a task. The relationship and an explicit reviewer grant are both required.

For example, an institution can configure doctoral submissions as supervisor → all publication units → library final review, with another rule for PI submissions. This is an institutional choice, not a universal hard-coded path. Multiple identities or authors can match different rules; set deliberate priorities or refine conditions.

Simulation uses **published** configuration, not unsaved edits. Choose all relevant people and verified publication units, inspect the matched rule, candidates and missing prerequisites. Actual decisions still check live authority, deadlines and self-review restrictions.

## Tasks and handover

Submitters track their applications; reviewers use **My reviews**. Already collected DOIs are detected before file upload: request a correction from the existing paper instead of overwriting it. Retries of the same unchanged form reuse the submission key.

Each round freezes material and routing evidence:

- Missing authors or publication units: correct bindings, verify the complete scope and begin a new round.
- Reviewer leaves or transfers: explicitly authorize a qualified replacement; role tasks may be reassigned within their frozen responsibility scope with an audit note.
- Responsible-person relationships, responsibility scope or rules change: provide a reason and **start a new round with current rules**. Previous decisions remain historical and are not inherited.
- Routing conflict: publish corrected rules and restart the round. Reassignment cannot bypass a routing exception.
- Self-review: a submitter cannot approve their own role task. Personal author confirmation is separate from final approval.
- External inbox failure: retry notification. Delivery neither approves nor publishes material.

## Correcting bad data

Fix the owner first: upstream factual mistakes in the institution system; transformation mistakes in the private adapter; Scholar bugs in Scholar followed by controlled reconciliation; local grants and rules in Scholar.

Two temporary corrections are available:

| Type | Boundary |
| --- | --- |
| Display name | Up to 30 days; retain source name and never change identifiers/account ownership |
| Temporary login permission | Up to 7 days for an incorrectly inactive source status; does not bypass directory/appointment policy, lift manual suspension, or grant/restore reviewer authority |

An independent administrator must approve. Administrators cannot request or approve corrections for their own linked identity. Record a verification reference, not passwords, identity-document numbers or unrelated personal details. If the source changes before approval, request against the new baseline.

Synchronization keeps ingesting upstream values. A matching source correction resolves the exception; a different conflicting value stops it. Login exceptions expire immediately during authorization checks. Display-name restoration runs in the background, normally within 30 seconds, or on administrator inspection. Exceptions can be revoked early. No account is deleted and no old grant is restored.

Identifier reassignment, account replacement, person merging, source appointment editing and arbitrary field overrides are not available here; use dedicated verification or upstream repair.

## Synchronization incidents and handover

Failure, timeout or empty output does not mean everyone has left. Never clear personnel to make a sync succeed. Mass deactivation requires completeness checks and manual confirmation. See the [personnel synchronization contract](/en/integration/personnel-sync).

Record source owners, private adapter location, last successful synchronization, failed/pending batches, current reviewer grants, rule versions and simulation checks, unfinished tasks, expiring corrections, recovery administrators, backup and upgrade owners. Actual personnel lists, secrets and institution deployment settings belong in private handover material.
