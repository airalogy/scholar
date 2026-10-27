-- AlterTable
ALTER TABLE "institution_directory_people" ADD COLUMN     "sourceName" VARCHAR(100);

-- AlterTable
ALTER TABLE "institution_directory_runs" ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "content_review_tasks" ADD COLUMN     "subjectPersonId" UUID;

-- CreateTable
CREATE TABLE "institution_person_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "revision" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "personId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "startsAt" TIMESTAMP(6),
    "endsAt" TIMESTAMP(6),
    "recordedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(6),

    CONSTRAINT "institution_person_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_person_relations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "revision" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "personId" UUID NOT NULL,
    "relatedPersonId" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "startsAt" TIMESTAMP(6),
    "endsAt" TIMESTAMP(6),
    "recordedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(6),

    CONSTRAINT "institution_person_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_org_edge_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "fromNodeId" UUID NOT NULL,
    "toNodeId" UUID NOT NULL,
    "edgeType" VARCHAR(64) NOT NULL,
    "recordedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(6),

    CONSTRAINT "institution_org_edge_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_appointment_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "startsAt" TIMESTAMP(6),
    "endsAt" TIMESTAMP(6),
    "recordedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(6),

    CONSTRAINT "institution_appointment_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_directory_corrections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "field" VARCHAR(32) NOT NULL,
    "sourceValue" VARCHAR(100) NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "baselineSequence" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'requested',
    "reason" VARCHAR(2000) NOT NULL,
    "requestedBy" UUID NOT NULL,
    "approvedBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(6),
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "closedAt" TIMESTAMP(6),

    CONSTRAINT "institution_directory_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_review_routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "contentType" VARCHAR(32) NOT NULL,
    "priority" INTEGER NOT NULL,
    "identityCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nodeIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "requestKinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "workflowId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "notes" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supersededAt" TIMESTAMP(6),

    CONSTRAINT "institution_review_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institution_person_roles_institutionId_personId_supersededA_idx" ON "institution_person_roles"("institutionId", "personId", "supersededAt");

-- CreateIndex
CREATE UNIQUE INDEX "institution_person_roles_sourceId_externalId_revision_key" ON "institution_person_roles"("sourceId", "externalId", "revision");

-- CreateIndex
CREATE INDEX "institution_person_relations_institutionId_personId_superse_idx" ON "institution_person_relations"("institutionId", "personId", "supersededAt");

-- CreateIndex
CREATE UNIQUE INDEX "institution_person_relations_sourceId_externalId_revision_key" ON "institution_person_relations"("sourceId", "externalId", "revision");

-- CreateIndex
CREATE INDEX "institution_org_edge_history_institutionId_toNodeId_endedAt_idx" ON "institution_org_edge_history"("institutionId", "toNodeId", "endedAt");

-- CreateIndex
CREATE INDEX "institution_appointment_history_institutionId_personId_reco_idx" ON "institution_appointment_history"("institutionId", "personId", "recordedAt");

