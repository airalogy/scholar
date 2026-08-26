-- Rename the organization snapshot person table into the canonical institution
-- person directory. PostgreSQL updates appointment foreign-key targets when the
-- referenced table is renamed.
ALTER TABLE "institution_org_people" RENAME TO "institution_people";
ALTER TABLE "institution_people" RENAME CONSTRAINT "institution_org_people_pkey" TO "institution_people_pkey";
ALTER TABLE "institution_people" RENAME CONSTRAINT "institution_org_people_institutionId_fkey" TO "institution_people_institutionId_fkey";
ALTER TABLE "institution_people" RENAME CONSTRAINT "institution_org_people_userId_fkey" TO "institution_people_userId_fkey";
ALTER TABLE "institution_people" RENAME CONSTRAINT "institution_org_people_provisionId_fkey" TO "institution_people_provisionId_fkey";
ALTER INDEX "institution_org_people_institutionId_idx" RENAME TO "institution_people_institutionId_idx";
ALTER INDEX "institution_org_people_institutionId_userId_idx" RENAME TO "institution_people_legacy_inst_user_idx";
ALTER INDEX "institution_org_people_institutionId_email_idx" RENAME TO "institution_people_institutionId_email_idx";
ALTER INDEX "institution_org_people_provisionId_idx" RENAME TO "institution_people_provisionId_idx";
ALTER INDEX "institution_org_people_institutionId_key_idx" RENAME TO "institution_people_institutionId_key_idx";

ALTER TABLE "institution_people"
  ADD COLUMN "internalId" VARCHAR(100),
  ADD COLUMN "normalizedInternalId" VARCHAR(100),
  ADD COLUMN "scholarId" UUID,
  ADD COLUMN "userLinkedAt" TIMESTAMP(6),
  ADD COLUMN "scholarLinkedAt" TIMESTAMP(6);

-- Preserve legacy organization identifiers. Duplicate or missing identifiers
-- receive deterministic migration-only values instead of exposing user UUIDs.
WITH candidates AS (
  SELECT
    "id",
    "institutionId",
    COALESCE(NULLIF(BTRIM("externalId"), ''), NULLIF(BTRIM("key"), ''), "id"::text) AS candidate
  FROM "institution_people"
), ranked AS (
  SELECT
    "id",
    candidate,
    COUNT(*) OVER (
      PARTITION BY "institutionId", LOWER(candidate)
    ) AS candidate_count
  FROM candidates
)
UPDATE "institution_people" AS person
SET
  "internalId" = CASE
    WHEN ranked.candidate_count = 1 THEN LEFT(ranked.candidate, 100)
    ELSE LEFT('legacy:' || ranked.candidate, 90) || ':' || SUBSTRING(MD5(person."id"::text), 1, 8)
  END,
  "userLinkedAt" = CASE WHEN person."userId" IS NOT NULL THEN person."updatedAt" ELSE NULL END
FROM ranked
WHERE ranked."id" = person."id";

UPDATE "institution_people"
SET "normalizedInternalId" = LOWER(BTRIM("internalId"));

-- A legacy mapping collision cannot be represented by the new one-person,
-- one-scholar invariant and must be resolved explicitly instead of silently
-- merging two people.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "institution_scholar_mappings" AS mapping
    JOIN "institution_people" AS person
      ON person."institutionId" = mapping."institutionId"
     AND person."normalizedInternalId" = LOWER(BTRIM(mapping."externalId"))
    WHERE person."scholarId" IS NOT NULL
      AND person."scholarId" <> mapping."scholarId"
  ) THEN
    RAISE EXCEPTION 'Conflicting legacy scholar mappings require manual resolution';
  END IF;
END $$;

UPDATE "institution_people" AS person
SET
  "scholarId" = mapping."scholarId",
  "scholarLinkedAt" = mapping."updatedAt"
FROM "institution_scholar_mappings" AS mapping
WHERE person."institutionId" = mapping."institutionId"
  AND person."normalizedInternalId" = LOWER(BTRIM(mapping."externalId"))
  AND (person."scholarId" IS NULL OR person."scholarId" = mapping."scholarId");

