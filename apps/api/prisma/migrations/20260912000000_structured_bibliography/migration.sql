-- AlterTable
ALTER TABLE authors ALTER COLUMN name TYPE VARCHAR(500);

-- AlterTable
ALTER TABLE "institution_data_import_items" ADD COLUMN     "baseFingerprint" VARCHAR(64),
ADD COLUMN     "previewChanges" JSONB,
ADD COLUMN     "resolvedPaperId" UUID,
ADD COLUMN     "decidedAt" TIMESTAMP(6),
ADD COLUMN     "decision" VARCHAR(32),
ADD COLUMN     "decisionNotes" TEXT,
ADD COLUMN     "sourceRow" INTEGER;

-- AlterTable
ALTER TABLE "institution_data_imports" ADD COLUMN     "appliedAt" TIMESTAMP(6),
ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "processingToken" UUID,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(6),
ADD COLUMN     "sourceName" VARCHAR(255);

CREATE TABLE institution_data_import_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" UUID NOT NULL REFERENCES institution_data_import_items(id) ON DELETE CASCADE ON UPDATE CASCADE,
  decision VARCHAR(32) NOT NULL CHECK (decision IN ('submitted', 'applied', 'applied_pending_content_review', 'rejected')),
  notes TEXT,
  "actorType" VARCHAR(16) NOT NULL CHECK ("actorType" IN ('user', 'integration')),
  "actorUserId" UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  "credentialId" UUID REFERENCES institution_api_credentials(id) ON DELETE SET NULL ON UPDATE CASCADE,
  "actorScopes" VARCHAR[] NOT NULL DEFAULT ARRAY[]::VARCHAR[],
  "sourceIp" VARCHAR(128),
  "userAgent" VARCHAR(1000),
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "institution_data_import_decisions_itemId_createdAt_idx" ON institution_data_import_decisions("itemId", "createdAt");
CREATE INDEX "institution_data_import_decisions_actorUserId_idx" ON institution_data_import_decisions("actorUserId");
CREATE INDEX "institution_data_import_decisions_credentialId_idx" ON institution_data_import_decisions("credentialId");

-- AlterTable
ALTER TABLE "paper_authors" ADD COLUMN     "contributor_type" VARCHAR(16) NOT NULL DEFAULT 'person',
ADD COLUMN     "corresponding" BOOLEAN,
ADD COLUMN     "display_name" VARCHAR(500),
ADD COLUMN     "equal_contribution" BOOLEAN,
ADD COLUMN     "orcid" VARCHAR(64),
ADD COLUMN     "order_verified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source" VARCHAR(32) NOT NULL DEFAULT 'legacy',
ADD COLUMN     "source_key" VARCHAR(200);

-- AlterTable
ALTER TABLE "papers" ADD COLUMN     "bibliography_revision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "document_type" VARCHAR(64),
ADD COLUMN     "journal_id" UUID,
ADD COLUMN     "language_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "publication_status" VARCHAR(32),
ALTER COLUMN "doi" DROP NOT NULL,
ALTER COLUMN "doi" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "normalized_doi" DROP NOT NULL,
ALTER COLUMN "normalized_doi" SET DATA TYPE VARCHAR(200),
ALTER COLUMN "journal_name" SET DATA TYPE VARCHAR(500);

-- CreateTable
CREATE TABLE "paper_titles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "language" VARCHAR(64) NOT NULL,
    "kind" VARCHAR(32) NOT NULL DEFAULT 'original',
    "title" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "source" VARCHAR(255) NOT NULL,

    CONSTRAINT "paper_titles_pkey" PRIMARY KEY ("id")
);

ALTER TABLE scholar_research_period_papers ALTER COLUMN doi_snapshot DROP NOT NULL;
ALTER TABLE scholar_research_timeline_issues ALTER COLUMN doi DROP NOT NULL, ALTER COLUMN doi DROP DEFAULT;
UPDATE scholar_research_period_papers SET doi_snapshot = NULL WHERE btrim(doi_snapshot) = '';
UPDATE scholar_research_timeline_issues SET doi = NULL WHERE btrim(doi) = '';