-- CreateIndex
CREATE INDEX "institution_directory_corrections_institutionId_status_expi_idx" ON "institution_directory_corrections"("institutionId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "institution_directory_corrections_personId_field_status_idx" ON "institution_directory_corrections"("personId", "field", "status");

-- CreateIndex
CREATE UNIQUE INDEX "institution_review_routes_workflowId_key" ON "institution_review_routes"("workflowId");

-- CreateIndex
CREATE INDEX "institution_review_routes_institutionId_contentType_superse_idx" ON "institution_review_routes"("institutionId", "contentType", "supersededAt");

-- CreateIndex
CREATE UNIQUE INDEX "institution_review_routes_institutionId_key_revision_key" ON "institution_review_routes"("institutionId", "key", "revision");

-- AddForeignKey
ALTER TABLE "institution_person_roles" ADD CONSTRAINT "institution_person_roles_sourceId_institutionId_fkey" FOREIGN KEY ("sourceId", "institutionId") REFERENCES "institution_directory_sources"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_person_roles" ADD CONSTRAINT "institution_person_roles_personId_institutionId_fkey" FOREIGN KEY ("personId", "institutionId") REFERENCES "institution_people"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_person_relations" ADD CONSTRAINT "institution_person_relations_sourceId_institutionId_fkey" FOREIGN KEY ("sourceId", "institutionId") REFERENCES "institution_directory_sources"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_person_relations" ADD CONSTRAINT "institution_person_relations_personId_institutionId_fkey" FOREIGN KEY ("personId", "institutionId") REFERENCES "institution_people"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_person_relations" ADD CONSTRAINT "institution_person_relations_relatedPersonId_institutionId_fkey" FOREIGN KEY ("relatedPersonId", "institutionId") REFERENCES "institution_people"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_org_edge_history" ADD CONSTRAINT "institution_org_edge_history_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_org_edge_history" ADD CONSTRAINT "institution_org_edge_history_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "institution_org_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_org_edge_history" ADD CONSTRAINT "institution_org_edge_history_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "institution_org_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_appointment_history" ADD CONSTRAINT "institution_appointment_history_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_appointment_history" ADD CONSTRAINT "institution_appointment_history_personId_fkey" FOREIGN KEY ("personId") REFERENCES "institution_people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_appointment_history" ADD CONSTRAINT "institution_appointment_history_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "institution_org_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_directory_corrections" ADD CONSTRAINT "institution_directory_corrections_sourceId_institutionId_fkey" FOREIGN KEY ("sourceId", "institutionId") REFERENCES "institution_directory_sources"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_directory_corrections" ADD CONSTRAINT "institution_directory_corrections_personId_institutionId_fkey" FOREIGN KEY ("personId", "institutionId") REFERENCES "institution_people"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_review_routes" ADD CONSTRAINT "institution_review_routes_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_review_routes" ADD CONSTRAINT "institution_review_routes_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "institution_review_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the existing observed baseline; unknown historical effective dates
ALTER TABLE paper_submissions ADD COLUMN "idempotencyKey" VARCHAR(128), ADD COLUMN "requestDigest" VARCHAR(64);
CREATE UNIQUE INDEX paper_submissions_userId_idempotencyKey_key ON paper_submissions ("userId", "idempotencyKey");

-- Preserve the existing observed baseline; unknown historical effective dates
-- remain NULL. These triggers also cover legacy/manual configuration writers.
UPDATE institution_directory_people d SET "sourceName" = p.name FROM institution_people p WHERE p.id = d."personId";
INSERT INTO institution_org_edge_history ("institutionId", "fromNodeId", "toNodeId", "edgeType", "recordedAt")
SELECT "institutionId", "fromNodeId", "toNodeId", edge_type, CURRENT_TIMESTAMP FROM institution_org_edges;
INSERT INTO institution_appointment_history ("institutionId", "appointmentId", "personId", "positionId", status, "startsAt", "endsAt", "recordedAt")
SELECT "institutionId", id, "personId", "positionId", status, "startsAt", "endsAt", CURRENT_TIMESTAMP FROM institution_org_appointments;

CREATE FUNCTION scholar_record_org_edge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD."fromNodeId", OLD."toNodeId", OLD.edge_type) IS NOT DISTINCT FROM (NEW."fromNodeId", NEW."toNodeId", NEW.edge_type) THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE institution_org_edge_history SET "endedAt" = CURRENT_TIMESTAMP WHERE "institutionId" = OLD."institutionId" AND "fromNodeId" = OLD."fromNodeId" AND "toNodeId" = OLD."toNodeId" AND "edgeType" = OLD.edge_type AND "endedAt" IS NULL;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO institution_org_edge_history ("institutionId", "fromNodeId", "toNodeId", "edgeType") VALUES (NEW."institutionId", NEW."fromNodeId", NEW."toNodeId", NEW.edge_type);
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER scholar_org_edge_history AFTER INSERT OR UPDATE OR DELETE ON institution_org_edges FOR EACH ROW EXECUTE FUNCTION scholar_record_org_edge();