INSERT INTO "institution_people" (
  "id",
  "institutionId",
  "key",
  "internalId",
  "normalizedInternalId",
  "name",
  "scholarId",
  "scholarLinkedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  mapping."institutionId",
  'scholar:' || mapping."id"::text,
  BTRIM(mapping."externalId"),
  LOWER(BTRIM(mapping."externalId")),
  scholar."name",
  mapping."scholarId",
  mapping."createdAt",
  mapping."createdAt",
  mapping."updatedAt"
FROM "institution_scholar_mappings" AS mapping
JOIN "scholars" AS scholar ON scholar."id" = mapping."scholarId"
WHERE NOT EXISTS (
  SELECT 1
  FROM "institution_people" AS person
  WHERE person."institutionId" = mapping."institutionId"
    AND person."normalizedInternalId" = LOWER(BTRIM(mapping."externalId"))
);

-- Link legacy invitation records to the canonical person whenever they already
-- identify the same claimed user or institution identifier.
UPDATE "institution_people" AS person
SET "provisionId" = provision."id"
FROM "institution_user_provisions" AS provision
WHERE provision."claimedUserId" IS NOT NULL
  AND person."institutionId" = provision."institutionId"
  AND person."userId" = provision."claimedUserId"
  AND person."provisionId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "institution_people" AS linked
    WHERE linked."provisionId" = provision."id"
  );

UPDATE "institution_people" AS person
SET
  "provisionId" = provision."id",
  "userId" = COALESCE(person."userId", provision."claimedUserId"),
  "userLinkedAt" = CASE
    WHEN person."userId" IS NULL AND provision."claimedUserId" IS NOT NULL
      THEN COALESCE(provision."claimedAt", provision."updatedAt")
    ELSE person."userLinkedAt"
  END
FROM "institution_user_provisions" AS provision
WHERE provision."externalId" IS NOT NULL
  AND BTRIM(provision."externalId") <> ''
  AND person."institutionId" = provision."institutionId"
  AND person."normalizedInternalId" = LOWER(BTRIM(provision."externalId"))
  AND person."provisionId" IS NULL
  AND (person."userId" IS NULL OR provision."claimedUserId" IS NULL OR person."userId" = provision."claimedUserId")
  AND NOT EXISTS (
    SELECT 1 FROM "institution_people" AS linked
    WHERE linked."provisionId" = provision."id"
  );

