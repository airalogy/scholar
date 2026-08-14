# OpenAPI and Swagger

Scholar generates its OpenAPI document from the TypeBox schemas used by the API. The interactive reference and running API therefore share a version and provide the authoritative request fields, status codes, and response structures.

## URLs

When accessing the API through the Scholar website:

- <a href="/api/docs" target="_blank" rel="noopener">Swagger UI: `/api/docs`</a>
- <a href="/api/docs/json" target="_blank" rel="noopener">OpenAPI JSON: `/api/docs/json`</a>

When connecting directly to the API service, use `/docs` and `/docs/json` instead.

## Recommended use

1. Confirm the paths and schemas exposed by the current Scholar instance in Swagger UI.
2. If you generate types or a client from OpenAPI JSON, pin the generated artifact to a product version instead of downloading it dynamically during a production build.
3. Use this documentation for integration workflows and the current Scholar instance's OpenAPI document for field-level constraints.
4. The Swagger page can be read publicly, but protected API operations still require a valid JWT and pass the normal authorization checks.

::: warning Do not paste production secrets
Do not enter a real `client_secret` while screen sharing or using a shared test environment. Prefer a short-lived test credential and revoke it after testing.
:::