CREATE FUNCTION scholar_record_appointment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD."personId", OLD."positionId", OLD.status, OLD."startsAt", OLD."endsAt") IS NOT DISTINCT FROM (NEW."personId", NEW."positionId", NEW.status, NEW."startsAt", NEW."endsAt") THEN RETURN NEW; END IF;
  IF TG_OP <> 'INSERT' THEN
    UPDATE institution_appointment_history SET "supersededAt" = CURRENT_TIMESTAMP WHERE "appointmentId" = OLD.id AND "supersededAt" IS NULL;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    INSERT INTO institution_appointment_history ("institutionId", "appointmentId", "personId", "positionId", status, "startsAt", "endsAt") VALUES (NEW."institutionId", NEW.id, NEW."personId", NEW."positionId", NEW.status, NEW."startsAt", NEW."endsAt");
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER scholar_appointment_history AFTER INSERT OR UPDATE OR DELETE ON institution_org_appointments FOR EACH ROW EXECUTE FUNCTION scholar_record_appointment();

CREATE UNIQUE INDEX personnel_role_current ON institution_person_roles ("sourceId", "externalId") WHERE "supersededAt" IS NULL;
CREATE UNIQUE INDEX personnel_relation_current ON institution_person_relations ("sourceId", "externalId") WHERE "supersededAt" IS NULL;
CREATE UNIQUE INDEX review_route_current ON institution_review_routes ("institutionId", key) WHERE "supersededAt" IS NULL;
CREATE UNIQUE INDEX directory_correction_open ON institution_directory_corrections ("personId", field) WHERE status IN ('requested', 'active');
ALTER TABLE institution_person_roles ADD CONSTRAINT personnel_role_interval CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt");
ALTER TABLE institution_person_relations ADD CONSTRAINT personnel_relation_interval CHECK (("startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" > "startsAt") AND "personId" <> "relatedPersonId");
ALTER TABLE institution_directory_corrections ADD CONSTRAINT directory_correction_contract CHECK (field IN ('name', 'admission') AND (field <> 'admission' OR value = 'allow') AND "expiresAt" > "createdAt" AND ("approvedBy" IS NULL OR "approvedBy" <> "requestedBy"));
ALTER TABLE institution_reviewer_grants DROP CONSTRAINT reviewer_grant_validity;
ALTER TABLE institution_reviewer_grants ADD CONSTRAINT reviewer_grant_validity CHECK (
  role IN ('library_intake', 'department', 'library_final', 'supervisor', 'responsible') AND ("endsAt" IS NULL OR "endsAt" > "startsAt")
  AND (role <> 'department' OR "nodeId" IS NOT NULL));

-- Revision facts are immutable; only observation sequence and retirement may advance.
CREATE FUNCTION scholar_preserve_personnel_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'sequence' - 'supersededAt') IS DISTINCT FROM (to_jsonb(OLD) - 'sequence' - 'supersededAt')
    OR NEW.sequence < OLD.sequence
    OR (OLD."supersededAt" IS NOT NULL AND NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt") THEN
    RAISE EXCEPTION 'Personnel revisions are immutable; create a new revision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scholar_person_role_revision BEFORE UPDATE ON institution_person_roles FOR EACH ROW EXECUTE FUNCTION scholar_preserve_personnel_revision();
CREATE TRIGGER scholar_person_relation_revision BEFORE UPDATE ON institution_person_relations FOR EACH ROW EXECUTE FUNCTION scholar_preserve_personnel_revision();

CREATE FUNCTION scholar_preserve_route_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'supersededAt') IS DISTINCT FROM (to_jsonb(OLD) - 'supersededAt')
    OR (OLD."supersededAt" IS NOT NULL AND NEW."supersededAt" IS DISTINCT FROM OLD."supersededAt") THEN
    RAISE EXCEPTION 'Review route revisions are immutable; create a new revision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER scholar_review_route_revision BEFORE UPDATE ON institution_review_routes FOR EACH ROW EXECUTE FUNCTION scholar_preserve_route_revision();

ALTER TABLE institution_directory_runs
  ADD COLUMN "endedIdentityCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "endedRelationshipCount" INTEGER NOT NULL DEFAULT 0;
