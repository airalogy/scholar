# Administrator Authorization and Departure

Administrator authority can change, but personnel accounts and employee IDs must not be handed to a successor. The successor uses their own account and identifier. Historical reviews, submissions and actor identities remain unchanged.

## Appoint an existing member

An institution can have more than one administrator. To share administration with a colleague, appoint them on their own account. There is no need to transfer an account or rebind an employee ID.

1. Open **Members and permissions** in the admin workspace. Check **Your role** at the top. Only institution owners and platform administrators can appoint administrators.
2. Under **Find an institution member**, search by name, email, or employee/student ID. Keep **All members** selected; **Owners and administrators** shows only people who already hold those roles. If the person is not a member, expand **Add a member from the account directory**. Use pre-provisioning if the person has no platform account yet.
3. Select **Appoint as administrator** on the member’s row. Check the person, institution, and role change. Enter a reason or ticket reference and confirm. Cancelling saves nothing. If the request fails, check the error and the person’s current employment status.
4. Select **Owners and administrators** to verify the result. Other administrators retain their roles. If you can manage members but see no appointment action, ask an institution owner or platform administrator. Institution administrators can manage regular members, not appoint peers.

## Authorization boundaries and audit

- Institution administrators handle routine management. Institution owners can also appoint and remove administrators. Appointment does not confer library final approval; workflow reviewer grants are managed separately in Review Governance.
- Owners and platform administrators can inspect the effective-owner count and permission audit under **Departure handoff and permission audit**. Entries include the actor, reason, source, time and before/after values.
- Maintain at least two owners who can sign in. Routine changes cannot remove the last effective owner. An authoritative departure or manual suspension still revokes authority.

## Departure handoff

1. Verify the successor's own account, employee ID, institution membership and active status.
2. Ask an authorized host operator to revoke any platform authority held by the departing person first. Institution handoff does not transfer platform authority.
3. Select the departing administrator and successor in Departure handoff and permission audit. Preview lab ownerships, reviewer grants, outstanding work, invitations and integration credentials.
4. Prepare replacement integration credentials first, including directory-sync credentials. Handoff revokes all unrevoked credentials created by the departing person in this institution.
5. Enter a reason and acknowledge the checklist before confirming. If the checklist changes, preview again.
6. The successor receives the corresponding institution role and lab ownerships. The departing person is suspended and their management authority, reviewer grants, pending invitations and credentials are revoked. A failure rolls back the entire handoff.
7. Independently verify reviewer qualifications, grant authority and reassign work as appropriate. Reviewer grants are not copied and historical decisions are not rewritten. Verify successor access and inspect the audit.

After a timeout, refresh permissions and audit to determine whether the operation completed before retrying. If the directory already suspended and demoted the departing administrator, another owner should restore successor permissions, lab ownerships and pending work separately. Do not readmit departed personnel for handoff. Reentry does not automatically restore old permissions.

## When no administrator can sign in

Contact an authorized deployment operator to follow the bilingual administrator maintenance handbook in the repository. First-install initialization cannot reclaim authority, and there is no anonymous web recovery endpoint.

Recovery creates a separate platform account valid for at most four hours; it does not adopt a departed person's account or change their employee ID. After verifying identities, restoring normal owners, replacing credentials and checking sign-in, the operator should immediately revoke the temporary account and inspect the audit. It must not become a shared everyday account. Host sign-in configuration, backups and recovery drills belong to the operations handbook.
