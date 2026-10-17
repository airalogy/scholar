-- DropIndex
DROP INDEX "content_review_steps_case_order_idx";

-- AlterTable
ALTER TABLE "content_review_actions" ADD COLUMN     "roundNumber" INTEGER,
ADD COLUMN     "taskId" UUID;

-- AlterTable
ALTER TABLE "content_review_cases" ADD COLUMN     "currentRound" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "content_review_step_instances" ADD COLUMN     "roundNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "institution_api_credentials" ADD COLUMN     "directorySourceId" UUID;

-- AlterTable
ALTER TABLE "institution_org_appointments" ADD COLUMN     "directorySourceId" UUID;

-- AlterTable
ALTER TABLE "institution_org_nodes" ADD COLUMN     "directorySourceId" UUID;

-- AlterTable
ALTER TABLE "institution_org_positions" ADD COLUMN     "directorySourceId" UUID;

-- AlterTable
ALTER TABLE "institution_people" ADD COLUMN     "lifecycle_status" VARCHAR(32) NOT NULL DEFAULT 'active',
ADD COLUMN     "manually_suspended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "personnel_category" VARCHAR(32) NOT NULL DEFAULT 'unknown';

-- CreateTable
CREATE TABLE "institution_directory_policies" (
    "institutionId" UUID NOT NULL,
    "admissionMode" VARCHAR(32) NOT NULL DEFAULT 'sso',
    "requireAppointment" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" UUID NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_directory_policies_pkey" PRIMARY KEY ("institutionId")
);

-- CreateTable
CREATE TABLE "institution_directory_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "authoritative" BOOLEAN NOT NULL DEFAULT false,
    "deactivateMissing" BOOLEAN NOT NULL DEFAULT false,
    "maxDeactivationPercent" INTEGER NOT NULL DEFAULT 10,
    "expectedIntervalHours" INTEGER NOT NULL DEFAULT 24,
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "lastAppliedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_directory_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_directory_people" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "personId" UUID NOT NULL,
    "lastSeenSequence" INTEGER NOT NULL,

    CONSTRAINT "institution_directory_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_directory_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "sequence" INTEGER NOT NULL,
    "mode" VARCHAR(16) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'staging',
    "expectedPages" INTEGER NOT NULL,
    "expectedRows" INTEGER NOT NULL,
    "actorUserId" UUID,
    "credentialId" UUID,
    "appliedBy" UUID,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "deactivatedCount" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(2000),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validatedAt" TIMESTAMP(6),
    "appliedAt" TIMESTAMP(6),

    CONSTRAINT "institution_directory_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_directory_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "runId" UUID NOT NULL,
    "page" INTEGER NOT NULL,
    "digest" VARCHAR(64) NOT NULL,
    "rowCount" INTEGER NOT NULL,

    CONSTRAINT "institution_directory_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_directory_rows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "runId" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "previousSnapshot" JSONB,
    "outcome" VARCHAR(32) NOT NULL DEFAULT 'staged',
    "error" VARCHAR(1000),

    CONSTRAINT "institution_directory_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_reviewer_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "personId" UUID NOT NULL,
    "role" VARCHAR(32) NOT NULL,
    "nodeId" UUID,
    "startsAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(6),
    "grantedBy" UUID NOT NULL,
    "revokedAt" TIMESTAMP(6),
    "revokedBy" UUID,
    "notes" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_reviewer_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_review_rounds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "versionId" UUID,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending_review',
    "materialSnapshot" JSONB NOT NULL,
    "workflowSnapshot" JSONB NOT NULL,
    "materialDigest" VARCHAR(64) NOT NULL,
    "executionStatus" VARCHAR(32) NOT NULL DEFAULT 'awaiting_approval',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(6),

    CONSTRAINT "content_review_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_review_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "stepId" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "role" VARCHAR(32),
    "personId" UUID,
    "nodeId" UUID,
    "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
    "exception" VARCHAR(500),
    "assignedPersonId" UUID,
    "completedBy" UUID,
    "completedAt" TIMESTAMP(6),
    "dueAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_review_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_inbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "taskId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "eventType" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(6),
    "leaseToken" UUID,
    "deliveredAt" TIMESTAMP(6),
    "error" VARCHAR(500),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_inbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institution_directory_sources_id_institutionId_key" ON "institution_directory_sources"("id", "institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_directory_sources_institutionId_key_key" ON "institution_directory_sources"("institutionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "institution_directory_people_personId_key" ON "institution_directory_people"("personId");

