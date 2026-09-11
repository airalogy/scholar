# Admin Console

Scholar provides layered administration in the same product. After sign-in, the application retrieves the current access summary from the server and shows only the tools and institutions assigned to that account.

## Administration levels

### Platform console

Platform administrators can manage the global subject catalog, user feedback, cross-institution review queues, and administration entry points for every institution.

### Institution console

Institution owners and administrators can manage institution content, member permissions, subject mappings, labs, and review work. An ordinary member receives only capabilities delegated explicitly:

- `can_review_content`: process content review for the member's institution.
- `can_import_data`: import paper and scholar data into the member's institution.

These capabilities are independent from each other and do not grant member administration or system-credential management access.

## Institution identity verification

Institution owners and platform administrators can review **Identity verification requests** and manage **Institution identifiers** on the institution Members page. This permission is not included in ordinary administrator, import, or content-review access.

When school sign-in succeeds but the new student/employee ID conflicts with an existing account, the sign-in page offers **Request identity verification**. Applicants provide their prior ID, an explanation, and a declaration that the account is theirs. A request does not grant access to that account. They can check the result by signing in with the institution again; an expired verification session does not delete the request.

Verify the change against authoritative institution records, explicitly select the existing person, and record the verification basis. Matching names or email addresses are not enough. You can approve, decline, or ask for more information. Keep private evidence in the verification notes; the separate applicant message is visible to the applicant. Do not request passwords or sensitive identity-document uploads.

Approval makes the new ID sign in to the same account, preserving its papers, profile, and permissions. Administrators can also add a verified ID directly. Revoked IDs remain reserved to the original person. Restoring one requires fresh verification. An administrator's own additional ID must be verified by another authorized administrator.

Revocation immediately invalidates new SSO sessions bound to that ID. Older sessions created before this feature and password sign-ins retain their original expiry; this is not an account-wide sign-out.

## Access and security

Browser menus and route checks provide a clear user experience. Every server API still enforces the actual authorization boundary independently. When an account lacks a required capability, Scholar displays a restricted-access page and does not expose administration data from another institution.

## Data import

For browser-based CSV upload and import history, read [Admin Console Import](/en/administration/data-import). For automated institution-system synchronization, read the [Integration Overview](/en/integration/).
