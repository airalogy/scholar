# Administrator Authorization and Departure

Administrator authority can change, but personnel accounts and employee IDs must not be handed to a successor. The successor uses their own account and identifier. Historical reviews, submissions and actor identities remain unchanged.

## Authorization and audit

- Institution owners and platform administrators can appoint, demote or remove administrators. Ordinary admins can maintain ordinary member permissions and invitations, but cannot appoint administrators.
- Enter a reason or ticket reference before saving in member management. Recipients must pass current lifecycle and admission checks.
- Owners and platform administrators can inspect the effective-owner count and permission audit in Administrator Lifecycle. Each page shows at most 50 events, including actor, reason, source, before/after values and time.
- Maintain at least two owners who can sign in. Routine demotion cannot remove the last effective owner. Authoritative directory departure and manual suspension still revoke authority; departed personnel must not retain access merely to keep an administrator available.
- Administrator status does not automatically confer reviewer eligibility. Reviewer grants are maintained separately in Review Governance.

## Departure handoff

1. Verify the successor's own account, employee ID, institution membership and active status.
2. Ask an authorized host operator to revoke any platform authority held by the departing person first. Institution handoff does not transfer platform authority.
3. Select the departing administrator and successor in Administrator Lifecycle. Preview lab ownerships, reviewer grants, outstanding work, invitations and integration credentials.
4. Prepare replacement integration credentials first, including directory-sync credentials. Handoff revokes all unrevoked credentials created by the departing person in this institution.
5. Enter a reason and acknowledge the checklist before confirming. If the checklist changes, preview again.
6. The successor receives the corresponding institution role and lab ownerships. The departing person is suspended and their management authority, reviewer grants, pending invitations and credentials are revoked. A failure rolls back the entire handoff.
7. Independently verify reviewer qualifications, grant authority and reassign work as appropriate. Reviewer grants are not copied and historical decisions are not rewritten. Verify successor access and inspect the audit.

After a timeout, refresh permissions and audit to determine whether the operation completed before retrying. If the directory already suspended and demoted the departing administrator, another owner should restore successor permissions, lab ownerships and pending work separately. Do not readmit departed personnel for handoff. Reentry does not automatically restore old permissions.

## When no administrator can sign in

Contact an authorized deployment operator to follow the bilingual administrator maintenance handbook in the repository. First-install initialization cannot reclaim authority, and there is no anonymous web recovery endpoint.

Recovery creates a separate platform account valid for at most four hours; it does not adopt a departed person's account or change their employee ID. After verifying identities, restoring normal owners, replacing credentials and checking sign-in, the operator should immediately revoke the temporary account and inspect the audit. It must not become a shared everyday account. Host sign-in configuration, backups and recovery drills belong to the operations handbook.