INSERT INTO "institution_people" (
  "id",
  "institutionId",
  "key",
  "internalId",
  "normalizedInternalId",
  "name",
  "email",
  "userId",
  "provisionId",
  "is_provisioning_enabled",
  "userLinkedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  provision."institutionId",
  'provision:' || provision."id"::text,
  COALESCE(NULLIF(BTRIM(provision."externalId"), ''), 'provision:' || provision."id"::text),
  LOWER(COALESCE(NULLIF(BTRIM(provision."externalId"), ''), 'provision:' || provision."id"::text)),
  provision."name",
  provision."email",
  provision."claimedUserId",
  provision."id",
  true,
  CASE
    WHEN provision."claimedUserId" IS NOT NULL THEN COALESCE(provision."claimedAt", provision."updatedAt")
    ELSE NULL
  END,
  provision."createdAt",
  provision."updatedAt"
FROM "institution_user_provisions" AS provision
WHERE NOT EXISTS (
    SELECT 1 FROM "institution_people" AS person
    WHERE person."provisionId" = provision."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "institution_people" AS person
    WHERE person."institutionId" = provision."institutionId"
      AND provision."claimedUserId" IS NOT NULL
      AND person."userId" = provision."claimedUserId"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "institution_people" AS person
    WHERE person."institutionId" = provision."institutionId"
      AND person."normalizedInternalId" = LOWER(COALESCE(NULLIF(BTRIM(provision."externalId"), ''), 'provision:' || provision."id"::text))
  );

-- Every existing institution member needs a person record before author
-- bindings can move from user accounts to institution people.
INSERT INTO "institution_people" (
  "id",
  "institutionId",
  "key",
  "internalId",
  "normalizedInternalId",
  "name",
  "email",
  "userId",
  "userLinkedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  membership."institutionId",
  'user:' || membership."userId"::text,
  'legacy-user:' || membership."userId"::text,
  'legacy-user:' || LOWER(membership."userId"::text),
  account."name",
  account."email",
  membership."userId",
  membership."createdAt",
  membership."createdAt",
  membership."updatedAt"
FROM "institution_memberships" AS membership
JOIN "users" AS account ON account."id" = membership."userId"
WHERE NOT EXISTS (
  SELECT 1 FROM "institution_people" AS person
  WHERE person."institutionId" = membership."institutionId"
    AND person."userId" = membership."userId"
);

ALTER TABLE "institution_people"
  ALTER COLUMN "internalId" SET NOT NULL,
  ALTER COLUMN "normalizedInternalId" SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "institution_people"
    WHERE "userId" IS NOT NULL
    GROUP BY "institutionId", "userId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple legacy person records are linked to the same institution user';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "institution_people"
    WHERE "scholarId" IS NOT NULL
    GROUP BY "institutionId", "scholarId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple legacy person records are linked to the same institution scholar';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "institution_people"
    WHERE "provisionId" IS NOT NULL
    GROUP BY "institutionId", "provisionId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Multiple legacy person records are linked to the same institution provision';
  END IF;
END $$;

DROP INDEX "institution_people_legacy_inst_user_idx";
CREATE UNIQUE INDEX "institution_people_inst_internal_id_idx" ON "institution_people"("institutionId", "normalizedInternalId");
CREATE UNIQUE INDEX "institution_people_inst_user_idx" ON "institution_people"("institutionId", "userId");
CREATE UNIQUE INDEX "institution_people_inst_scholar_idx" ON "institution_people"("institutionId", "scholarId");
CREATE UNIQUE INDEX "institution_people_inst_provision_idx" ON "institution_people"("institutionId", "provisionId");
CREATE INDEX "institution_people_is_active_idx" ON "institution_people"("is_active");

ALTER TABLE "institution_people"
  ADD CONSTRAINT "institution_people_scholarId_fkey"
  FOREIGN KEY ("scholarId") REFERENCES "scholars"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Convert author bindings to the person identity. The membership backfill above
-- guarantees a matching person for every legacy user binding.
ALTER TABLE "institution_paper_author_bindings" ADD COLUMN "personId" UUID;

UPDATE "institution_paper_author_bindings" AS binding
SET "personId" = person."id"
FROM "institution_people" AS person
WHERE person."institutionId" = binding."institutionId"
  AND person."userId" = binding."userId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "institution_paper_author_bindings"
    WHERE "personId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Could not migrate every paper author binding to an institution person';
  END IF;
END $$;

DROP INDEX "institution_paper_author_bindings_userId_idx";
DROP INDEX "inst_paper_author_bindings_inst_paper_user_uidx";
ALTER TABLE "institution_paper_author_bindings" DROP CONSTRAINT "institution_paper_author_bindings_userId_fkey";
ALTER TABLE "institution_paper_author_bindings" DROP COLUMN "userId";
ALTER TABLE "institution_paper_author_bindings" ALTER COLUMN "personId" SET NOT NULL;
ALTER TABLE "institution_paper_author_bindings"
  ADD CONSTRAINT "institution_paper_author_bindings_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "institution_people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
CREATE INDEX "institution_paper_author_bindings_personId_idx" ON "institution_paper_author_bindings"("personId");
CREATE UNIQUE INDEX "inst_paper_author_bindings_inst_paper_person_uidx"
  ON "institution_paper_author_bindings"("institutionId", "paperId", "personId");

CREATE TABLE "institution_person_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "institutionId" UUID NOT NULL,
  "personId" UUID,
  "actorUserId" UUID,
  "event_type" VARCHAR(64) NOT NULL,
  "source" VARCHAR(64) NOT NULL DEFAULT 'system',
  "paperId" UUID,
  "authorId" UUID,
  "previousUserId" UUID,
  "nextUserId" UUID,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_person_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "institution_person_events_institutionId_createdAt_idx"
  ON "institution_person_events"("institutionId", "createdAt");
CREATE INDEX "institution_person_events_personId_createdAt_idx"
  ON "institution_person_events"("personId", "createdAt");
CREATE INDEX "institution_person_events_actorUserId_createdAt_idx"
  ON "institution_person_events"("actorUserId", "createdAt");
CREATE INDEX "institution_person_events_paperId_idx"
  ON "institution_person_events"("paperId");

ALTER TABLE "institution_person_events"
  ADD CONSTRAINT "institution_person_events_institutionId_fkey"
  FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "institution_person_events"
  ADD CONSTRAINT "institution_person_events_personId_fkey"
  FOREIGN KEY ("personId") REFERENCES "institution_people"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "institution_person_events"
  ADD CONSTRAINT "institution_person_events_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "institution_person_events"
  ADD CONSTRAINT "institution_person_events_paperId_fkey"
  FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "institution_person_events"
  ADD CONSTRAINT "institution_person_events_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Legacy mapping and provision identifiers have been folded into
-- institution_people, which is now the only source of institution identity.
DROP TABLE "institution_scholar_mappings";
ALTER TABLE "institution_user_provisions" DROP COLUMN "externalId";
ALTER TABLE "institution_people" DROP COLUMN "externalId";
