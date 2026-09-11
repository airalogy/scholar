# Institution Identity and Single Sign-On

English | [简体中文](../zh/institution-auth.md)

Airalogy Scholar serves one institution per deployment or managed tenant. Institution names, identity-provider addresses, identifiers, logos, and customer data are deployment data; they must not be hard-coded into the product.

See the [deployment guide](./deployment.md) for installation, initialization, and upgrades.

## Identity model

Authentication, institution identity, and scholarly profile are separate concepts:

- `users` is the login account. A person can exist in the institution directory before a user account exists.
- `institution_people` is the institution's authoritative person record. It has one canonical `internalId`, such as an employee or student number, and may link to a `user`, a `scholar`, and an activation provision.
- `institution_person_identifiers` reserves the canonical ID and administrator-verified aliases in one institution-scoped namespace, including revocation and session versions.
- `user_external_identities` records the identity-provider login mapping.
- `institution_memberships` records authorization roles and delegated capabilities.
- `scholars` contains the public scholarly profile. It is not a login account.

The canonical internal ID is unique within the configured institution, compared case-insensitively, and retained in its original display form. Do not derive it from email, name, year, degree level, or organizational unit. Scholar UUIDs and user UUIDs remain internal platform identifiers and are not substitutes for the institution ID.

An institution may use multiple authentication protocols. Each verified identifier must resolve to the same institution person, through the canonical ID or a verified alias. Email is contact information only and must not silently reassign an institution person.

## Multiple student or employee IDs

One person can retain an old student ID and acquire another student or employee ID. Keep the existing person, user, Scholar UUID, canonical ID, memberships, and paper bindings. Add an independently verified alias instead of changing the canonical ID or merging accounts by name or email. Both active IDs then resolve to the existing account; imports and author bindings also accept active aliases.

Institution owners and platform administrators manage identifiers and identity requests under **Administration → Institution → Members**. Ordinary administrators and delegated import/review members cannot do so. An owner cannot change a platform administrator's identifiers; another administrator must verify an administrator's own additional ID. Verification requires an explicit target person and a recorded basis from authoritative institution records. Names and email matches are hints, never sufficient evidence.

After successful institution SSO, a binding conflict returns `409` with reason `institution_identity_conflict` and a random, 15-minute proof. The proof only permits `POST /auth/institution-identity-requests` and `POST /auth/institution-identity-requests/status`; it is not a login token. The applicant declares the old account is theirs, supplies the prior ID and an explanation, and can view only their own outcome. Invalid SSO or an inactive ID never creates such a proof. Only the proof hash is stored; the browser keeps the proof in tab-scoped session storage, not in the URL.

Administrators may approve, reject, or request more information. Approval adds an alias to an explicitly selected person with an existing account; it does not create elevated permissions or merge different person/account records. Private verification notes are audited separately from the message shown to the applicant. Pending submissions and concurrent decisions are serialized; a verified ID can create at most three new requests in 24 hours. A fresh SSO attempt reopens the existing request after proof expiry.

Revoked IDs stay reserved for their original person. Restoration requires a new administrative verification and increments the identifier version. New SSO sessions are bound to the exact login ID/version, so revocation invalidates those sessions immediately and restoration never revives them. **Pre-upgrade JWTs and password-login sessions lack that identifier binding and remain valid until their existing expiry**; revoking an ID is not a global account/session revocation. The canonical display ID can remain reserved and revoked while another verified ID continues to work.

The migration backfills canonical IDs without inferring aliases. `pnpm db:verify:identity` exercises the workflow, permissions, concurrency, and revocation in a uniquely named temporary schema of a local test database; `pnpm db:verify:upgrade` verifies preservation of existing people and authorship. Neither test associates real people automatically.

## Prebinding papers before first login

An authorized administrator can create an institution person and bind a paper author to either that person's Scholar UUID or canonical institution internal ID. The binding points to `institution_people`, so no user account is required.

After the person's first verified SSO login or activation:

1. Scholar resolves the canonical internal ID.
2. It links the existing institution person to the authenticated user.
3. It creates or repairs the default `member` membership.
4. Previously bound papers appear in the person's account automatically.

