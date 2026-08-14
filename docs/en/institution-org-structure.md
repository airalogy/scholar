# Institution Organization Structure and Review Workflows

English | [简体中文](../zh/institution-org-structure.md)

Airalogy Scholar models complex institution structures and resolves content reviewers from organization positions rather than hard-coded user lists.

The model supports multi-level colleges, departments, centers, laboratories, offices, and committees; graph or matrix relationships; people holding multiple appointments; full-snapshot imports followed by ongoing edits; and explainable reviewer resolution.

## Core principles

### 1. Organization, accounts, and workflows are separate

- An organization directory is not a platform account directory.
- A person enters the institution directory first and may later bind to a platform `user`.
- Workflow steps describe resolver rules, not a permanent list of named users.

This prevents roster imports from creating incorrect accounts and supports provision-first, activate-later onboarding.

### 2. The structure may be a graph; automatic approval follows explicit hierarchy

- Organization data may contain multiple edge types.
- `hierarchy` expresses the primary parent relationship used by workflow traversal.
- An ancestor resolver follows only `hierarchy` edges.
- `matrix`, `committee`, and `co_manage` relationships may remain in the graph but do not become approval paths implicitly.

### 3. Runtime steps are snapshots

- When a content claim is submitted, the service resolves the current structure and workflow into `content_review_step_instances`.
- Later organization changes do not rewrite an active or completed case.
- Resubmission resolves a fresh snapshot while preserving prior history.

## Data model

- `institution_org_nodes`: institution, college, department, laboratory, office, committee, or other nodes.
- `institution_org_edges`: relationships between nodes; the recommended direction is child in `fromNodeId` and parent in `toNodeId`.
- `institution_org_people`: institution directory people, optionally bound to a platform user or provision.
- `institution_org_positions`: positions on a node, such as dean, research secretary, PI, or reviewer.
- `institution_org_appointments`: a person's appointments to positions.
- `institution_review_workflows`: workflow templates.
- `institution_review_workflow_bindings`: workflow bindings to the institution or a node.
- `institution_review_workflow_steps`: ordered resolver definitions.
- `content_review_cases`: review status and active step for a content item.
- `content_review_step_instances`: runtime reviewer and step snapshots.

`paper_claims` retains `reviewNodeId`, the organization node for this submission, and `reviewCaseId`, the shared review case.

## Standard structure snapshot

The organization is maintained as a complete snapshot through:

- `GET /institutions/:slug/org-structure`
- `PUT /institutions/:slug/org-structure`

The canonical `PUT` shape is:

```json
{
  "replaceMissing": true,
  "nodes": [
    {
      "key": "example-university-root",
      "name": "Example University",
      "nodeType": "institution"
    },
    {
      "key": "life-school",
      "name": "School of Life Sciences",
      "nodeType": "college"
    },
    {
      "key": "example-lab",
      "name": "Example Laboratory",
      "nodeType": "lab"
    }
  ],
  "edges": [
    {
      "fromNodeKey": "life-school",
      "toNodeKey": "example-university-root",
      "edgeType": "hierarchy",
      "isPrimary": true
    },
    {
      "fromNodeKey": "example-lab",
      "toNodeKey": "life-school",
      "edgeType": "hierarchy",
      "isPrimary": true
    }
  ],
  "people": [
    {
      "key": "scholar-example",
      "name": "Example Scholar",
      "email": "scholar@example.edu",
      "createProvision": true
    },
    {
      "key": "secretary-example",
      "name": "Example Secretary",
      "email": "secretary@example.edu"
    }
  ],
  "positions": [
    {
      "key": "example-lab-pi",
      "nodeKey": "example-lab",
      "name": "PI",
      "code": "pi"
    },
    {
      "key": "life-school-secretary",
      "nodeKey": "life-school",
      "name": "Research Secretary",
      "code": "research-secretary",
      "canReviewContent": true
    }
  ],
  "appointments": [
    {
      "key": "scholar-as-pi",
      "personKey": "scholar-example",
      "positionKey": "example-lab-pi",
      "status": "active",
      "isPrimary": true
    },
    {
      "key": "secretary-appointment",
      "personKey": "secretary-example",
      "positionKey": "life-school-secretary",
      "status": "active"
    }
  ],
  "workflows": [
    {
      "key": "lab-paper-review",
      "name": "Laboratory Paper Review",
      "bindings": [
        {
          "type": "node_default",
          "nodeKey": "example-lab",
          "priority": 100
        }
      ],
      "steps": [
        {
          "order": 1,
          "name": "Laboratory PI Review",
          "resolverType": "position",
          "resolverConfig": {
            "scope": "review_node",
            "positionCodes": ["pi"]
          }
        },
        {
          "order": 2,
          "name": "Parent Research Secretary Review",
          "resolverType": "position",
          "resolverConfig": {
            "scope": "ancestor",
            "positionCodes": ["research-secretary"],
            "fallbackInstitutionRoles": ["owner", "admin"]
          }
        }
      ]
    }
  ]
}
```