-- CreateIndex
CREATE INDEX "institution_directory_people_sourceId_lastSeenSequence_idx" ON "institution_directory_people"("sourceId", "lastSeenSequence");

-- CreateIndex
CREATE UNIQUE INDEX "institution_directory_people_sourceId_externalId_key" ON "institution_directory_people"("sourceId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_directory_people_personId_institutionId_key" ON "institution_directory_people"("personId", "institutionId");

-- CreateIndex
CREATE INDEX "institution_directory_runs_institutionId_createdAt_idx" ON "institution_directory_runs"("institutionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "institution_directory_runs_sourceId_idempotencyKey_key" ON "institution_directory_runs"("sourceId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "institution_directory_runs_sourceId_sequence_key" ON "institution_directory_runs"("sourceId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "institution_directory_pages_runId_page_key" ON "institution_directory_pages"("runId", "page");

-- CreateIndex
CREATE INDEX "institution_directory_rows_runId_outcome_idx" ON "institution_directory_rows"("runId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "institution_directory_rows_runId_kind_externalId_key" ON "institution_directory_rows"("runId", "kind", "externalId");

-- CreateIndex
CREATE INDEX "institution_reviewer_grants_institutionId_role_nodeId_idx" ON "institution_reviewer_grants"("institutionId", "role", "nodeId");

-- CreateIndex
CREATE INDEX "institution_reviewer_grants_personId_revokedAt_idx" ON "institution_reviewer_grants"("personId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "content_review_rounds_caseId_number_key" ON "content_review_rounds"("caseId", "number");

-- CreateIndex
CREATE INDEX "content_review_tasks_stepId_status_idx" ON "content_review_tasks"("stepId", "status");

-- CreateIndex
CREATE INDEX "content_review_tasks_personId_status_idx" ON "content_review_tasks"("personId", "status");

-- CreateIndex
CREATE INDEX "content_review_tasks_assignedPersonId_status_idx" ON "content_review_tasks"("assignedPersonId", "status");

-- CreateIndex
CREATE INDEX "review_inbox_events_status_availableAt_idx" ON "review_inbox_events"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_inbox_events_taskId_sequence_key" ON "review_inbox_events"("taskId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "content_review_steps_case_round_order_idx" ON "content_review_step_instances"("caseId", "roundNumber", "step_order");

-- AddForeignKey
ALTER TABLE "institution_directory_policies" ADD CONSTRAINT "institution_directory_policies_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_directory_sources" ADD CONSTRAINT "institution_directory_sources_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_directory_people" ADD CONSTRAINT "institution_directory_people_sourceId_institutionId_fkey" FOREIGN KEY ("sourceId", "institutionId") REFERENCES "institution_directory_sources"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_directory_people" ADD CONSTRAINT "institution_directory_people_personId_institutionId_fkey" FOREIGN KEY ("personId", "institutionId") REFERENCES "institution_people"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_directory_runs" ADD CONSTRAINT "institution_directory_runs_sourceId_institutionId_fkey" FOREIGN KEY ("sourceId", "institutionId") REFERENCES "institution_directory_sources"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_directory_pages" ADD CONSTRAINT "institution_directory_pages_runId_fkey" FOREIGN KEY ("runId") REFERENCES "institution_directory_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_directory_rows" ADD CONSTRAINT "institution_directory_rows_runId_fkey" FOREIGN KEY ("runId") REFERENCES "institution_directory_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_reviewer_grants" ADD CONSTRAINT "institution_reviewer_grants_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_reviewer_grants" ADD CONSTRAINT "institution_reviewer_grants_personId_institutionId_fkey" FOREIGN KEY ("personId", "institutionId") REFERENCES "institution_people"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_api_credentials" ADD CONSTRAINT "institution_api_credentials_directorySourceId_institutionI_fkey" FOREIGN KEY ("directorySourceId", "institutionId") REFERENCES "institution_directory_sources"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_org_nodes" ADD CONSTRAINT "institution_org_nodes_directorySourceId_institutionId_fkey" FOREIGN KEY ("directorySourceId", "institutionId") REFERENCES "institution_directory_sources"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_org_positions" ADD CONSTRAINT "institution_org_positions_directorySourceId_institutionId_fkey" FOREIGN KEY ("directorySourceId", "institutionId") REFERENCES "institution_directory_sources"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_org_appointments" ADD CONSTRAINT "institution_org_appointments_directorySourceId_institution_fkey" FOREIGN KEY ("directorySourceId", "institutionId") REFERENCES "institution_directory_sources"("id", "institutionId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_review_rounds" ADD CONSTRAINT "content_review_rounds_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "content_review_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_review_tasks" ADD CONSTRAINT "content_review_tasks_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "content_review_step_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_inbox_events" ADD CONSTRAINT "review_inbox_events_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "content_review_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Preserve every current legacy case and step before installing the round FK.
-- Older decisions remain in content_review_actions; unavailable historical
-- material is not fabricated into new rounds.
INSERT INTO content_review_rounds
  ("caseId", number, "versionId", status, "materialSnapshot", "workflowSnapshot", "materialDigest", "executionStatus", "createdAt", "completedAt")
SELECT c.id, 1, c."currentVersionId", c.status,
  COALESCE(to_jsonb(v), to_jsonb(s), jsonb_build_object('legacy', true, 'versionId', c."currentVersionId")),
  jsonb_build_object('legacy', true, 'workflowId', c."workflowId", 'steps',
    COALESCE((SELECT jsonb_agg(to_jsonb(st) ORDER BY st.step_order) FROM content_review_step_instances st WHERE st."caseId" = c.id), '[]'::jsonb)),
  encode(sha256(convert_to(COALESCE(to_jsonb(v), to_jsonb(s), '{}'::jsonb)::text, 'UTF8')), 'hex'),
  CASE WHEN c.status = 'approved' THEN 'applied' ELSE 'awaiting_approval' END,
  COALESCE(c."submittedAt", c."createdAt"), c."decidedAt"
FROM content_review_cases c
LEFT JOIN degree_thesis_versions v ON c.content_type = 'degree_thesis' AND v.id = c."currentVersionId"
LEFT JOIN paper_submissions s ON c.content_type = 'paper' AND s.id = c."currentVersionId";

UPDATE content_review_cases SET "currentRound" = 1;
UPDATE content_review_actions a SET "roundNumber" = 1
FROM content_review_cases c WHERE a."caseId" = c.id AND a."versionId" IS NOT DISTINCT FROM c."currentVersionId";
UPDATE institution_people SET lifecycle_status = 'departed' WHERE NOT is_active;

DO $$ BEGIN
  IF (SELECT count(*) FROM content_review_cases) <> (SELECT count(*) FROM content_review_rounds) THEN
    RAISE EXCEPTION 'Review migration did not preserve every case';
  END IF;
END $$;

ALTER TABLE "content_review_step_instances" ADD CONSTRAINT "content_review_step_instances_caseId_roundNumber_fkey" FOREIGN KEY ("caseId", "roundNumber") REFERENCES "content_review_rounds"("caseId", "number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "content_review_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE institution_directory_policies ADD CONSTRAINT directory_admission_mode CHECK ("admissionMode" IN ('sso', 'directory'));
ALTER TABLE institution_directory_sources ADD CONSTRAINT directory_source_limits CHECK (
  "maxDeactivationPercent" BETWEEN 0 AND 100 AND "expectedIntervalHours" BETWEEN 1 AND 720
  AND (NOT "deactivateMissing" OR authoritative));
ALTER TABLE institution_directory_runs ADD CONSTRAINT directory_run_limits CHECK (
  sequence > 0 AND mode IN ('full', 'incremental') AND "expectedPages" BETWEEN 1 AND 1000 AND "expectedRows" BETWEEN 0 AND 100000);
ALTER TABLE institution_people ADD CONSTRAINT personnel_lifecycle CHECK (lifecycle_status IN ('active', 'departed', 'graduated', 'suspended'));
ALTER TABLE institution_reviewer_grants ADD CONSTRAINT reviewer_grant_validity CHECK (
  role IN ('library_intake', 'department', 'library_final') AND ("endsAt" IS NULL OR "endsAt" > "startsAt")
  AND (role <> 'department' OR "nodeId" IS NOT NULL));

CREATE FUNCTION guard_review_round_material() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR NEW."caseId" <> OLD."caseId" OR NEW.number <> OLD.number
    OR NEW."versionId" IS DISTINCT FROM OLD."versionId"
    OR NEW."materialSnapshot" <> OLD."materialSnapshot"
    OR NEW."workflowSnapshot" <> OLD."workflowSnapshot"
    OR NEW."materialDigest" <> OLD."materialDigest" THEN
    RAISE EXCEPTION 'Review round evidence is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER review_round_material_immutable BEFORE UPDATE OR DELETE ON content_review_rounds
  FOR EACH ROW EXECUTE FUNCTION guard_review_round_material();

ALTER TABLE institution_identity_challenges ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'account_link';
ALTER TABLE institution_identity_requests ADD COLUMN purpose VARCHAR(32) NOT NULL DEFAULT 'account_link';
ALTER TABLE institution_reviewer_grants ADD COLUMN "appointmentIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
CREATE TABLE content_review_participant_scopes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL REFERENCES content_review_cases(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "versionId" UUID NOT NULL,
  "personIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "nodeIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "verifiedBy" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes VARCHAR(2000) NOT NULL,
  "verifiedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "content_review_participant_scopes_caseId_versionId_key" ON content_review_participant_scopes("caseId", "versionId");

CREATE FUNCTION guard_submitted_review_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM content_review_rounds WHERE "versionId" = OLD.id) THEN
    IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'updatedAt' - 'submittedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'updatedAt' - 'submittedAt') THEN
      RAISE EXCEPTION 'Submitted review material is immutable; create a new version';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER paper_review_version_immutable BEFORE UPDATE OR DELETE ON paper_submissions
  FOR EACH ROW EXECUTE FUNCTION guard_submitted_review_version();
CREATE TRIGGER thesis_review_version_immutable BEFORE UPDATE OR DELETE ON degree_thesis_versions
  FOR EACH ROW EXECUTE FUNCTION guard_submitted_review_version();

ALTER TABLE paper_claims ADD COLUMN "fullTextRestricted" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE content_review_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "caseId" UUID NOT NULL REFERENCES content_review_cases(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "institutionId" UUID NOT NULL,
  "submittedBy" UUID NOT NULL,
  "idempotencyKey" VARCHAR(128) NOT NULL,
  "subjectType" VARCHAR(32) NOT NULL CHECK ("subjectType" IN ('paper', 'degree_thesis')),
  "subjectId" UUID NOT NULL,
  kind VARCHAR(32) NOT NULL CHECK (kind IN ('metadata', 'attribution', 'access', 'institutional_withdrawal', 'bibliography')),
  payload JSONB NOT NULL,
  "beforeSnapshot" JSONB NOT NULL,
  "baseFingerprint" VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'awaiting_approval',
  error VARCHAR(500),
  "appliedAt" TIMESTAMP(6),
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "content_review_changes_caseId_key" ON content_review_changes("caseId");
CREATE UNIQUE INDEX "content_review_changes_institutionId_submittedBy_idempotenc_key" ON content_review_changes("institutionId", "submittedBy", "idempotencyKey");
CREATE INDEX "content_review_changes_status_createdAt_idx" ON content_review_changes(status, "createdAt");
CREATE FUNCTION guard_review_change_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'status' - 'error' - 'appliedAt') IS DISTINCT FROM (to_jsonb(OLD) - 'status' - 'error' - 'appliedAt') THEN
    RAISE EXCEPTION 'Change proposal is immutable; submit a new proposal';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER change_review_version_immutable BEFORE UPDATE OR DELETE ON content_review_changes
  FOR EACH ROW EXECUTE FUNCTION guard_review_change_payload();
ALTER TABLE institution_org_nodes ADD COLUMN "directorySequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE institution_org_positions ADD COLUMN "directorySequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE institution_org_appointments ADD COLUMN "directorySequence" INTEGER NOT NULL DEFAULT 0;
