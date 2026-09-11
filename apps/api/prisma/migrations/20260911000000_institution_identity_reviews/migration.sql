-- CreateTable
CREATE TABLE "institution_person_identifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "normalizedValue" VARCHAR(100) NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_person_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_identity_challenges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "internalId" VARCHAR(100) NOT NULL,
    "normalizedId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_identity_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_identity_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "internalId" VARCHAR(100) NOT NULL,
    "normalizedId" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "previousInternalId" VARCHAR(100) NOT NULL,
    "explanation" VARCHAR(2000) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "personId" UUID,
    "applicantMessage" VARCHAR(1000),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(6),

    CONSTRAINT "institution_identity_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_identity_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "personId" UUID,
    "identifierId" UUID,
    "requestId" UUID,
    "actorUserId" UUID,
    "action" VARCHAR(40) NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_identity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institution_person_identifiers_personId_institutionId_idx" ON "institution_person_identifiers"("personId", "institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_identifiers_value_idx" ON "institution_person_identifiers"("institutionId", "normalizedValue");

-- CreateIndex
CREATE UNIQUE INDEX "institution_identifiers_primary_idx" ON "institution_person_identifiers"("personId") WHERE ("isPrimary" = true);

-- CreateIndex
CREATE UNIQUE INDEX "institution_identity_challenges_tokenHash_key" ON "institution_identity_challenges"("tokenHash");

-- CreateIndex
CREATE INDEX "institution_identity_challenges_expiresAt_idx" ON "institution_identity_challenges"("expiresAt");

-- CreateIndex
CREATE INDEX "institution_identity_challenges_institutionId_provider_norm_idx" ON "institution_identity_challenges"("institutionId", "provider", "normalizedId");

-- CreateIndex
CREATE INDEX "institution_identity_requests_institutionId_status_createdA_idx" ON "institution_identity_requests"("institutionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "institution_identity_requests_institutionId_provider_normal_idx" ON "institution_identity_requests"("institutionId", "provider", "normalizedId", "createdAt");

-- CreateIndex
CREATE INDEX "institution_identity_requests_personId_institutionId_idx" ON "institution_identity_requests"("personId", "institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_identity_requests_open_idx" ON "institution_identity_requests"("institutionId", "provider", "normalizedId") WHERE (status IN ('pending', 'needs_information'));

-- CreateIndex
CREATE INDEX "institution_identity_events_institutionId_createdAt_idx" ON "institution_identity_events"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "institution_identity_events_personId_institutionId_idx" ON "institution_identity_events"("personId", "institutionId");

-- CreateIndex
CREATE INDEX "institution_identity_events_identifierId_idx" ON "institution_identity_events"("identifierId");

-- CreateIndex
CREATE INDEX "institution_identity_events_requestId_idx" ON "institution_identity_events"("requestId");

-- CreateIndex
CREATE INDEX "institution_identity_events_actorUserId_idx" ON "institution_identity_events"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_people_id_institution_idx" ON "institution_people"("id", "institutionId");

-- AddForeignKey
ALTER TABLE "institution_person_identifiers" ADD CONSTRAINT "institution_person_identifiers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_person_identifiers" ADD CONSTRAINT "institution_person_identifiers_personId_institutionId_fkey" FOREIGN KEY ("personId", "institutionId") REFERENCES "institution_people"("id", "institutionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_identity_challenges" ADD CONSTRAINT "institution_identity_challenges_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_identity_requests" ADD CONSTRAINT "institution_identity_requests_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_identity_requests" ADD CONSTRAINT "institution_identity_requests_personId_institutionId_fkey" FOREIGN KEY ("personId", "institutionId") REFERENCES "institution_people"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_identity_events" ADD CONSTRAINT "institution_identity_events_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_identity_events" ADD CONSTRAINT "institution_identity_events_personId_institutionId_fkey" FOREIGN KEY ("personId", "institutionId") REFERENCES "institution_people"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_identity_events" ADD CONSTRAINT "institution_identity_events_identifierId_fkey" FOREIGN KEY ("identifierId") REFERENCES "institution_person_identifiers"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_identity_events" ADD CONSTRAINT "institution_identity_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "institution_identity_requests"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_identity_events" ADD CONSTRAINT "institution_identity_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Keep canonical IDs reserved in the same namespace as aliases. This trigger
-- also covers bootstrap and private importers that insert people directly.
ALTER TABLE "institution_person_identifiers" ADD CONSTRAINT "institution_identifiers_nonempty"
  CHECK (length(btrim("value")) > 0 AND "normalizedValue" = lower(btrim("value")) AND "version" > 0);
ALTER TABLE "institution_identity_requests" ADD CONSTRAINT "institution_identity_requests_status"
  CHECK (status IN ('pending', 'needs_information', 'approved', 'rejected'));

INSERT INTO "institution_person_identifiers"
  ("institutionId", "personId", "value", "normalizedValue", "isPrimary", source)
SELECT "institutionId", id, "internalId", "normalizedInternalId", true, 'canonical'
FROM institution_people;

CREATE FUNCTION sync_institution_primary_identifier() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('institution-identity:' || NEW."institutionId"::text, 0));
  IF TG_OP = 'UPDATE' AND NEW."normalizedInternalId" = OLD."normalizedInternalId" THEN
    UPDATE institution_person_identifiers SET value = NEW."internalId"
      WHERE "personId" = NEW.id AND "isPrimary";
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM institution_person_identifiers
    WHERE "institutionId" = NEW."institutionId" AND "normalizedValue" = NEW."normalizedInternalId"
      AND ("personId" <> NEW.id OR "revokedAt" IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Institution identifier is already reserved' USING ERRCODE = '23505';
  END IF;
  UPDATE institution_person_identifiers
    SET "isPrimary" = false, "revokedAt" = CURRENT_TIMESTAMP, version = version + 1, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "personId" = NEW.id AND "isPrimary";
  INSERT INTO institution_person_identifiers
    ("institutionId", "personId", value, "normalizedValue", "isPrimary", source)
    VALUES (NEW."institutionId", NEW.id, NEW."internalId", NEW."normalizedInternalId", true, 'canonical')
    ON CONFLICT ("institutionId", "normalizedValue") DO UPDATE
      SET "isPrimary" = true, value = EXCLUDED.value, "updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END $$;

CREATE TRIGGER institution_primary_identifier_sync
  AFTER INSERT OR UPDATE OF "internalId", "normalizedInternalId" ON institution_people
  FOR EACH ROW EXECUTE FUNCTION sync_institution_primary_identifier();

DO $$
BEGIN
  IF (SELECT count(*) FROM institution_people) <>
     (SELECT count(*) FROM institution_person_identifiers WHERE "isPrimary") THEN
    RAISE EXCEPTION 'Institution identifier migration did not preserve all people';
  END IF;
END $$;
