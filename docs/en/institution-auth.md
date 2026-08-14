# Institution Login and Single Sign-On

English | [简体中文](../zh/institution-auth.md)

This document describes Airalogy Scholar's institution-neutral login model. Universities and research institutions integrate through deployment configuration and institution data. Customer names, routes, and source-code branches must not be added to the generic product.

See [private deployment](./private-deployment.md) for installation, initialization, and upgrades in a single-institution environment.

## Accounts and institution identities

- `users` is the globally unique platform account.
- `user_external_identities` maps an identity provider and external subject to a platform account.
- `institution_memberships` records the user's membership and role in an institution.
- `institution_user_provisions` records administrator pre-provisioning and user activation.

One person should not receive multiple platform users merely because they join multiple institutions. External identities and institution memberships remain separate so the platform can support multiple identity providers.

## Login methods

`GET /auth/institutions` returns the institutions enabled by the current deployment and their `allowedMethods`:

- `provision_token`: an institution administrator provisions the member, who activates through a one-time token.
- `platform_account`: the member uses an existing platform account.
- `sso`: the browser redirects to the institution identity provider.

When a deployment exposes one institution, the frontend can show its methods directly. Multi-institution deployments first select an institution, then show only its enabled methods. Institution names, identity endpoints, and membership rules must come from configuration and data rather than frontend constants.

## Generic SSO configuration

The current generic adapter implements OAuth 2.0 Authorization Code. Enabling it requires the complete configuration:

```dotenv
ENABLE_INSTITUTION_LOGIN=true
INSTITUTION_SSO_ENABLED=true
INSTITUTION_SSO_TYPE=oauth2
INSTITUTION_SSO_PROVIDER_ID=institution-sso
INSTITUTION_SSO_DISPLAY_NAME=Institution Single Sign-On
INSTITUTION_LOGIN_INSTITUTION_SLUG=example-university
INSTITUTION_SSO_AUTHORIZATION_URL=https://identity.example.edu/oauth/authorize
INSTITUTION_SSO_TOKEN_URL=https://identity.example.edu/oauth/token
INSTITUTION_SSO_USERINFO_URL=https://identity.example.edu/oauth/userinfo
INSTITUTION_SSO_CLIENT_ID=scholar
INSTITUTION_SSO_CLIENT_SECRET=replace-with-provider-secret
INSTITUTION_SSO_REDIRECT_URI=https://scholar.example.edu/institution_sso_callback
INSTITUTION_SSO_SCOPE=basic
INSTITUTION_SSO_EXTERNAL_ID_FIELD=sub
INSTITUTION_SSO_EMAIL_FIELD=email
INSTITUTION_SSO_NAME_FIELD=name
INSTITUTION_SSO_USERINFO_TOKEN_MODE=bearer
```

- The provider ID and external subject form the globally unique identity mapping. Do not change the provider ID after production launch without a migration.
- `INSTITUTION_LOGIN_INSTITUTION_SLUG` must identify an existing `institutions.slug`. A private deployment may leave it empty and use `PRIVATE_INSTITUTION_SLUG`.
- User-info fields accept dotted paths such as `profile.email`.
- `bearer` sends the access token in the `Authorization` header. Use `query` only when required by the identity provider.
- The production redirect URI must end at `/institution_sso_callback` exactly.

## First SSO login

1. Validate the signed state, exchange the authorization code, and fetch user information.
2. Look up `user_external_identities` by provider and external subject.
3. If the identity is already mapped, sign in the mapped user.
4. If no identity is mapped but an account with the verified email is already a member of the institution, attach the verified identity to that account.
5. Otherwise create a platform account and its external identity mapping.
6. Create or repair the institution membership with the fixed default role `member`.

Successful SSO proves institution authentication only. It never grants `owner`, `admin`, content review, or data import permission. Elevated capabilities remain separate administrative decisions.

## Access boundaries

- Public configuration exposes only institution names, login methods, SSO display names, and authorization entry points.
- Member directories, provisions, review scopes, secrets, and administrative capabilities remain protected.
- Public multi-institution deployments restrict private institution libraries to the user's memberships.
- Private deployments use `PRIVATE_INSTITUTION_SLUG` as the default library and do not expose other institutions.

## Leaving an institution

Removing a member does not delete the global `user`. Revoke the corresponding `institution_memberships` and the institution's `lab_memberships`. This immediately removes administrative, private-content, and laboratory permissions. Transfer ownership first if the person is the last owner of a laboratory.

## Adding another protocol adapter

If OAuth 2.0 cannot represent an institution protocol, a new adapter must:

1. Use a generic provider ID and generic source, route, and environment-variable names.
2. Reuse signed OAuth state, safe `returnTo`, and callback-response helpers.
3. Write the common `user_external_identities` model instead of adding customer-specific fields to `users`.
4. Grant only a default `member` relationship.
5. Add configuration, callback failure, duplicate identity, and first-login tests before release.

Institution names, logos, watermarks, customer domains, and real identity-provider parameters are deployment data and must not be committed to the generic repository.