Name and email matches may be shown to an administrator as hints, but they never prove identity. Conflicting user, scholar, provision, or internal-ID links return a conflict and require administrative correction; existing links are not overwritten.

## Login methods

`GET /auth/institutions` returns the configured institution and its `allowedMethods`:

- `provision_token`: an administrator creates an institution person and one-time activation provision.
- `sso`: the browser redirects to the institution identity provider.

Password sign-in, when enabled, remains a platform login method rather than a separate institution-directory method. An administrator must still link the account to the canonical institution person before it receives membership or prebound papers.

The frontend displays only the methods enabled for the one configured institution. It never asks an end user to choose a tenant or institution data boundary.

## Generic SSO configuration

The generic adapter implements OAuth 2.0 Authorization Code. Enabling it requires:

```dotenv
ENABLE_INSTITUTION_LOGIN=true
INSTITUTION_SSO_ENABLED=true
INSTITUTION_SSO_TYPE=oauth2
INSTITUTION_SSO_PROVIDER_ID=institution-sso
INSTITUTION_SSO_DISPLAY_NAME=Institution Single Sign-On
INSTITUTION_SSO_AUTHORIZATION_URL=https://identity.example.edu/oauth/authorize
INSTITUTION_SSO_TOKEN_URL=https://identity.example.edu/oauth/token
INSTITUTION_SSO_USERINFO_URL=https://identity.example.edu/oauth/userinfo
INSTITUTION_SSO_CLIENT_ID=scholar
INSTITUTION_SSO_CLIENT_SECRET=replace-with-provider-secret
INSTITUTION_SSO_REDIRECT_URI=https://scholar.example.edu/institution_sso_callback
INSTITUTION_SSO_SCOPE=basic
INSTITUTION_SSO_INTERNAL_ID_FIELD=employee_id
INSTITUTION_SSO_EMAIL_FIELD=email
INSTITUTION_SSO_NAME_FIELD=name
INSTITUTION_SSO_USERINFO_TOKEN_MODE=bearer
```

- `INSTITUTION_SLUG` selects the only institution served by this instance.
- `INSTITUTION_SSO_INTERNAL_ID_FIELD` must point to the institution's canonical employee/student identifier claim. Dotted paths such as `profile.employee_id` are supported.
- The provider ID and normalized internal ID form the external login mapping. Do not change either interpretation after production launch without a migration.
- The email and name claims are profile attributes, not identity keys.
- `bearer` sends the access token in the `Authorization` header. Use `query` only when required by the provider.
- The production redirect URI must end at `/institution_sso_callback` exactly.

## First SSO login

1. Validate signed state, exchange the authorization code, and fetch user information.
2. Read and normalize the canonical internal ID; reject a missing value.
3. Find the institution person and external login mapping by that identifier.
4. Reject any conflict between their existing user links.
5. Reuse the linked user, or create a platform account when no link exists.
6. Link the institution person and external identity to that user in one transaction.
7. Create or repair a default `member` membership.

Successful SSO proves institution authentication only. It never grants `owner`, `admin`, content-review, or data-import permission.

## Access and lifecycle boundaries

- `CONTENT_ACCESS_MODE=public` permits anonymous access only to explicitly public, approved content. `authenticated` requires login for the institution collection.
- Member directories, internal IDs, provisions, review scopes, secrets, and administrative capabilities remain protected.
- Public scholar and paper responses do not expose the canonical internal ID.
- Removing a membership revokes permissions but does not delete the platform user, institution person, scholar profile, or historical paper-author bindings.
- A new institution requires a separate deployment or managed tenant. Cross-institution person merging is outside this repository's supported product model.

## Adding another protocol adapter

A new SSO adapter must:

1. Use generic source, route, and environment-variable names.
2. Reuse signed state, safe `returnTo`, and callback-response helpers.
3. Resolve the configured institution's canonical internal ID.
4. Write `user_external_identities` and `institution_people` transactionally.
5. Grant only a default `member` relationship.
6. Test missing identifiers, duplicate links, conflicting links, and first-login paper visibility.

Institution names, logos, customer domains, and real provider parameters must remain outside the source repository.
