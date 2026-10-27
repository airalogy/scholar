# Administrator Authorization, Departure and Recovery

[简体中文](../zh/administrator-governance.md)

This handbook requires a version containing the administrator-governance migration. Back up the database and configuration before upgrading, and migrate using the matching image. Completed code and tests do not mean production deployment or an operational recovery drill has occurred.

## Identity and authority

Employee identifiers, personnel records and login accounts belong to a person. When an administrator leaves, authorize the successor's own account and revoke the departing person's authority. **Do not replace a departing person's employee ID with the successor's ID.** Historical reviews, submissions and actor identities remain unchanged. A genuine identifier correction for the same person belongs in the verified personnel-identifier maintenance workflow, not administrator handoff.

| Operation | Institution owner / platform administrator | Institution admin |
| --- | --- | --- |
| Maintain ordinary member permissions and invitations | Allowed | Allowed |
| Appoint, demote or remove owners / admins | Allowed | Denied |
| Permission audit and administrator handoff | Allowed | Denied |
| Personnel identifiers, directory corrections, reviewer grants and routing | Allowed | Denied |
| Organization import affecting personnel or lab ownership | Allowed | Denied |

Reviewer eligibility still requires explicit, effective reviewer grants. Being an owner, admin, directory official or supervisor alone is not final-review authorization. New permission recipients must pass current lifecycle and admission checks; temporary admission exceptions cannot be used to reauthorize departed personnel.

Maintain at least two independently verified owners who can sign in. Normal membership operations prevent removal or demotion of the last effective owner, including concurrent requests. **Authoritative departure or manual personnel suspension still revokes access even for the last owner.** Use emergency recovery if no effective owner remains.

## Routine authorization and audit

Select the real account in institution member management, enter a reason or ticket reference, then change its permissions. The UI prevents ordinary admins from managing administrators. The server rechecks current authority inside mutation transactions; stale pages or tokens cannot preserve revoked authority.

The Administrator Lifecycle panel shows the effective-owner count, handoff and permission audit. Audit pages contain at most 50 events with actor ID/name snapshot, source, reason, before/after values and timestamp. Coverage includes institution/lab roles, invitations, reviewer grants, personnel suspension, integration credentials and platform authority.

- UI changes and handoff require reasons. For compatibility, legacy membership/invitation APIs accept omitted reasons and record an explicit default source description. Integrations requiring ticket-level traceability should always send `reason`.
- Database triggers write permission events in the same transaction as the change. Failures roll back both; updates, deletes and truncation of the audit table are rejected.
- Passwords, password hashes, invitation tokens and API secrets are excluded. Direct database changes without application context are marked as unattributed `database` operations; correlate them with database access logs.
- Migration does not fabricate historical events. This is an application append-only audit, not external tamper-proof storage against a database superuser. Backups, database privilege separation and external log retention remain operational responsibilities.

## Planned departure: preview and handoff

1. Have the successor sign in with their own identity and verify their employee identifier, institution membership and current admission. Prepare another owner so a self-handoff does not end all remaining maintenance access.
2. Check platform authority. If the departing person is a platform administrator, an authorized host operator must first use `revoke-platform` below. Institution handoff does not transfer platform authority.
3. Select the departing administrator and successor in member management, then preview. Review lab ownerships, reviewer grants, pending review work, invitations and integration credentials.
4. **Prepare replacement integration credentials first**, including directory-sync credentials created by the departing administrator. Handoff revokes all their unrevoked credentials in this institution; integrations may require reconfiguration.
5. Enter a reason and acknowledge the checklist. If permissions or outstanding work changed since preview, a fresh preview is required.
6. One transaction grants the successor the corresponding institution role (without demoting an existing owner) and lab ownerships; manually suspends the departing person; removes their institution/lab management and reviewer authority; disables pending invitations; and revokes credentials. Subsequent access with existing login tokens is denied.
7. Resolve review work in Review Governance. Verify qualifications independently, then explicitly grant and reassign where appropriate. Handoff **does not copy reviewer grants or rewrite completed decisions, historical names or original submitters**. Sign in as the successor, verify access and inspect the audit.

After a timeout, refresh current permissions and audit to establish whether handoff committed before retrying.

If the directory has already suspended and demoted the departing administrator, use another owner or recovery account to appoint replacement owners, restore lab ownership, handle reviewer grants/tasks and replace revoked credentials separately. Do not readmit departed personnel merely to perform handoff. Reentry does not automatically restore former management authority or revoked reviewer grants.

## Host-only emergency recovery

`bootstrap` only initializes a new institution and a new account once. An initialized institution rejects bootstrap even after every membership has been removed. Bootstrap cannot restore authority or adopt an existing email/username account.

An authorized operator with access to the deployment host and this instance's configuration may run:

```sh
deploy/scholarctl recover-admin
```

The command requires an interactive terminal and shares the install/upgrade/backup operation lock. It displays the configured institution slug and requires an operator/incident reference, reason, and exact `RECOVER <institution-slug>` confirmation. The container also verifies the input slug against `INSTITUTION_SLUG`. There is no anonymous HTTP recovery endpoint.

- `create` creates a new independent platform recovery account valid for **four hours**. Username: 3–64 characters. Password: at least 12 characters and no more than 72 UTF-8 bytes. Hidden password input is sent through standard input, not command arguments or environment variables. Existing accounts are never adopted or password-reset.
- `revoke-platform` revokes platform authority for an exact user UUID. For temporary recovery accounts it also expires access immediately; for ordinary platform administrators it only removes platform authority, so institution access must be reviewed separately.

Recovery procedure:

1. Verify the instance, version, applied migrations, backup and incident record. Do not directly edit production roles or repeat bootstrap.
2. If `ENABLE_PASSWORD_SIGNIN=false`, temporarily enable password sign-in using the documented deployment configuration-change process and apply the API configuration. Keep public signup closed and existing SSO validation intact. Recovery does not bypass the password-sign-in switch.
3. Run `create` and sign in with the new account. It is not bound to the departed person's personnel record, so that person's directory status cannot lock it out.
4. Verify actual successors, establish at least two normal owners, and address lab ownerships, review work and integration credentials. Verify normal sign-in and administration independently.
5. Immediately run `revoke-platform` for the recovery account and verify that its old token no longer works. Restore the prior password-sign-in setting if changed and verify SSO. Do not wait four hours to clean up.
6. Review `host_recovery` events, permission changes and host logs. Record the incident reason, operator and acceptance results.

Expiry is checked on every server authentication, including previously issued tokens. Recovery accounts have platform-level capability and must not become shared everyday accounts. A personnel claim alone does not authorize host recovery.

## Maintenance validation

```sh
pnpm check
GOVERNANCE_TEST_DATABASE_URL=<isolated-test-database-url> pnpm db:verify:governance
DATABASE_URL=<isolated-test-database-url> pnpm db:verify:upgrade
```

Database tests use random isolated schemas to cover concurrent demotion, authorization denial, atomic handoff/audit, departed-user token rejection, invitation authority revalidation, one-time bootstrap and recovery expiry. Upgrade verification preserves legacy data, review history and initialization state. UI tests cover preview, acknowledgement, stale previews, error display and request cancellation. Never inject faults or rehearse recovery against production data.

Before rollout, rehearse host-interactive recovery, the actual container images, real SSO/directory connections, sign-in configuration changes, credential replacement and backup restoration in staging. Automated checks do not replace those operational validations.