-- CreateTable
CREATE TABLE "paper_identifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "scheme" VARCHAR(64) NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "normalized_value" VARCHAR(500) NOT NULL,
    "source" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(500) NOT NULL,
    "publisher" VARCHAR(500),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_identifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journalId" UUID NOT NULL,
    "scheme" VARCHAR(32) NOT NULL,
    "value" VARCHAR(32) NOT NULL,

    CONSTRAINT "journal_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_names" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journalId" UUID NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "normalized_name" VARCHAR(500) NOT NULL,
    "start_year" INTEGER,
    "end_year" INTEGER,

    CONSTRAINT "journal_names_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bibliometric_editions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "system" VARCHAR(32) NOT NULL,
    "version" VARCHAR(100) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "content_revision" INTEGER NOT NULL DEFAULT 0,
    "metric_year" INTEGER,
    "released_on" DATE,
    "observed_on" DATE,
    "source" VARCHAR(255) NOT NULL,
    "source_url" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(6),

    CONSTRAINT "bibliometric_editions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE bibliometric_edition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "editionId" UUID NOT NULL REFERENCES bibliometric_editions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorUserId" UUID REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  action VARCHAR(32) NOT NULL,
  notes TEXT NOT NULL,
  changes JSONB,
  "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "bibliometric_edition_events_editionId_createdAt_idx" ON bibliometric_edition_events("editionId", "createdAt");
CREATE INDEX "bibliometric_edition_events_actorUserId_idx" ON bibliometric_edition_events("actorUserId");

-- CreateTable
CREATE TABLE "journal_rankings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journalId" UUID NOT NULL,
    "editionId" UUID NOT NULL,
    "category_level" VARCHAR(32) NOT NULL,
    "category" VARCHAR(500) NOT NULL,
    "metric" VARCHAR(32) NOT NULL,
    "quartile" SMALLINT,
    "is_top" BOOLEAN,
    "source" VARCHAR(255) NOT NULL,

    CONSTRAINT "journal_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_indicators" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "editionId" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "category" VARCHAR(255) NOT NULL DEFAULT '',
    "value" BOOLEAN NOT NULL,
    "source" VARCHAR(255) NOT NULL,

    CONSTRAINT "paper_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_affiliations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "source_key" VARCHAR(200) NOT NULL,
    "raw_name" TEXT NOT NULL,
    "organization_name" VARCHAR(500),
    "department" VARCHAR(500),
    "country_code" VARCHAR(2),
    "ror_id" VARCHAR(100),
    "source" VARCHAR(255) NOT NULL,

    CONSTRAINT "paper_affiliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_author_affiliations" (
    "paperId" UUID NOT NULL,
    "authorshipId" INTEGER NOT NULL,
    "affiliationId" UUID NOT NULL,

    CONSTRAINT "paper_author_affiliations_pkey" PRIMARY KEY ("authorshipId","affiliationId")
);

-- CreateTable
CREATE TABLE "paper_funding" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "source_key" VARCHAR(200) NOT NULL,
    "funder_name" TEXT,
    "funder_identifier" VARCHAR(255),
    "award_number" VARCHAR(255),
    "raw_text" TEXT NOT NULL,
    "source" VARCHAR(255) NOT NULL,

    CONSTRAINT "paper_funding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "provider" VARCHAR(64) NOT NULL,
    "external_id" VARCHAR(500),
    "collected_on" DATE,
    "first_seen_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_paper_metadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "owning_units" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secondary_units" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "signature_type" VARCHAR(100),
    "reported_affiliation_count" INTEGER,
    "source_author_order" TEXT,
    "cooperation_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cooperation_description" TEXT,
    "source" VARCHAR(255) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "custom_fields" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "institution_paper_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_paper_field_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "label_en" VARCHAR(200),
    "field_type" VARCHAR(32) NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "min_value" DOUBLE PRECISION,
    "max_value" DOUBLE PRECISION,
    "max_length" INTEGER NOT NULL DEFAULT 10000,
    "min_date" DATE,
    "max_date" DATE,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibility" VARCHAR(16) NOT NULL DEFAULT 'admin',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_paper_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_data_import_issues" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "itemId" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "severity" VARCHAR(16) NOT NULL,
    "field" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "incoming_value" TEXT,
    "existing_value" TEXT,
    "resolution" VARCHAR(32),
    "resolvedAt" TIMESTAMP(6),

    CONSTRAINT "institution_data_import_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_metadata_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "importItemId" UUID,
    "actorUserId" UUID,
    "action" VARCHAR(32) NOT NULL,
    "source" VARCHAR(255) NOT NULL,
    "before_snapshot" JSONB,
    "after_snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_metadata_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_index_jobs" (
    "paperId" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'queued',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(6),
    "leaseOwner" VARCHAR(64),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_index_jobs_pkey" PRIMARY KEY ("paperId")
);

