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

## Access and security

Browser menus and route checks provide a clear user experience. Every server API still enforces the actual authorization boundary independently. When an account lacks a required capability, Scholar displays a restricted-access page and does not expose administration data from another institution.

## Data import

For browser-based CSV upload and import history, read [Admin Console Import](/en/administration/data-import). For automated institution-system synchronization, read the [Integration Overview](/en/integration/).
