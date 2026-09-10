import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const migrationsRoot = path.join(repositoryRoot, 'apps/api/prisma/migrations')
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for upgrade verification')

// Everything, including the schema and fixtures, is rolled back on the same
// connection. Existing deployment schemas are never selected or modified.
const schema = `scholar_upgrade_${randomBytes(8).toString('hex')}`
const directories = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()
if (directories[0] !== '00000000000000_v3_initial') {
  throw new Error('The published 3.0.0 migration baseline must be retained')
}
const migrations = await Promise.all(
  directories.map((directory) =>
    readFile(path.join(migrationsRoot, directory, 'migration.sql'), 'utf8'),
  ),
)

const fixture = `
DO $$
DECLARE
  institution_id UUID := gen_random_uuid();
  account_id UUID := gen_random_uuid();
  second_account_id UUID := gen_random_uuid();
  scholar_id UUID := gen_random_uuid();
  pending_scholar_id UUID := gen_random_uuid();
  person_id UUID := gen_random_uuid();
  provision_id UUID := gen_random_uuid();
  node_id UUID := gen_random_uuid();
  position_id UUID := gen_random_uuid();
  paper_id UUID := gen_random_uuid();
  author_id UUID := gen_random_uuid();
BEGIN
  INSERT INTO institutions (id, name, slug)
    VALUES (institution_id, 'Example University', 'upgrade-example');
  INSERT INTO users (id, name, email, username) VALUES
    (account_id, 'Example Person', 'first@example.invalid', 'first'),
    (second_account_id, 'Example Person', 'second@example.invalid', 'second');
  INSERT INTO institution_memberships ("institutionId", "userId") VALUES
    (institution_id, account_id), (institution_id, second_account_id);
  INSERT INTO scholars (id, name, "createdAt", "updatedAt") VALUES
    (scholar_id, 'Example Person', now(), now()),
    (pending_scholar_id, 'Unregistered Scholar', now(), now());
  INSERT INTO institution_org_people (id, "institutionId", key, name, "externalId", "userId")
    VALUES (person_id, institution_id, 'directory-first', 'Example Person', ' Staff-001 ', account_id);
  INSERT INTO institution_scholar_mappings ("institutionId", "externalId", "scholarId") VALUES
    (institution_id, 'staff-001', scholar_id),
    (institution_id, 'Staff-003', pending_scholar_id);
  INSERT INTO institution_user_provisions
    (id, "institutionId", "createdBy", email, name, "externalId", "inviteToken")
    VALUES (provision_id, institution_id, account_id, 'pending@example.invalid',
      'Pending Person', 'Staff-004', 'anonymous-upgrade-fixture');
  INSERT INTO institution_org_nodes (id, "institutionId", key, name)
    VALUES (node_id, institution_id, 'unit', 'Example Unit');
  INSERT INTO institution_org_positions (id, "institutionId", "nodeId", key, name)
    VALUES (position_id, institution_id, node_id, 'researcher', 'Researcher');
  INSERT INTO institution_org_appointments ("institutionId", key, "personId", "positionId")
    VALUES (institution_id, 'appointment', person_id, position_id);
  INSERT INTO papers (id, title, doi, normalized_doi, "createdAt", "updatedAt")
    VALUES (paper_id, 'Anonymous upgrade fixture', '10.1234/upgrade-fixture',
      '10.1234/upgrade-fixture', now(), now());
  INSERT INTO authors (id, name, "createdAt", "updatedAt")
    VALUES (author_id, 'Example Person', now(), now());
  INSERT INTO paper_authors ("paperId", "authorId", "order") VALUES (paper_id, author_id, 1);
  INSERT INTO institution_paper_author_bindings
    ("institutionId", "paperId", "authorId", "userId", "boundBy")
    VALUES (institution_id, paper_id, author_id, account_id, account_id);
  INSERT INTO embeddings ("paperId", "segmentIndex", text, embedding, "createdAt", tsv)
    VALUES (paper_id, 0, 'Existing index text', '[1,0]'::vector, now(),
      to_tsvector('simple', 'Existing index text'));
END $$;
`

const assertions = `
DO $$
BEGIN
  IF (SELECT count(*) FROM users) <> 2
    OR (SELECT count(*) FROM scholars) <> 2
    OR (SELECT count(*) FROM papers) <> 1
    OR (SELECT count(*) FROM paper_authors) <> 1
    OR (SELECT count(*) FROM institution_memberships) <> 2
    OR (SELECT count(*) FROM institution_org_appointments) <> 1
    OR (SELECT count(*) FROM institution_user_provisions) <> 1
    OR (SELECT count(*) FROM institution_people) <> 4 THEN
    RAISE EXCEPTION 'Upgrade lost or duplicated fixture records';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM institution_people person
    JOIN users account ON account.id = person."userId"
    JOIN scholars scholar ON scholar.id = person."scholarId"
    JOIN institution_org_appointments appointment ON appointment."personId" = person.id
    JOIN institution_paper_author_bindings binding ON binding."personId" = person.id
    WHERE person."normalizedInternalId" = 'staff-001'
      AND account.username = 'first' AND scholar.name = 'Example Person'
  ) THEN RAISE EXCEPTION 'Upgrade lost linked identity, appointment, or authorship'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM institution_people person JOIN users account ON account.id = person."userId"
    WHERE account.username = 'second' AND person."scholarId" IS NULL
      AND person."internalId" LIKE 'legacy-user:%'
  ) THEN RAISE EXCEPTION 'Same-name members were merged'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM institution_people WHERE "normalizedInternalId" = 'staff-003'
      AND "scholarId" IS NOT NULL AND "userId" IS NULL
  ) THEN RAISE EXCEPTION 'Unregistered scholar identity was lost'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM institution_people WHERE "normalizedInternalId" = 'staff-004'
      AND "provisionId" IS NOT NULL AND "userId" IS NULL
  ) THEN RAISE EXCEPTION 'Unclaimed invitation identity was lost'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM embeddings WHERE text = 'Existing index text'
      AND bm25_length = 0 AND bm25_terms = '{}'::jsonb
  ) THEN RAISE EXCEPTION 'Existing search index was lost'; END IF;
END $$;
`

const sql = [
  'BEGIN;',
  `CREATE SCHEMA "${schema}";`,
  `SET LOCAL search_path = "${schema}", public;`,
  migrations[0],
  fixture,
  ...migrations.slice(1),
  assertions,
  'ROLLBACK;',
].join('\n')
const result = spawnSync(
  'pnpm',
  ['--filter', '@airalogy/scholar-server', 'exec', 'prisma', 'db', 'execute', '--stdin'],
  { cwd: repositoryRoot, env: process.env, input: sql, encoding: 'utf8' },
)
if (result.status !== 0) {
  throw new Error(result.stderr || result.stdout || 'Database upgrade verification failed')
}
console.log(`Verified upgrade from 3.0.0 through ${directories.at(-1)}; fixture rolled back`)