-- CreateIndex
CREATE UNIQUE INDEX "paper_titles_paperId_language_kind_key" ON "paper_titles"("paperId", "language", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "paper_titles_one_primary" ON "paper_titles"("paperId") WHERE (is_primary);

-- CreateIndex
CREATE INDEX "paper_identifiers_paperId_idx" ON "paper_identifiers"("paperId");

-- CreateIndex
CREATE UNIQUE INDEX "paper_identifiers_scheme_normalized_value_key" ON "paper_identifiers"("scheme", "normalized_value");

-- CreateIndex
CREATE UNIQUE INDEX "paper_identifiers_one_doi" ON "paper_identifiers"("paperId") WHERE (scheme = 'doi');

-- CreateIndex
CREATE INDEX "journal_identifiers_journalId_idx" ON "journal_identifiers"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_identifiers_scheme_value_key" ON "journal_identifiers"("scheme", "value");

-- CreateIndex
CREATE INDEX "journal_names_normalized_name_idx" ON "journal_names"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "journal_names_journalId_normalized_name_key" ON "journal_names"("journalId", "normalized_name");

-- CreateIndex
CREATE INDEX "bibliometric_editions_system_status_released_on_idx" ON "bibliometric_editions"("system", "status", "released_on");

-- CreateIndex
CREATE UNIQUE INDEX "bibliometric_editions_system_version_revision_key" ON "bibliometric_editions"("system", "version", "revision");

-- CreateIndex
CREATE INDEX "journal_rankings_editionId_idx" ON "journal_rankings"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_rankings_identity" ON "journal_rankings"("journalId", "editionId", "category_level", "category", "metric");

-- CreateIndex
CREATE INDEX "paper_indicators_editionId_idx" ON "paper_indicators"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "paper_indicators_paperId_editionId_kind_category_key" ON "paper_indicators"("paperId", "editionId", "kind", "category");

-- CreateIndex
CREATE UNIQUE INDEX "paper_affiliations_paperId_source_key_key" ON "paper_affiliations"("paperId", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "paper_affiliations_id_paperId_key" ON "paper_affiliations"("id", "paperId");

-- CreateIndex
CREATE INDEX "paper_author_affiliations_affiliationId_paperId_idx" ON "paper_author_affiliations"("affiliationId", "paperId");

-- CreateIndex
CREATE UNIQUE INDEX "paper_funding_paperId_source_key_key" ON "paper_funding"("paperId", "source_key");

-- CreateIndex
CREATE INDEX "paper_sources_paperId_idx" ON "paper_sources"("paperId");

-- CreateIndex
CREATE UNIQUE INDEX "paper_sources_institutionId_paperId_provider_key" ON "paper_sources"("institutionId", "paperId", "provider");

-- CreateIndex
CREATE INDEX "institution_paper_metadata_paperId_idx" ON "institution_paper_metadata"("paperId");

-- CreateIndex
CREATE INDEX "institution_paper_metadata_custom_fields_idx" ON "institution_paper_metadata" USING GIN ("custom_fields");

-- CreateIndex
CREATE UNIQUE INDEX "institution_paper_metadata_institutionId_paperId_key" ON "institution_paper_metadata"("institutionId", "paperId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_paper_field_definitions_institutionId_key_key" ON "institution_paper_field_definitions"("institutionId", "key");

-- CreateIndex
CREATE INDEX "institution_data_import_issues_itemId_severity_idx" ON "institution_data_import_issues"("itemId", "severity");

-- CreateIndex
CREATE INDEX "paper_metadata_events_paperId_createdAt_idx" ON "paper_metadata_events"("paperId", "createdAt");

-- CreateIndex
CREATE INDEX "paper_metadata_events_importItemId_idx" ON "paper_metadata_events"("importItemId");

-- CreateIndex
CREATE INDEX "paper_metadata_events_actorUserId_idx" ON "paper_metadata_events"("actorUserId");

-- CreateIndex
CREATE INDEX "paper_index_jobs_status_availableAt_idx" ON "paper_index_jobs"("status", "availableAt");

-- CreateIndex
CREATE UNIQUE INDEX "paper_authors_paperId_source_key_key" ON "paper_authors"("paperId", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "paper_authors_id_paperId_key" ON "paper_authors"("id", "paperId");

-- CreateIndex
CREATE INDEX "papers_journal_id_idx" ON "papers"("journal_id");

-- AddForeignKey
ALTER TABLE "papers" ADD CONSTRAINT "papers_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_titles" ADD CONSTRAINT "paper_titles_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_identifiers" ADD CONSTRAINT "paper_identifiers_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_identifiers" ADD CONSTRAINT "journal_identifiers_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_names" ADD CONSTRAINT "journal_names_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_rankings" ADD CONSTRAINT "journal_rankings_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_rankings" ADD CONSTRAINT "journal_rankings_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "bibliometric_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_indicators" ADD CONSTRAINT "paper_indicators_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_indicators" ADD CONSTRAINT "paper_indicators_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "bibliometric_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_affiliations" ADD CONSTRAINT "paper_affiliations_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_author_affiliations" ADD CONSTRAINT "paper_author_affiliations_authorshipId_paperId_fkey" FOREIGN KEY ("authorshipId", "paperId") REFERENCES "paper_authors"("id", "paperId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_author_affiliations" ADD CONSTRAINT "paper_author_affiliations_affiliationId_paperId_fkey" FOREIGN KEY ("affiliationId", "paperId") REFERENCES "paper_affiliations"("id", "paperId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_funding" ADD CONSTRAINT "paper_funding_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_sources" ADD CONSTRAINT "paper_sources_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_sources" ADD CONSTRAINT "paper_sources_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_paper_metadata" ADD CONSTRAINT "institution_paper_metadata_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_paper_metadata" ADD CONSTRAINT "institution_paper_metadata_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_paper_field_definitions" ADD CONSTRAINT "institution_paper_field_definitions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "institution_data_import_issues" ADD CONSTRAINT "institution_data_import_issues_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "institution_data_import_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_metadata_events" ADD CONSTRAINT "paper_metadata_events_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_metadata_events" ADD CONSTRAINT "paper_metadata_events_importItemId_fkey" FOREIGN KEY ("importItemId") REFERENCES "institution_data_import_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_metadata_events" ADD CONSTRAINT "paper_metadata_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_index_jobs" ADD CONSTRAINT "paper_index_jobs_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Institution-defined values use JSON null for unknown, with strict JSON types.
ALTER TABLE bibliometric_editions ADD CONSTRAINT bibliometric_edition_valid CHECK (
  system IN ('jcr', 'cas', 'esi', 'institution') AND status IN ('draft', 'published')
  AND revision BETWEEN 1 AND 1000 AND content_revision >= 0
  AND btrim(version) <> '' AND btrim(source) <> ''
  AND (metric_year IS NULL OR metric_year BETWEEN 1900 AND 9999)
  AND (system <> 'esi' OR observed_on IS NOT NULL)
  AND ((status = 'published' AND "publishedAt" IS NOT NULL) OR (status = 'draft' AND "publishedAt" IS NULL))
);
ALTER TABLE journal_rankings ADD CONSTRAINT journal_ranking_valid CHECK (
  category_level IN ('category', 'broad', 'narrow') AND metric IN ('jif', 'jci', 'cas', 'institution')
  AND btrim(category) <> '' AND (quartile IS NULL OR quartile BETWEEN 1 AND 4)
);
ALTER TABLE paper_indicators ADD CONSTRAINT paper_indicator_valid CHECK (kind IN ('highly_cited', 'hot'));

CREATE FUNCTION protect_bibliometric_edition() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (OLD.status = 'published' AND NEW IS DISTINCT FROM OLD) THEN
    RAISE EXCEPTION 'Published editions and edition history are immutable' USING ERRCODE = '23514';
  END IF;
  IF (NEW.system, NEW.version, NEW.revision) IS DISTINCT FROM (OLD.system, OLD.version, OLD.revision) THEN
    RAISE EXCEPTION 'Edition identity is immutable; create a new revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bibliography_edition_immutable BEFORE UPDATE OR DELETE ON bibliometric_editions
  FOR EACH ROW EXECUTE FUNCTION protect_bibliometric_edition();

CREATE FUNCTION validate_bibliometric_observation() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE edition bibliometric_editions;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW."editionId" <> OLD."editionId" THEN
    RAISE EXCEPTION 'Observation edition is immutable' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO STRICT edition FROM bibliometric_editions
    WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD."editionId" ELSE NEW."editionId" END FOR UPDATE;
  IF edition.status <> 'draft' THEN
    RAISE EXCEPTION 'Published edition observations are immutable; create a revision' USING ERRCODE = '23514';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    IF NEW.source <> edition.source THEN
      RAISE EXCEPTION 'Observation source must match edition source' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'journal_rankings' THEN
      IF edition.system = 'esi'
        OR (edition.system = 'jcr' AND (NEW.metric NOT IN ('jif', 'jci') OR NEW.category_level <> 'category'))
        OR (edition.system = 'cas' AND (NEW.metric <> 'cas' OR NEW.category_level NOT IN ('broad', 'narrow')))
        OR (edition.system = 'institution' AND NEW.metric <> 'institution') THEN
        RAISE EXCEPTION 'Ranking does not match edition system' USING ERRCODE = '23514';
      END IF;
    ELSIF edition.system <> 'esi' THEN
      RAISE EXCEPTION 'Paper indicators require an ESI edition' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP <> 'UPDATE' OR NEW IS DISTINCT FROM OLD THEN
    UPDATE bibliometric_editions SET content_revision = content_revision + 1 WHERE id = edition.id;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER journal_ranking_edition_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_rankings
  FOR EACH ROW EXECUTE FUNCTION validate_bibliometric_observation();
CREATE TRIGGER paper_indicator_edition_guard BEFORE INSERT OR UPDATE OR DELETE ON paper_indicators
  FOR EACH ROW EXECUTE FUNCTION validate_bibliometric_observation();

-- Keep the map itself an object; SQL NULL and JSON null are not valid maps.
ALTER TABLE institution_paper_metadata
  ADD CONSTRAINT institution_paper_custom_fields_object CHECK (jsonb_typeof(custom_fields) = 'object');

ALTER TABLE institution_paper_field_definitions
  ALTER COLUMN options SET NOT NULL,
  ADD CONSTRAINT institution_paper_field_definition_valid CHECK (
    key ~ '^[a-z][a-z0-9_]{0,99}$' AND key NOT IN ('constructor', 'prototype')
    AND btrim(label) <> '' AND (label_en IS NULL OR btrim(label_en) <> '')
    AND field_type IN ('boolean', 'number', 'date', 'text', 'single_select', 'multi_select')
    AND visibility IN ('admin', 'institution', 'public')
    AND display_order BETWEEN 0 AND 10000 AND max_length BETWEEN 1 AND 10000
    AND cardinality(options) <= 100
    AND ((field_type IN ('single_select', 'multi_select') AND cardinality(options) > 0)
      OR (field_type NOT IN ('single_select', 'multi_select') AND cardinality(options) = 0))
    AND (field_type = 'number' OR (min_value IS NULL AND max_value IS NULL))
    AND (min_value IS NULL OR min_value BETWEEN '-1.7976931348623157e308'::double precision AND '1.7976931348623157e308'::double precision)
    AND (max_value IS NULL OR max_value BETWEEN '-1.7976931348623157e308'::double precision AND '1.7976931348623157e308'::double precision)
    AND (min_value IS NULL OR max_value IS NULL OR min_value <= max_value)
    AND (field_type = 'date' OR (min_date IS NULL AND max_date IS NULL))
    AND (min_date IS NULL OR min_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
    AND (max_date IS NULL OR max_date BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
    AND (min_date IS NULL OR max_date IS NULL OR min_date <= max_date)
  );

CREATE FUNCTION bibliography_custom_field_value_valid(
  value jsonb, definition institution_paper_field_definitions
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path FROM CURRENT AS $$
DECLARE
  text_value text;
  number_value numeric;
  date_value date;
BEGIN
  IF value IS NULL OR value = 'null'::jsonb THEN
    RETURN NOT definition.is_required;
  END IF;
  CASE definition.field_type
    WHEN 'boolean' THEN
      RETURN jsonb_typeof(value) = 'boolean';
    WHEN 'number' THEN
      IF jsonb_typeof(value) <> 'number' THEN RETURN false; END IF;
      number_value := (value #>> '{}')::numeric;
      RETURN number_value BETWEEN -1.7976931348623157e308::numeric AND 1.7976931348623157e308::numeric
        AND (definition.min_value IS NULL OR number_value >= definition.min_value::numeric)
        AND (definition.max_value IS NULL OR number_value <= definition.max_value::numeric);
    WHEN 'text' THEN
      IF jsonb_typeof(value) <> 'string' THEN RETURN false; END IF;
      text_value := value #>> '{}';
      RETURN text_value !~ '^[[:space:]]*$' AND length(text_value) <= definition.max_length;
    WHEN 'date' THEN
      IF jsonb_typeof(value) <> 'string' THEN RETURN false; END IF;
      text_value := value #>> '{}';
      IF text_value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RETURN false; END IF;
      BEGIN
        date_value := text_value::date;
      EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RETURN false;
      END;
      RETURN to_char(date_value, 'YYYY-MM-DD') = text_value
        AND (definition.min_date IS NULL OR date_value >= definition.min_date)
        AND (definition.max_date IS NULL OR date_value <= definition.max_date);
    WHEN 'single_select' THEN
      RETURN jsonb_typeof(value) = 'string' AND (value #>> '{}') = ANY(definition.options);
    WHEN 'multi_select' THEN
      IF jsonb_typeof(value) <> 'array' THEN RETURN false; END IF;
      RETURN jsonb_array_length(value) <= 100
        AND (NOT definition.is_required OR jsonb_array_length(value) > 0)
        AND NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements(value) AS choice(item)
          WHERE jsonb_typeof(item) <> 'string' OR NOT (item #>> '{}') = ANY(definition.options)
        )
        AND jsonb_array_length(value) = (SELECT count(DISTINCT item) FROM jsonb_array_elements(value) AS choice(item));
    ELSE RETURN false;
  END CASE;
END;
$$;

-- Serialize field definitions and values in each institution, including direct SQL.
-- An archived field retains old values but cannot accept new ones.
CREATE FUNCTION bibliography_validate_custom_fields() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE
  entry record;
  definition institution_paper_field_definitions;
BEGIN
  PERFORM id FROM institutions WHERE id = NEW."institutionId" FOR NO KEY UPDATE;
  IF jsonb_typeof(NEW.custom_fields) <> 'object' THEN
    RAISE EXCEPTION 'custom_fields must be an object' USING ERRCODE = '23514';
  END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(NEW.custom_fields)) > 100 THEN
    RAISE EXCEPTION 'Too many custom fields' USING ERRCODE = '23514';
  END IF;
  FOR entry IN SELECT key, value FROM jsonb_each(NEW.custom_fields) LOOP
    SELECT * INTO definition FROM institution_paper_field_definitions
      WHERE "institutionId" = NEW."institutionId" AND key = entry.key;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Custom field % is not configured', entry.key USING ERRCODE = '23514';
    END IF;
    IF NOT definition.is_active THEN
      IF TG_OP = 'UPDATE' AND OLD."institutionId" = NEW."institutionId"
        AND OLD.custom_fields -> entry.key IS NOT DISTINCT FROM entry.value THEN CONTINUE; END IF;
      RAISE EXCEPTION 'Custom field % is archived', entry.key USING ERRCODE = '23514';
    END IF;
    IF NOT bibliography_custom_field_value_valid(entry.value, definition) THEN
      RAISE EXCEPTION 'Invalid value for custom field %', entry.key USING ERRCODE = '23514';
    END IF;
  END LOOP;
  FOR definition IN SELECT * FROM institution_paper_field_definitions
    WHERE "institutionId" = NEW."institutionId" AND is_active AND is_required LOOP
    IF NOT bibliography_custom_field_value_valid(NEW.custom_fields -> definition.key, definition) THEN
      RAISE EXCEPTION 'Required custom field % has no valid value', definition.key USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER institution_paper_custom_fields_validate
BEFORE INSERT OR UPDATE OF "institutionId", custom_fields ON institution_paper_metadata
FOR EACH ROW EXECUTE FUNCTION bibliography_validate_custom_fields();

CREATE FUNCTION bibliography_validate_field_definition() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE
  institution_id uuid;
  field_key text;
  in_use boolean;
BEGIN
  institution_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."institutionId" ELSE NEW."institutionId" END;
  field_key := CASE WHEN TG_OP = 'DELETE' THEN OLD.key ELSE NEW.key END;
  PERFORM id FROM institutions WHERE id = institution_id FOR NO KEY UPDATE;
  -- Allow a parent institution to cascade-delete its definitions and values.
  IF TG_OP = 'DELETE' AND NOT FOUND THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (OLD.key <> NEW.key OR OLD."institutionId" <> NEW."institutionId") THEN
    RAISE EXCEPTION 'Custom field keys and institution scope are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT EXISTS (SELECT 1 FROM institution_paper_metadata
    WHERE "institutionId" = institution_id AND custom_fields ? field_key) INTO in_use;
  IF TG_OP = 'DELETE' THEN
    IF in_use THEN RAISE EXCEPTION 'Archive a field in use instead of deleting it' USING ERRCODE = '23514'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' AND (SELECT count(*) FROM institution_paper_field_definitions WHERE "institutionId" = institution_id) >= 100 THEN
    RAISE EXCEPTION 'An institution can define at most 100 custom fields' USING ERRCODE = '23514';
  END IF;
  IF cardinality(NEW.options) <> (SELECT count(DISTINCT option) FROM unnest(NEW.options) AS option)
    OR EXISTS (SELECT 1 FROM unnest(NEW.options) AS option WHERE option ~ '^[[:space:]]*$' OR length(option) > 500) THEN
    RAISE EXCEPTION 'Select choices must be unique, nonempty strings' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND in_use AND (NEW.field_type <> OLD.field_type OR NOT OLD.options <@ NEW.options) THEN
    RAISE EXCEPTION 'A field in use cannot change type or remove choices' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM institution_paper_metadata
    WHERE "institutionId" = institution_id
      AND (custom_fields ? field_key OR (NEW.is_active AND NEW.is_required))
      AND NOT bibliography_custom_field_value_valid(custom_fields -> field_key, NEW)
  ) THEN
    RAISE EXCEPTION 'Existing values do not satisfy the proposed field constraints' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER institution_paper_field_definition_validate
BEFORE INSERT OR UPDATE OR DELETE ON institution_paper_field_definitions
FOR EACH ROW EXECUTE FUNCTION bibliography_validate_field_definition();

-- Preserve the original display title and author identities. Unknown languages
-- stay unknown; a journal name alone does not establish a journal identity.
INSERT INTO paper_titles ("paperId", language, title, is_primary, source)
SELECT id, CASE language WHEN 0 THEN 'zh' WHEN 1 THEN 'en' WHEN 2 THEN 'de'
  WHEN 3 THEN 'fr' WHEN 4 THEN 'ja' ELSE 'und' END, title, true, 'legacy_migration'
FROM papers;

INSERT INTO paper_identifiers ("paperId", scheme, value, normalized_value, source)
SELECT id, 'doi', normalized_doi, normalized_doi, 'legacy_migration'
FROM papers WHERE normalized_doi IS NOT NULL;

UPDATE papers SET language_tags = CASE language
  WHEN 0 THEN ARRAY['zh'] WHEN 1 THEN ARRAY['en'] WHEN 2 THEN ARRAY['de']
  WHEN 3 THEN ARRAY['fr'] WHEN 4 THEN ARRAY['ja'] ELSE ARRAY[]::text[] END;

UPDATE paper_authors pa SET display_name = a.name FROM authors a WHERE a.id = pa."authorId";

DO $$
BEGIN
  IF (SELECT count(*) FROM papers) <> (SELECT count(*) FROM paper_titles WHERE is_primary)
    OR (SELECT count(*) FROM papers WHERE normalized_doi IS NOT NULL)
      <> (SELECT count(*) FROM paper_identifiers WHERE scheme = 'doi')
    OR EXISTS (SELECT 1 FROM paper_authors WHERE display_name IS NULL) THEN
    RAISE EXCEPTION 'Bibliography migration did not preserve every title, DOI and author occurrence';
  END IF;
END;
$$;
