# Authentication and Access

Bulk import is not a public write API. Every request must prove both that the caller can import data and that the target institution matches the authorization scope.

## User accounts

When the admin console or a user JWT calls an import endpoint:

- `platform_admin` and institution `owner/admin` roles can import by default.
- A regular `member` can import only after `can_import_data` is explicitly enabled.
- A user can operate only on institutions they are authorized to access.
- Import access is independent from member administration and review permissions.

## System credentials

Only an institution `owner` or `platform_admin` can create, rotate, or revoke system credentials. Institution admins and members cannot manage credentials or retrieve an existing plaintext secret.

Available scopes are:

| Scope | Purpose |
| --- | --- |
| `papers:import` | Import papers |
| `scholars:import` | Import scholar profiles |
| `imports:read` | Read import jobs and row-level results |

Credentials expire after 90 days by default, and an institution can have at most 10 active credentials. The `client_secret` is shown only after creation or rotation. Store it in a secret manager and never put it in source code, logs, or support tickets.

## Exchange a short-lived token

```bash
curl -X POST 'https://scholar.example.edu/api/auth/integration-token' \
  -H 'Content-Type: application/json' \
  -d '{
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

The response contains a JWT valid for one hour. Send it with import requests:

```http
Authorization: Bearer YOUR_INTEGRATION_JWT
```

Scholar checks the credential institution, scopes, expiry, revocation state, and version on every request. Rotating or revoking a credential invalidates its previously issued JWTs immediately.

::: warning Security boundary
An integration JWT can access only explicitly allowed integration endpoints. It cannot access ordinary user, member administration, review, or global scholar write endpoints. Credentials and tokens must be transmitted over HTTPS in production.
:::