## Field conventions

### Nodes

- `key` is stable and unique within the institution. Prefer a source-system code or durable human-assigned key.
- `nodeType` commonly uses `institution`, `college`, `department`, `lab`, `office`, `committee`, or `center`, but accepts institution-defined values.

### Edges

- `fromNodeKey` should identify the child.
- `toNodeKey` should identify the parent.
- Only `hierarchy` is traversed as the automatic approval hierarchy.
- `isPrimary` marks the preferred path when a child has multiple relationships of the same type.

### People

- `key` is stable and unique within the institution.
- `userId` binds a known platform account directly.
- If `userId` is absent, the importer attempts to match an existing user by verified email.
- `createProvision: true` creates or updates `institution_user_provisions` when no user is bound. It does not create a login account.

### Positions

- `key` is stable and unique within the institution.
- `code` is reusable across nodes; multiple colleges may use `research-secretary`.
- `canReviewContent` is a semantic marker for structure and future extensions. Workflow resolution remains authoritative.

### Appointments

- One person may hold multiple appointments and one position may have multiple people.
- Only appointments with `status = active` and an effective current date range are eligible for reviewer resolution.

## Workflow rules

### Bindings

- `institution_default`: default for the institution.
- `node_default`: default for a specific organization node.

Resolution prefers a matching `node_default` for `reviewNodeId`, chooses the highest `priority` among multiple matches, then falls back to `institution_default`.

### Step resolvers

- `user`: explicit `userIds`.
- `institution_role`: institution `owner`, `admin`, `member`, or delegated `reviewer` roles.
- `position`: people holding a matching organization position.

A `position` resolver supports:

- `review_node`: search the current `reviewNodeId`.
- `ancestor`: traverse `hierarchy` upward and stop at the nearest level with a match.
- `specific_node`: search a configured `nodeKey`.
- `institution_root`: search the node whose `nodeType` is `institution`.

### Fallbacks

When no active appointment with a bound platform account is found, `resolverConfig.fallbackInstitutionRoles` may provide a controlled fallback:

```json
{
  "scope": "ancestor",
  "positionCodes": ["research-secretary"],
  "fallbackInstitutionRoles": ["owner", "admin"]
}
```

## Platform-account binding

During snapshot import, the service:

1. binds a supplied `people[].userId`;
2. otherwise matches an existing user by email;
3. creates or updates a provision when `createProvision = true` and no user matches;
4. ensures an institution membership once a directory person binds to a user.

Roster imports do not create login-capable `user` records. Accounts continue to originate from registration, activation, or institution login.

## Paper review integration

Uploads and updates may include `review_node_id`. When a claim enters review, the service resolves the workflow from `institutionId + reviewNodeId`, creates one step instance per definition, marks the first `pending` and later steps `queued`, advances after each approval, and publishes only after the last approval. Any change request moves the case to `changes_requested`.

Resolved reviewer candidates are snapshotted at submission or resubmission. Later changes to people, appointments, positions, or edges do not affect the active case.

## Implemented backend endpoints

- `GET /institutions/:slug/org-structure`: read the complete current snapshot.
- `PUT /institutions/:slug/org-structure`: import or replace the snapshot.
- `POST /papers/create`: accepts optional `review_node_id`.
- `PUT /papers/:id`: accepts optional `review_node_id`.

## Current boundaries

- Organization updates use whole-snapshot submission. Clients should start from `GET`, modify that representation, then `PUT` it back.
- Automatic traversal of graph-like structures follows `hierarchy` edges only.
- Parallel countersigning, ad hoc additional reviewers, and percentage-based approval are not implemented.

## Related documentation

- [Paper review workflow](./paper-review-workflow.md)
- [Content governance and role boundaries](./content-governance.md)
- [API architecture](./api.md)
