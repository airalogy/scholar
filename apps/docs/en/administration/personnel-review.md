# Personnel and review handbook

For library staff, institution administrators and reviewers. This handbook explains responsibilities, where to act and what to watch for; no knowledge of code or system internals is needed. Administrators open **People and review governance** from institution members to access synchronization, people and corrections, reviewer grants, and routing simulation.

Authors and reviewers can start with the responsibilities below, [Tasks and handover](#tasks-and-handover) and [Reading review progress](#reading-review-progress). Administrators responsible for people and workflows can then follow the configuration steps.

The explicit reviewer grants, conditional paths and review rounds in this handbook belong to the new **People and review governance** workflow. Activation is separate for each material type: saving the new default for papers does not also enable it for degree theses. Types without an enabled new default retain the previous workflow. Previous content-review permission does not replace explicit grants in the new workflow. See the [administration console](/en/administration/) for management permissions.

## Library final review: responsibilities and boundaries

### Why the library performs final review

Where the library leads the institution's repository service, it is a suitable final reviewer before formal inclusion. This responsibility follows the institution's agreed collection policy, not automatic authority from maintaining the software. The following division of work is recommended; the institution's approved policy determines the specific checks:

- Authors confirm their work, authorship and the accuracy of submitted information.
- Supervisors, responsible people and academic units follow the configured workflow to verify relevant people, affiliations and matters within their responsibility.
- Library final reviewers consider earlier decisions and check titles, authors, publication details, completeness, duplicate records and full-text access settings before approving inclusion or the proposed change. This does not replace any separate academic, degree or other specialist review required by the institution.
- System administrators keep the service running and provide technical support. Participation in business review still requires the relevant explicit grant. Neither library employment nor system administration rights automatically confer final-review authority.

### What “going to the library” means

After the required review and successful inclusion, the work becomes part of the institution's Scholar repository managed by the library. It is not transferred into a library employee's personal account, and library final review alone does not change authorship or existing account links. Changes such as author corrections still follow the specific approved request.

Distinguish three outcomes:

- **Review approved**: the required reviews are complete and the inclusion or change has been approved.
- **Inclusion or change applied**: the system has successfully carried out that decision. If execution fails, an administrator must resolve the failed task; “approved” alone does not prove completion.
- **Full text accessible**: reading or downloading still depends on the material's access settings and the current user's permissions. Approval does not make full text public to everyone or give reviewers access to unrelated material.

This workflow covers repository inclusion and related changes. Chat history, account links, primary institutional identifiers and personnel permissions are not part of final review; they remain managed through their respective functions.

### Current scope

Every enabled new workflow, whether a default or conditional path, must include **Library final review** in its last stage. This is a required step, not a removable default selection. An explicitly authorized and currently eligible person must perform it; author confirmation is not a substitute.

If another institution assigns final repository decisions to a research administration office or another department, agree on responsibilities and assess the necessary adaptation before use. The current page does not offer a setting to switch the final-review department. Renaming a stage does not change the required permissions.

## Where permissions live and how SSO relates to them

### What Scholar stores locally

The institution's single sign-on (SSO) service confirms who you are. Scholar keeps accounts, personnel records, employee or student identifier links, membership permissions, reviewer grants and review history to determine what you may do. Personnel information can be synchronized from institution systems, but this does not automatically bring across all permissions from those systems.

| Information | Authority or maintainer | Local record and maintenance entry point |
| --- | --- | --- |
| SSO login identity | Institution single sign-on service | The verified employee or student identifier locates the person's record and Scholar account |
| Employment/enrollment status, institutional identifiers, identities, appointments and supervision/responsibility relationships | Institution-designated authoritative sources, such as HR and student records | **Personnel directory** updates records in Scholar; **People and corrections** shows sources, current values and history; identifier ownership changes require identity verification |
| Membership roles and management capabilities | Scholar administrators with the relevant authority | Maintained on the institution members page; management capabilities are not reviewer grants for the new workflow |
| Reviewer roles, unit scopes, validity and revocations | Institution owner or platform administrator | Explicitly granted or revoked in **People and review governance → Review permissions and workflows**, and stored in Scholar |
| Default workflows, conditional rules, review tasks and history | Authorized configuration administrators and actual reviewers | Configured in **Review permissions and workflows** and **Review routing and simulation**; Scholar retains each rule version, each round's material and activity |

For incorrect institution personnel information, ask the responsible department to correct the original record, then synchronize it into Scholar. Correct Scholar authorization errors in Scholar. Personnel synchronization cannot grant membership management capabilities or reviewer authority, or restore revoked grants. Temporary factual corrections require one administrator to request and another authorized administrator to verify; see **Correcting bad data** below for limits.

### What an SSO sign-in does and does not do

1. The institution service verifies the sign-in identity; Scholar uses the verified employee or student identifier to find the person's record and account.
2. An existing link uses the existing account. An ordinary member account is created only when sign-in eligibility requirements are met and a new account is needed. Identity conflicts or failure to meet the institution's personnel-list requirements need verification, not automatic merging by name or email.
3. Scholar determines available features from local permissions and current personnel status. Each approval also checks task status, reviewer role, unit scope, validity, applicable appointments or relationships, and self-review restrictions.

**Successful SSO authentication grants no review authority and does not mean the institution's full personnel list has been synchronized.** Sign-in does not reset existing membership permissions to ordinary membership, nor grant or restore reviewer authority automatically. People, linked papers and reviewer grants can exist before first sign-in; the account is linked later without recreating the person or duplicating the grant.

Matching names or email addresses do not cause people to be merged automatically. Verify additional identifiers through the identity process; never delete and recreate a person to change their identifier. Revoked identifiers retain their ownership and cannot be reassigned by synchronization.

## Granting or revoking review authority

Open **Institution members → People and review governance → Review permissions and workflows**. Only the institution owner or a platform administrator may configure these reviewer grants and workflows. Ordinary institution administrators, import operators and members with only previous content-review permission do not receive this configuration authority. Administrator appointment is covered separately in [administrator authorization and emergency recovery](/en/administration/administrator-governance).

1. Use **Find by name or institutional ID**, then select the correct record in **Person**. If it is missing, check the personnel source or identifier link rather than creating a duplicate with the same name.
2. Choose **Review role**: Library intake, Department review, Library final review, Supervisor reviewer or Responsible-person reviewer.
3. Choose **Unit scope**. Department review requires a specific unit and a valid appointment there. Library intake and final reviewers for the default workflow use **Institution-wide** scope. Supervisor/responsible-person grants also use institution-wide scope; active relationships further limit which people's material they can review.
4. Set **Expires (optional)** if needed, provide the required change reason, and click **Grant review authority**. The current web form starts the grant at submission time. An empty expiry means no fixed end date, not exemption from personnel-status or appointment checks.
5. Check the person and role in the grant list. **Account linked / Not yet signed in** describes account linkage, not permanent eligibility or an existing task. To revoke a grant, click **Revoke** on that record, provide a reason, then **Confirm revocation**.

The recipient must be active and currently admitted; a temporary login exception cannot be used to obtain reviewer authority. A configuration administrator who also makes role-based decisions still needs an explicit reviewer grant. Personal author confirmation is a different task: authors do not need a library or department role merely to confirm their own authorship, and author confirmation never replaces final review.

## Initial setup

1. Agree which source is authoritative for personnel, enrollment and organization information. Each person's record has one designated source. If several institution systems are involved, ask the responsible departments and integration team to agree on ownership first, so competing sources do not overwrite the same person.
2. Create a directory source. Start by importing only changed records. If importing a complete list, initially turn off missing-record deactivation to avoid suspending people merely absent from that list. Check counts and differences; validation alone does not change personnel, and changes take effect only when applied.
3. Check people and units against institution records. Keep an independent emergency administrator. Verify and successfully synchronize the complete personnel list before deciding whether only people active on that list may sign in. Default SSO admission remains available; upgrading does not silently change policy.
4. In **Review permissions and workflows**, grant intake, department and final review authority, plus supervisor/responsible-person authority if needed. Department reviewers need a current appointment in scope. A supervision relationship alone grants no approval rights.
5. Configure a default workflow for each material type. Its last stage must include an explicit library final reviewer.
6. Publish routing rules and simulate students, PIs, people with concurrent identities, and cross-department authors. Simulation creates no tasks.
7. First complete a synthetic submission, participant verification, decisions, return and resubmission in a test environment, then configure production according to the institution-approved policy. Saving a default workflow or publishing an enabled rule affects subsequent submissions; there is no additional global activation step.

## Personnel lifecycle

The people panel shows where information came from, the source and displayed information, identity history, appointments and responsible-person relationships. Multiple identities may coexist, such as doctoral student and research assistant.

Available identities include undergraduate, master's student, doctoral student, unspecified postgraduate, postdoc, faculty, staff, PI, research assistant, visitor and other. They describe a person's status, not arbitrary labels, and do not directly grant access or review authority.

Identities, appointments and relationships take effect at their recorded start time and cease at their end time. An empty date means the source did not provide it. Changes are retained in history; the system does not fill in unprovided organization history from before the first synchronization.

- Arrival: synchronize personnel and relationships. At first SSO sign-in, an ordinary account is created only for an eligible person without a linked account; an existing linked account is reused.
- Employee or student identifier change: retain the original person record and verify an additional identifier; do not delete and recreate the person.
- Transfer: update appointments in the institution's source records. New appointments do not revive revoked grants.
- Departure/graduation: synchronize status, retain historical papers, people and decisions, and revoke elevated permissions. Returning personnel need new explicit grants.
- Unit rename: retain the existing unit record. A merger into a new organization needs a new unit record, an end to old relationships and review-responsibility checks. Never rewrite publication affiliations from current employment.
- Supervisor change: synchronize the relationship, then start a new round for affected pending material when appropriate. Do not silently substitute the reviewer in an old round.

## Configuring review paths

Review paths follow institution policy. Signing in with SSO does not decide them, nor are they guessed from identifier prefixes. Administrators fill in and save Scholar's web forms; routine adjustments need no coding or system update. The flow diagram displays progress or simulation results and cannot be dragged to change the workflow.

### Step 1: Configure the material type's default workflow

First verify personnel, appointments and required relationships, and explicitly authorize intake, final and relevant unit reviewers.

1. Open **Review permissions and workflows** and locate **Versioned workflow**.
2. Choose **Paper** or **Degree thesis** under **Content type**, then enter the **Workflow name**. Configure and save each type separately.
3. Configure 1–10 stages in displayed order. Give each stage a name, a deadline of 1–8760 hours and review groups. Use **Add stage / Remove stage** to change the number of stages.
4. The default form currently offers library intake, each verified institution author, each verified publication department and library final review. Configure supervisor/responsible-person stages in conditional rules in the next step. The last stage must include library final review.
5. For CC notices, first load people using the search above the workflow form, then select recipients in the relevant stage. CC recipients do not vote.
6. Verify the settings and click **Use for future submissions**. Initially displayed example stages do not mean the workflow is enabled. **A successful save enables or updates that material type's new default workflow.** If active reviewer grants are missing, configure them first; an empty review group cannot bypass approval.

Stages run sequentially; every approval task generated within a stage must pass. Author confirmation creates tasks for each verified author; publication-unit review creates tasks for each verified unit. A role task needs one eligible reviewer to decide, not separate decisions from every candidate.

### Step 2: Add policy-based conditional paths (optional)

A default workflow is enough if all materials of that type follow the same path. To vary paths by author identity or unit, save that type's new default workflow first, then open **People and review governance → Review routing and simulation**:

1. Click **New rule** and enter the **Stable rule key** and **Rule name**. The key distinguishes one rule from another; it is not code to write. Use the fictional example below as a guide. It accepts lowercase letters, digits, underscores or hyphens, starts with a letter or digit, and contains at most 64 characters. Editing an existing rule does not change its key.
2. Choose **Material type** and one or more **Request kinds**: New submission, Metadata correction, Author binding or unbinding, Full-text access change, Bibliographic import correction, or Institution withdrawal or restoration.
3. Select **Author identities** and **Publication units** as needed, and enter **Priority** (0–10000; larger numbers take precedence). Empty identity/unit selections mean unrestricted, not prohibited.
4. Configure stage names, review groups and deadlines. Conditional paths also offer **Supervisors (explicit grants required)** and **Responsible people (explicit grants required)**. The last stage must still include library final review.
5. Check the **Enabled** setting, provide a change reason, and click **Publish a new rule version**. The latest enabled version participates in subsequent matching; a disabled version does not. Publishing a disabled replacement deactivates the preceding version of that rule; it is not a draft that leaves the preceding version active.
6. Check the version and enabled/disabled state under **Rule versions**. To change it, edit the current version and publish again; earlier records are retained. If another administrator has changed the rule, reload and reconcile before saving.

Here, publishing means making a review-rule configuration effective, not releasing software or directly publishing a paper.

### Matching facts and handling conflicts

Each publication creates a new version of the same rule and retains the earlier record. Only the latest enabled rules for the material type are considered. Higher priority wins. If several rules match at the highest priority, processing stops for an administrator to resolve the conflict rather than choosing arbitrarily.

Conditions include material type, request kind, author identities and publication units. All configured conditions must be met, but matching any selected value within each condition is enough. Empty identity/unit selections mean unrestricted. If no rule matches, the institution's default workflow is used.

Rules use **verified authors and publication units**, not the upload operator or only the first author. Author identities use the active records in Scholar when the path is selected; publication units use the material's verified affiliations, not current appointments. A unit condition selects a path; it does not restrict **All publication units** review to only the unit that matched the condition.

When identity/unit rules apply, authors and publication units must be verified first. Missing author identity information also stops identity-based selection rather than bypassing review. These problems require attention; the system does not treat them as “no matching rule” and switch to the default path.

For supervisor/responsible-person stages, a rule with identity conditions looks for those relationships only for authors matching the selected identities. Without identity conditions, all verified authors are included. Every active responsible-person relationship produces a task. The relationship and an explicit reviewer grant are both required.

### Step 3: Simulate and validate

1. In **Simulate** on the same page, find and add all institution authors involved in the material, not just the submitter.
2. Choose the material type, request kind and all verified publication units, then click **Simulate**.
3. Inspect the selected rule or default workflow, stages, candidate reviewers and missing prerequisites. Simulation only reads **published** configuration; unsaved edits are excluded and no actual tasks are created.
4. In a test environment, cover the normal path, missing reviewers, incomplete identities, concurrent-identity conflicts, cross-unit authors and self-review, then complete a round with a synthetic material. Candidates are not guaranteed approval authority: actual decisions recheck current permissions, deadlines and self-review restrictions.

A rule published in production can already affect subsequent submissions. Simulation is not a pre-publication draft preview and provides no extra activation confirmation. Validate the policy in a test environment first.

### Fictional configuration example

**Example University**, **Example School** and all people below are fictional, solely for test-environment explanation. They represent no real institution policy or personnel list, and use no real institutional identifiers.

- Prerequisites: an active relationship between Example Doctoral Student and Example Supervisor has been synchronized. Example Supervisor has an institution-wide supervisor grant; Example Unit Reviewer has a valid appointment and department-review grant for Example School; Example Final Reviewer has an institution-wide library-final grant. The new default workflow for degree theses has been saved.
- Rule: enter demo_doctoral_submission for **Stable rule key** and **Example doctoral thesis review** for **Rule name**; choose material type **Degree thesis**, request kind **New submission**, author identity **Doctoral student**, publication unit **Example School**, priority 200, and check **Enabled**.
- Stages: supervisor review → all publication units → library final review, each with a 168-hour deadline. Provide a test-configuration reason and publish.
- Expected result: verified doctoral material including Example School selects this path if no higher-priority rule matches and no equal-priority conflict exists. Another material with complete facts but without matching conditions uses the default. Any additional publication units also need eligible reviewers.

PI material may use another conditional rule. Concurrent identities or multiple authors can match multiple rules; deliberately set priorities or refine conditions rather than treating this example as a universal policy.

## When changes take effect and what stays unchanged

- **Unsaved edits** do not alter effective configuration, existing tasks or simulation results. Viewing the page does not enable a workflow.
- **Saving a default or publishing a conditional rule** affects subsequent submissions and explicit new rounds using current rules. It does not redraw existing rounds or re-review completed material. Disabling a conditional rule makes subsequent matching use other active rules or the default; it does not disable the whole new review workflow.
- **To reroute existing material**, verify its version, authors, publication units and impact, provide a reason in the administrative task queue, and choose **Start a new round with current rules**. Earlier rounds and activity remain historical; the new round requires fresh decisions, not inherited approvals.
- **Revocation, expiry or lost eligibility** is checked at every decision. Having received a task earlier does not let someone continue approving after losing authority; completed review history remains. Adding a grant does not automatically resolve an exception task: inspect it and reassign or start a new round as appropriate for its type.
- **Accounts and historical data** are separate: review settings are not the place to link accounts, change a primary institutional identifier or link a paper to a different author. Configuration requires no person deletion, account recreation or history clearing. Account links, primary-identifier rules and historical data continue to be managed as before.

## Tasks and handover

Submitters track their applications; reviewers use **My reviews**. An existing paper with the same DOI (its unique publication identifier) is detected before file upload: request a correction from that paper instead of overwriting it. If a network problem requires retrying the same unchanged form, the system avoids creating duplicate material versions.

Each review round keeps the submitted material and selected path unchanged. Check the current material version before resolving a problem:

- Missing authors or publication units: correct bindings, verify the complete scope and begin a new round.
- Reviewer leaves or transfers: explicitly authorize a qualified replacement; role tasks may be reassigned within the same responsibility scope, with a record of the change.
- Responsible-person relationships, responsibility scope or rules change: provide a reason and **start a new round with current rules**. Previous decisions remain historical and are not inherited.
- Routing conflict: publish corrected rules and restart the round. Reassignment cannot bypass a routing exception.
- Self-review: a submitter cannot approve their own role task. Personal author confirmation is separate from final approval.
- External inbox failure: retry notification. Delivery neither approves nor publishes material.

## Reading review progress

Use **View review progress** in My reviews → My applications, a review task, or the administrative queue. Papers, degree theses and change requests share this page.

- **Flow / List**: stages run sequentially; all parallel approval tasks within a stage must pass. A role task is handled by one eligible reviewer, not separately by every candidate. CC recipients are listed separately and do not vote. Mobile screens default to a list; the canvas supports zoom and automatic layout.
- **Task details**: select a node for the designated reviewer, actual reviewer, assignment scope, deadline and task-specific activity. Overdue and blocked tasks never pass automatically; an authorized administrator should investigate, then reassign or begin a new round as appropriate. Only an actionable current task offers a review link.
- **Candidates and history**: current candidate names are administrator-only and do not mean assignment. New task and activity records keep the names used at the time. If an older record did not retain a name, it is shown as not recorded, never filled in from today's directory. Reassignments retain the actor and new assignee names.
- **Rounds and versions**: switch rounds to inspect the actual material version, workflow and routing rule revision used at submission. New rules do not redraw previous rounds. Large task lists, round lists and histories are paginated.
- **Approval versus application**: approved does not necessarily mean applied to the repository. Administrators should resolve a failed application from the failure queue rather than re-uploading the paper.
- **Access**: submitters, relevant reviewers, the institution owner and platform administrators can view progress within their permissions. Unrelated members cannot read someone else's progress, nor can external systems use their integration access to do so. Viewing progress grants no access to other material versions, files or decisions. Suspended personnel cannot continue accessing it.

Rule simulation reuses the diagram, explicitly marked as a simulation, without creating tasks. Use Refresh for the latest state. Unsaved rule edits never change existing rounds.

## Correcting bad data

First identify where the problem arose. If the original institution record is wrong, ask the responsible department to correct it, then synchronize again. If that record is correct but Scholar differs after synchronization, contact the integration or maintenance team; after repair, check and resynchronize the affected records. An authorized administrator corrects review grants or workflow settings in Scholar.

Two temporary corrections are available:

| Type | Boundary |
| --- | --- |
| Display name | Up to 30 days; retain source name and never change identifiers/account ownership |
| Temporary login permission | Up to 7 days when the institution source incorrectly marks someone as no longer active, employed or enrolled; other personnel-list and appointment requirements still apply, manual suspension is not lifted, and reviewer authority is not granted or restored |

An independent administrator must approve. Administrators cannot request or approve corrections for their own linked identity. Record a verification reference, not passwords, identity-document numbers or unrelated personal details. If the source changes before approval, submit a new request based on the updated information.

Synchronization continues to update information from the institution. Once the original record is corrected, the temporary correction ends automatically. If the source changes to another conflicting value, the temporary correction stops taking effect and its history is retained. Temporary login permission expires immediately; the system restores name display, normally within 30 seconds. Administrators can also revoke corrections early. Normal permissions still depend on current personnel information. Expiry does not delete an account or restore an old grant.

This page supports only these two temporary corrections. It cannot reassign employee or student identifiers, replace accounts, merge people or change appointments supplied by the institution. Other changes require the appropriate identity verification or correction of the original record by the responsible department.

## Synchronization incidents and handover

Synchronization failure, timeout or a missing personnel list does not mean everyone has left. Never clear personnel records to make synchronization succeed. Before mass deactivation, verify the list is complete and obtain manual confirmation. Contact the integration team when connecting another institution system; technical staff can use the [personnel synchronization contract](/en/integration/personnel-sync).

For handover, confirm institution sources and integration contacts, the last successful synchronization, failed or pending synchronization records, current reviewer grants, rule versions and simulation results, unfinished tasks, temporary corrections and expiry dates, emergency administrators, and backup and upgrade owners. Share real personnel lists, login or integration credentials and system settings through the institution's approved secure channels, not in public handbooks or examples.
