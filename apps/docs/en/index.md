---
layout: home

hero:
  name: Scholar Documentation
  text: User, administration, and integration guides
  tagline: Versioned with the Scholar product to help institution administrators and system integrators manage academic data securely.
  actions:
    - theme: brand
      text: Institution integration
      link: /en/integration/
    - theme: alt
      text: Bulk Import API
      link: /en/integration/bulk-import

features:
  - title: Institution data integration
    details: Import papers and scholars through the admin console or a system credential, with institution and permission boundaries enforced for every write.
  - title: Executable API reference
    details: Use Scholar's Swagger UI to inspect the exact request and response schemas for the current version.
  - title: Chinese and English
    details: Chinese and English pages stay aligned, and you can switch languages from the page header at any time.
---

## Where to start

- Institution administrators: read [Admin Console Import](/en/administration/data-import) for member access, CSV preview, and import history.
- System integrators: begin with [Authentication and Access](/en/integration/authentication), then continue to the [Bulk Import API](/en/integration/bulk-import).

::: tip Product version
This documentation applies to Scholar `v{{ $frontmatter.scholarVersion }}`. Refer to the current Scholar instance's [OpenAPI reference](/en/reference/openapi) for exact field definitions.
:::
