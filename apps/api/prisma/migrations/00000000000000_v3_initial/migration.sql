-- Keep extension types visible when they are already installed in public.
SELECT set_config('search_path', quote_ident(current_schema()) || ', public', false);

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR,
    "username" VARCHAR(64) NOT NULL,
    "phone" VARCHAR(11),
    "avatar" VARCHAR,
    "bio" VARCHAR,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "airalogy_user_id" UUID,
    "gender" VARCHAR(16),
    "grade" VARCHAR(32),
    "degree" VARCHAR(32),
    "college" VARCHAR(100),
    "major" VARCHAR(100),
    "laboratory" VARCHAR(200),
    "research_interests" VARCHAR,
    "project_experiences" JSONB,
    "publications" JSONB,
    "platform_role" VARCHAR(16) NOT NULL DEFAULT 'member',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_external_identities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "externalId" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_external_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100),
    "phone" VARCHAR(100),
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embeddings" (
    "id" SERIAL NOT NULL,
    "paperId" UUID NOT NULL,
    "segmentIndex" SMALLINT NOT NULL,
    "text" VARCHAR NOT NULL,
    "embedding" vector,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "tsv" tsvector NOT NULL,

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oss_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "original_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR NOT NULL,
    "hash" VARCHAR NOT NULL,
    "ext" VARCHAR NOT NULL DEFAULT '',
    "userId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "prefix" VARCHAR(100) NOT NULL DEFAULT '',
    "institutionId" UUID,
    "security_profile" VARCHAR(32) NOT NULL DEFAULT 'standard',
    "watermark_enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "oss_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_access_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ossFileId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "paperId" UUID,
    "institutionId" UUID,
    "access_type" VARCHAR(16) NOT NULL,
    "watermarked" BOOLEAN NOT NULL DEFAULT false,
    "request_id" VARCHAR(64),
    "ip_address" VARCHAR(128),
    "user_agent" VARCHAR(1000),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_access_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_authors" (
    "id" SERIAL NOT NULL,
    "paperId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "order" SMALLINT NOT NULL,

    CONSTRAINT "paper_authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(500) NOT NULL,
    "abstract" VARCHAR,
    "doi" VARCHAR(100) NOT NULL,
    "normalized_doi" VARCHAR(100) NOT NULL,
    "journal_name" VARCHAR(100),
    "publish_year" SMALLINT,
    "publish_date" DATE,
    "publication_metadata_source" VARCHAR(32),
    "publication_metadata_checked" TIMESTAMP(6),
    "paper_type" SMALLINT,
    "language" SMALLINT,
    "citation_count" INTEGER,
    "pages" VARCHAR(50),
    "keywords" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "link" VARCHAR(255),

    CONSTRAINT "papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "mode" VARCHAR(32) NOT NULL DEFAULT 'general',
    "messages" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_bookmarks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "user_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID,
    "email" VARCHAR(100),
    "title" VARCHAR(200) NOT NULL,
    "type" VARCHAR(32) NOT NULL,
    "content" VARCHAR NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "handledBy" UUID,
    "handledAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "avatar" VARCHAR,
    "title" VARCHAR(50),
    "lab" VARCHAR(200),
    "office" VARCHAR(100),
    "email" VARCHAR(100),
    "phone" VARCHAR(20),
    "bio" VARCHAR,
    "join_year" INTEGER,
    "research_directions" JSONB,
    "education" JSONB,
    "achievements" JSONB,
    "letter_index" VARCHAR(1),
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,
    "college" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],

    CONSTRAINT "scholars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_subjects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "parentId" UUID,
    "institutionId" UUID,
    "nameZh" VARCHAR(200) NOT NULL,
    "nameEn" VARCHAR(200),
    "source" VARCHAR(64) NOT NULL DEFAULT 'platform',
    "taxonomyVersion" VARCHAR(64),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_subject_aliases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subjectId" UUID NOT NULL,
    "scopeKey" VARCHAR(64) NOT NULL DEFAULT 'global',
    "alias" VARCHAR(200) NOT NULL,
    "normalizedAlias" VARCHAR(200) NOT NULL,
    "locale" VARCHAR(16),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_subject_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholar_subjects" (
    "scholarId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "source" VARCHAR(64) NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholar_subjects_pkey" PRIMARY KEY ("scholarId","subjectId")
);

-- CreateTable
CREATE TABLE "institution_subject_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "localCode" VARCHAR(100),
    "normalizedLocalCode" VARCHAR(100),
    "localName" VARCHAR(200) NOT NULL,
    "normalizedLocalName" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_subject_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholar_papers" (
    "id" SERIAL NOT NULL,
    "scholarId" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "is_representative" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER,

    CONSTRAINT "scholar_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "summary" VARCHAR,
    "college" VARCHAR(100),
    "location" VARCHAR(100),
    "website" VARCHAR(255),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "institutionId" UUID,

    CONSTRAINT "labs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_memberships" (
    "id" SERIAL NOT NULL,
    "labId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(200) NOT NULL,
    "summary" VARCHAR,
    "website" VARCHAR(255),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_memberships" (
    "id" SERIAL NOT NULL,
    "institutionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "can_review_content" BOOLEAN NOT NULL DEFAULT false,
    "can_import_data" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "institution_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_user_provisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "createdBy" UUID NOT NULL,
    "claimedUserId" UUID,
    "email" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(16) NOT NULL DEFAULT 'member',
    "externalId" VARCHAR(64),
    "college" VARCHAR(100),
    "major" VARCHAR(100),
    "laboratory" VARCHAR(200),
    "inviteToken" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending_activation',
    "claimedAt" TIMESTAMP(6),
    "expiresAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "can_review_content" BOOLEAN NOT NULL DEFAULT false,
    "can_import_data" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "institution_user_provisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_api_credentials" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "clientId" VARCHAR(64) NOT NULL,
    "secretHash" VARCHAR NOT NULL,
    "scopes" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    "expiresAt" TIMESTAMP(6) NOT NULL,
    "revokedAt" TIMESTAMP(6),
    "secretVersion" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(6),
    "lastUsedIp" VARCHAR(128),
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_api_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_scholar_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "scholarId" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_scholar_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_data_imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'processing',
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "requestDigest" VARCHAR(64) NOT NULL,
    "actorType" VARCHAR(16) NOT NULL,
    "actorUserId" UUID,
    "actorScopes" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    "credentialId" UUID,
    "sourceIp" VARCHAR(128),
    "userAgent" VARCHAR(1000),
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "unchangedCount" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "reviewedBy" UUID,
    "reviewNotes" VARCHAR,
    "reviewedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_data_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_data_import_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "importId" UUID NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "externalKey" VARCHAR(200),
    "targetId" UUID,
    "action" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "message" VARCHAR,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_data_import_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_join_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'pending',
    "reason" VARCHAR,
    "review_notes" VARCHAR,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_join_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_paper_author_bindings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "paperId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "boundBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_paper_author_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_org_nodes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(100),
    "node_type" VARCHAR(64) NOT NULL DEFAULT 'unit',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_org_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_org_edges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "fromNodeId" UUID NOT NULL,
    "toNodeId" UUID NOT NULL,
    "edge_type" VARCHAR(64) NOT NULL DEFAULT 'hierarchy',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_org_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_org_people" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(100),
    "externalId" VARCHAR(64),
    "userId" UUID,
    "provisionId" UUID,
    "is_provisioning_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_org_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_org_positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "nodeId" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(64),
    "can_review_content" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_org_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_org_appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "personId" UUID NOT NULL,
    "positionId" UUID NOT NULL,
    "title" VARCHAR(100),
    "status" VARCHAR(32) NOT NULL DEFAULT 'active',
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(6),
    "endsAt" TIMESTAMP(6),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_org_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_review_workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_review_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_review_workflow_bindings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "binding_type" VARCHAR(32) NOT NULL,
    "content_type" VARCHAR(32) NOT NULL DEFAULT 'paper',
    "nodeId" UUID,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_review_workflow_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_review_workflow_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "resolver_type" VARCHAR(64) NOT NULL,
    "resolver_config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_review_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "labId" UUID,
    "submittedBy" UUID NOT NULL,
    "submissionId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewNodeId" UUID,
    "reviewCaseId" UUID NOT NULL,

    CONSTRAINT "paper_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_review_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "content_type" VARCHAR(32) NOT NULL,
    "subjectId" UUID NOT NULL,
    "currentVersionId" UUID,
    "submittedBy" UUID NOT NULL,
    "reviewNodeId" UUID,
    "workflowId" UUID,
    "status" VARCHAR(32) NOT NULL DEFAULT 'draft',
    "currentStep" INTEGER,
    "decision_notes" VARCHAR,
    "decidedBy" UUID,
    "submittedAt" TIMESTAMP(6),
    "decidedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_review_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_review_step_instances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "workflowId" UUID,
    "step_order" INTEGER NOT NULL,
    "step_name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'queued',
    "resolver_type" VARCHAR(64) NOT NULL,
    "resolver_config" JSONB NOT NULL,
    "eligible_reviewer_user_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "resolution_notes" VARCHAR,
    "review_notes" VARCHAR,
    "reviewedBy" UUID,
    "reviewedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_review_step_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_review_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "caseId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "stepId" UUID,
    "step_order" INTEGER,
    "step_name" VARCHAR(100),
    "actorId" UUID NOT NULL,
    "action" VARCHAR(32) NOT NULL,
    "from_status" VARCHAR(32),
    "to_status" VARCHAR(32) NOT NULL,
    "versionId" UUID,
    "notes" VARCHAR,
    "sourceIp" VARCHAR(128),
    "userAgent" VARCHAR(1000),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_review_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "degree_theses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "institutionId" UUID NOT NULL,
    "record_code" VARCHAR(64) NOT NULL,
    "institution_reference" VARCHAR(100),
    "submittedBy" UUID NOT NULL,
    "reviewCaseId" UUID NOT NULL,
    "currentVersionId" UUID,
    "publishedVersionId" UUID,
    "publishedAt" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "degree_theses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "degree_thesis_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "thesisId" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "title_en" VARCHAR(500),
    "author_name" VARCHAR(100) NOT NULL,
    "student_id" VARCHAR(100),
    "training_unit" VARCHAR(200) NOT NULL,
    "major" VARCHAR(200) NOT NULL,
    "degree_category" VARCHAR(64) NOT NULL,
    "award_year" SMALLINT NOT NULL,
    "advisors" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "abstract" VARCHAR,
    "keywords" VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    "language" VARCHAR(16) NOT NULL DEFAULT 'zh-CN',
    "visibility" VARCHAR(32) NOT NULL DEFAULT 'public',
    "confidentiality_until" DATE,
    "fileId" UUID,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(6),

    CONSTRAINT "degree_thesis_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "claimId" UUID,
    "userId" UUID NOT NULL,
    "institutionId" UUID,
    "labId" UUID,
    "oss_file_id" UUID,
    "metadata_snapshot" JSONB,
    "notes" VARCHAR,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paper_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paperId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" VARCHAR NOT NULL,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(6) NOT NULL,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "content" VARCHAR NOT NULL,
    "parentCommentId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "forum_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forum_likes" (
    "id" SERIAL NOT NULL,
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "forum_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholar_embeddings" (
    "id" BIGSERIAL NOT NULL,
    "doi" VARCHAR(200) NOT NULL,
    "scholar_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "scholar_names" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    "title" TEXT,
    "abstract" TEXT,
    "embedding" vector,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholar_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholar_source_papers" (
    "doi" VARCHAR(200) NOT NULL,
    "title" VARCHAR(500) NOT NULL DEFAULT '',
    "abstract" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdf_source_path" TEXT,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholar_source_papers_pkey" PRIMARY KEY ("doi")
);

-- CreateTable
CREATE TABLE "scholar_source_profiles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "doi_list" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "academy" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],

    CONSTRAINT "scholar_source_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholar_research_periods" (
    "id" BIGSERIAL NOT NULL,
    "generation_id" UUID NOT NULL,
    "scholar_id" UUID NOT NULL,
    "period_start_year" INTEGER NOT NULL,
    "period_end_year" INTEGER NOT NULL,
    "paper_count" INTEGER NOT NULL,
    "papers_with_abstract" INTEGER NOT NULL,
    "papers_without_abstract" INTEGER NOT NULL,
    "focus_summary" TEXT NOT NULL,
    "focus_tags" VARCHAR[] DEFAULT ARRAY[]::VARCHAR[],
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholar_research_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholar_research_timeline_generations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scholar_id" UUID NOT NULL,
    "source_type" VARCHAR(32) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'requested',
    "requested_by" UUID,
    "reviewed_by" UUID,
    "reused_from_id" UUID,
    "idempotency_key" VARCHAR(128),
    "source_fingerprint" VARCHAR(64),
    "timeline_policy" VARCHAR(32) NOT NULL DEFAULT 'fixed_calendar_windows',
    "window_size_years" SMALLINT NOT NULL DEFAULT 5,
    "model" VARCHAR(100) NOT NULL,
    "prompt_version" VARCHAR(32) NOT NULL,
    "source_paper_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_paper_count" INTEGER NOT NULL DEFAULT 0,
    "unresolved_paper_count" INTEGER NOT NULL DEFAULT 0,
    "progress_stage" VARCHAR(32) NOT NULL DEFAULT 'requested',
    "completed_periods" INTEGER NOT NULL DEFAULT 0,
    "total_periods" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "attempt_count" SMALLINT NOT NULL DEFAULT 0,
    "lease_owner" VARCHAR(100),
    "lease_expires_at" TIMESTAMP(6),
    "error_code" VARCHAR(64),
    "error_message" TEXT,
    "review_notes" TEXT,
    "request_ip" VARCHAR(128),
    "user_agent" VARCHAR(1000),
    "requested_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(6),
    "completed_at" TIMESTAMP(6),
    "reviewed_at" TIMESTAMP(6),
    "published_at" TIMESTAMP(6),
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholar_research_timeline_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholar_research_period_papers" (
    "id" BIGSERIAL NOT NULL,
    "period_id" BIGINT NOT NULL,
    "paper_id" UUID,
    "year" INTEGER NOT NULL,
    "title_snapshot" TEXT NOT NULL,
    "doi_snapshot" TEXT NOT NULL,
    "has_abstract" BOOLEAN NOT NULL DEFAULT false,
    "source_status" VARCHAR(32) NOT NULL,
    "display_order" INTEGER NOT NULL,

    CONSTRAINT "scholar_research_period_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholar_research_timeline_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "generation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholar_research_timeline_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholar_research_timeline_issues" (
    "id" BIGSERIAL NOT NULL,
    "generation_id" UUID NOT NULL,
    "paper_id" UUID,
    "doi" VARCHAR(200) NOT NULL DEFAULT '',
    "issue_type" VARCHAR(32) NOT NULL,
    "existing_year" INTEGER,
    "candidate_year" INTEGER,
    "metadata_source" VARCHAR(32),
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholar_research_timeline_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_idx" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_airalogy_user_id_idx" ON "users"("airalogy_user_id") WHERE (airalogy_user_id IS NOT NULL);

-- CreateIndex
CREATE INDEX "user_external_identities_userId_idx" ON "user_external_identities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_external_identities_provider_externalId_idx" ON "user_external_identities"("provider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "user_external_identities_userId_provider_idx" ON "user_external_identities"("userId", "provider");

-- CreateIndex
CREATE INDEX "idx_embeddings_hnsw_cosine" ON "embeddings"("embedding");

-- CreateIndex
CREATE UNIQUE INDEX "embeddings_paperId_segmentIndex_idx" ON "embeddings"("paperId", "segmentIndex");

-- CreateIndex
CREATE INDEX "oss_files_userId_idx" ON "oss_files"("userId");

-- CreateIndex
CREATE INDEX "oss_files_institutionId_idx" ON "oss_files"("institutionId");

-- CreateIndex
CREATE INDEX "oss_files_security_profile_idx" ON "oss_files"("security_profile");

-- CreateIndex
CREATE INDEX "file_access_audits_ossFileId_createdAt_idx" ON "file_access_audits"("ossFileId", "createdAt");

-- CreateIndex
CREATE INDEX "file_access_audits_userId_createdAt_idx" ON "file_access_audits"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "file_access_audits_institutionId_createdAt_idx" ON "file_access_audits"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "file_access_audits_access_type_createdAt_idx" ON "file_access_audits"("access_type", "createdAt");

-- CreateIndex
CREATE INDEX "paper_authors_authorId_idx" ON "paper_authors"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "paper_authors_paperId_authorId_idx" ON "paper_authors"("paperId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "papers_normalized_doi_key" ON "papers"("normalized_doi");

-- CreateIndex
CREATE INDEX "papers_doi_idx" ON "papers"("doi");

-- CreateIndex
CREATE INDEX "chats_userId_mode_updatedAt_idx" ON "chats"("userId", "mode", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "user_bookmarks_paperId_idx" ON "user_bookmarks"("paperId");

-- CreateIndex
CREATE UNIQUE INDEX "user_bookmarks_userId_paperId_key" ON "user_bookmarks"("userId", "paperId");

-- CreateIndex
CREATE INDEX "feedbacks_status_idx" ON "feedbacks"("status");

-- CreateIndex
CREATE INDEX "feedbacks_type_idx" ON "feedbacks"("type");

-- CreateIndex
CREATE INDEX "feedbacks_userId_idx" ON "feedbacks"("userId");

-- CreateIndex
CREATE INDEX "feedbacks_handledBy_idx" ON "feedbacks"("handledBy");

-- CreateIndex
CREATE INDEX "feedbacks_createdAt_idx" ON "feedbacks"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "academic_subjects_code_idx" ON "academic_subjects"("code");

-- CreateIndex
CREATE INDEX "academic_subjects_parentId_idx" ON "academic_subjects"("parentId");

-- CreateIndex
CREATE INDEX "academic_subjects_institution_active_order_idx" ON "academic_subjects"("institutionId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "academic_subjects_active_order_idx" ON "academic_subjects"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "academic_subject_aliases_subjectId_idx" ON "academic_subject_aliases"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_subject_aliases_scope_normalized_idx" ON "academic_subject_aliases"("scopeKey", "normalizedAlias");

-- CreateIndex
CREATE INDEX "scholar_subjects_subjectId_scholarId_idx" ON "scholar_subjects"("subjectId", "scholarId");

-- CreateIndex
CREATE INDEX "institution_subject_mappings_subjectId_idx" ON "institution_subject_mappings"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_subject_mappings_inst_name_idx" ON "institution_subject_mappings"("institutionId", "normalizedLocalName");

-- CreateIndex
CREATE UNIQUE INDEX "institution_subject_mappings_inst_code_idx" ON "institution_subject_mappings"("institutionId", "normalizedLocalCode");

-- CreateIndex
CREATE UNIQUE INDEX "scholar_papers_scholarId_paperId_key" ON "scholar_papers"("scholarId", "paperId");

-- CreateIndex
CREATE UNIQUE INDEX "labs_slug_idx" ON "labs"("slug");

-- CreateIndex
CREATE INDEX "labs_institutionId_idx" ON "labs"("institutionId");

-- CreateIndex
CREATE INDEX "lab_memberships_userId_idx" ON "lab_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_memberships_labId_userId_idx" ON "lab_memberships"("labId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "institutions_slug_idx" ON "institutions"("slug");

-- CreateIndex
CREATE INDEX "institution_memberships_userId_idx" ON "institution_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_memberships_institutionId_userId_idx" ON "institution_memberships"("institutionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_user_provisions_inviteToken_idx" ON "institution_user_provisions"("inviteToken");

-- CreateIndex
CREATE INDEX "institution_user_provisions_status_idx" ON "institution_user_provisions"("status");

-- CreateIndex
CREATE INDEX "institution_user_provisions_claimedUserId_idx" ON "institution_user_provisions"("claimedUserId");

-- CreateIndex
CREATE INDEX "institution_user_provisions_createdBy_idx" ON "institution_user_provisions"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "institution_user_provisions_institutionId_email_idx" ON "institution_user_provisions"("institutionId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "institution_api_credentials_clientId_idx" ON "institution_api_credentials"("clientId");

-- CreateIndex
CREATE INDEX "institution_api_credentials_institutionId_idx" ON "institution_api_credentials"("institutionId");

-- CreateIndex
CREATE INDEX "institution_api_credentials_createdBy_idx" ON "institution_api_credentials"("createdBy");

-- CreateIndex
CREATE INDEX "institution_api_credentials_expiresAt_idx" ON "institution_api_credentials"("expiresAt");

-- CreateIndex
CREATE INDEX "institution_api_credentials_revokedAt_idx" ON "institution_api_credentials"("revokedAt");

-- CreateIndex
CREATE INDEX "institution_scholar_mappings_scholarId_idx" ON "institution_scholar_mappings"("scholarId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_scholar_mappings_inst_external_idx" ON "institution_scholar_mappings"("institutionId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_scholar_mappings_inst_scholar_idx" ON "institution_scholar_mappings"("institutionId", "scholarId");

-- CreateIndex
CREATE INDEX "institution_data_imports_institutionId_createdAt_idx" ON "institution_data_imports"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "institution_data_imports_credentialId_idx" ON "institution_data_imports"("credentialId");

-- CreateIndex
CREATE INDEX "institution_data_imports_actorUserId_idx" ON "institution_data_imports"("actorUserId");

-- CreateIndex
CREATE INDEX "institution_data_imports_reviewedBy_idx" ON "institution_data_imports"("reviewedBy");

-- CreateIndex
CREATE INDEX "institution_data_imports_status_idx" ON "institution_data_imports"("status");

-- CreateIndex
CREATE UNIQUE INDEX "institution_data_imports_inst_kind_key_idx" ON "institution_data_imports"("institutionId", "kind", "idempotencyKey");

-- CreateIndex
CREATE INDEX "institution_data_import_items_importId_idx" ON "institution_data_import_items"("importId");

-- CreateIndex
CREATE INDEX "institution_data_import_items_targetId_idx" ON "institution_data_import_items"("targetId");

-- CreateIndex
CREATE INDEX "institution_data_import_items_status_idx" ON "institution_data_import_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "institution_data_import_items_import_row_idx" ON "institution_data_import_items"("importId", "rowIndex");

-- CreateIndex
CREATE INDEX "institution_join_requests_institutionId_idx" ON "institution_join_requests"("institutionId");

-- CreateIndex
CREATE INDEX "institution_join_requests_userId_idx" ON "institution_join_requests"("userId");

-- CreateIndex
CREATE INDEX "institution_join_requests_status_idx" ON "institution_join_requests"("status");

-- CreateIndex
CREATE INDEX "institution_paper_author_bindings_institutionId_idx" ON "institution_paper_author_bindings"("institutionId");

-- CreateIndex
CREATE INDEX "institution_paper_author_bindings_paperId_idx" ON "institution_paper_author_bindings"("paperId");

-- CreateIndex
CREATE INDEX "institution_paper_author_bindings_userId_idx" ON "institution_paper_author_bindings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "inst_paper_author_bindings_inst_paper_author_uidx" ON "institution_paper_author_bindings"("institutionId", "paperId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "inst_paper_author_bindings_inst_paper_user_uidx" ON "institution_paper_author_bindings"("institutionId", "paperId", "userId");

-- CreateIndex
CREATE INDEX "institution_org_nodes_institutionId_idx" ON "institution_org_nodes"("institutionId");

-- CreateIndex
CREATE INDEX "institution_org_nodes_institutionId_node_type_idx" ON "institution_org_nodes"("institutionId", "node_type");

-- CreateIndex
CREATE INDEX "institution_org_nodes_createdBy_idx" ON "institution_org_nodes"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "institution_org_nodes_institutionId_key_idx" ON "institution_org_nodes"("institutionId", "key");

-- CreateIndex
CREATE INDEX "institution_org_edges_institutionId_idx" ON "institution_org_edges"("institutionId");

-- CreateIndex
CREATE INDEX "institution_org_edges_fromNodeId_idx" ON "institution_org_edges"("fromNodeId");

-- CreateIndex
CREATE INDEX "institution_org_edges_toNodeId_idx" ON "institution_org_edges"("toNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_org_edges_inst_from_to_type_idx" ON "institution_org_edges"("institutionId", "fromNodeId", "toNodeId", "edge_type");

-- CreateIndex
CREATE INDEX "institution_org_people_institutionId_idx" ON "institution_org_people"("institutionId");

-- CreateIndex
CREATE INDEX "institution_org_people_institutionId_userId_idx" ON "institution_org_people"("institutionId", "userId");

-- CreateIndex
CREATE INDEX "institution_org_people_institutionId_email_idx" ON "institution_org_people"("institutionId", "email");

-- CreateIndex
CREATE INDEX "institution_org_people_provisionId_idx" ON "institution_org_people"("provisionId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_org_people_institutionId_key_idx" ON "institution_org_people"("institutionId", "key");

-- CreateIndex
CREATE INDEX "institution_org_positions_institutionId_idx" ON "institution_org_positions"("institutionId");

-- CreateIndex
CREATE INDEX "institution_org_positions_nodeId_idx" ON "institution_org_positions"("nodeId");

-- CreateIndex
CREATE INDEX "institution_org_positions_institutionId_code_idx" ON "institution_org_positions"("institutionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "institution_org_positions_institutionId_key_idx" ON "institution_org_positions"("institutionId", "key");

-- CreateIndex
CREATE INDEX "institution_org_appointments_institutionId_idx" ON "institution_org_appointments"("institutionId");

-- CreateIndex
CREATE INDEX "institution_org_appointments_personId_idx" ON "institution_org_appointments"("personId");

-- CreateIndex
CREATE INDEX "institution_org_appointments_positionId_idx" ON "institution_org_appointments"("positionId");

-- CreateIndex
CREATE INDEX "institution_org_appointments_institutionId_status_idx" ON "institution_org_appointments"("institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "institution_org_appointments_institutionId_key_idx" ON "institution_org_appointments"("institutionId", "key");

-- CreateIndex
CREATE INDEX "institution_review_workflows_institutionId_idx" ON "institution_review_workflows"("institutionId");

-- CreateIndex
CREATE INDEX "institution_review_workflows_createdBy_idx" ON "institution_review_workflows"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "institution_review_workflows_institutionId_key_idx" ON "institution_review_workflows"("institutionId", "key");

-- CreateIndex
CREATE INDEX "institution_review_workflow_bindings_institutionId_idx" ON "institution_review_workflow_bindings"("institutionId");

-- CreateIndex
CREATE INDEX "institution_review_workflow_bindings_inst_content_idx" ON "institution_review_workflow_bindings"("institutionId", "content_type", "is_active");

-- CreateIndex
CREATE INDEX "institution_review_workflow_bindings_workflowId_idx" ON "institution_review_workflow_bindings"("workflowId");

-- CreateIndex
CREATE INDEX "institution_review_workflow_bindings_nodeId_idx" ON "institution_review_workflow_bindings"("nodeId");

-- CreateIndex
CREATE INDEX "institution_review_workflow_steps_institutionId_idx" ON "institution_review_workflow_steps"("institutionId");

-- CreateIndex
CREATE INDEX "institution_review_workflow_steps_workflowId_idx" ON "institution_review_workflow_steps"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "institution_review_workflow_steps_workflowId_step_order_idx" ON "institution_review_workflow_steps"("workflowId", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "paper_claims_reviewCaseId_idx" ON "paper_claims"("reviewCaseId");

-- CreateIndex
CREATE INDEX "paper_claims_paperId_idx" ON "paper_claims"("paperId");

-- CreateIndex
CREATE INDEX "paper_claims_institutionId_idx" ON "paper_claims"("institutionId");

-- CreateIndex
CREATE INDEX "paper_claims_labId_idx" ON "paper_claims"("labId");

-- CreateIndex
CREATE INDEX "paper_claims_reviewNodeId_idx" ON "paper_claims"("reviewNodeId");

-- CreateIndex
CREATE INDEX "paper_claims_submittedBy_idx" ON "paper_claims"("submittedBy");

-- CreateIndex
CREATE INDEX "paper_claims_submissionId_idx" ON "paper_claims"("submissionId");

-- CreateIndex
CREATE INDEX "content_review_cases_inst_type_status_idx" ON "content_review_cases"("institutionId", "content_type", "status");

-- CreateIndex
CREATE INDEX "content_review_cases_submitter_updated_idx" ON "content_review_cases"("submittedBy", "updatedAt");

-- CreateIndex
CREATE INDEX "content_review_cases_workflowId_idx" ON "content_review_cases"("workflowId");

-- CreateIndex
CREATE INDEX "content_review_cases_reviewNodeId_idx" ON "content_review_cases"("reviewNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "content_review_cases_type_subject_idx" ON "content_review_cases"("content_type", "subjectId");

-- CreateIndex
CREATE INDEX "content_review_steps_inst_status_idx" ON "content_review_step_instances"("institutionId", "status");

-- CreateIndex
CREATE INDEX "content_review_steps_eligible_users_idx" ON "content_review_step_instances" USING GIN ("eligible_reviewer_user_ids");

-- CreateIndex
CREATE INDEX "content_review_step_instances_workflowId_idx" ON "content_review_step_instances"("workflowId");

-- CreateIndex
CREATE UNIQUE INDEX "content_review_steps_case_order_idx" ON "content_review_step_instances"("caseId", "step_order");

-- CreateIndex
CREATE INDEX "content_review_actions_case_created_idx" ON "content_review_actions"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "content_review_actions_inst_created_idx" ON "content_review_actions"("institutionId", "createdAt");

-- CreateIndex
CREATE INDEX "content_review_actions_actor_created_idx" ON "content_review_actions"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "degree_theses_record_code_idx" ON "degree_theses"("record_code");

-- CreateIndex
CREATE UNIQUE INDEX "degree_theses_reviewCaseId_idx" ON "degree_theses"("reviewCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "degree_theses_currentVersionId_idx" ON "degree_theses"("currentVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "degree_theses_publishedVersionId_idx" ON "degree_theses"("publishedVersionId");

-- CreateIndex
CREATE INDEX "degree_theses_inst_published_idx" ON "degree_theses"("institutionId", "publishedAt");

-- CreateIndex
CREATE INDEX "degree_theses_submitter_updated_idx" ON "degree_theses"("submittedBy", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "degree_theses_inst_reference_idx" ON "degree_theses"("institutionId", "institution_reference");

-- CreateIndex
CREATE INDEX "degree_thesis_versions_unit_year_idx" ON "degree_thesis_versions"("training_unit", "award_year");

-- CreateIndex
CREATE INDEX "degree_thesis_versions_degree_year_idx" ON "degree_thesis_versions"("degree_category", "award_year");

-- CreateIndex
CREATE INDEX "degree_thesis_versions_major_idx" ON "degree_thesis_versions"("major");

-- CreateIndex
CREATE INDEX "degree_thesis_versions_title_trgm_idx" ON "degree_thesis_versions" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "degree_thesis_versions_author_trgm_idx" ON "degree_thesis_versions" USING GIN ("author_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "degree_thesis_versions_fileId_idx" ON "degree_thesis_versions"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "degree_thesis_versions_thesis_version_idx" ON "degree_thesis_versions"("thesisId", "version_number");

-- CreateIndex
CREATE INDEX "paper_submissions_paperId_idx" ON "paper_submissions"("paperId");

-- CreateIndex
CREATE INDEX "paper_submissions_claimId_idx" ON "paper_submissions"("claimId");

-- CreateIndex
CREATE INDEX "paper_submissions_userId_idx" ON "paper_submissions"("userId");

-- CreateIndex
CREATE INDEX "paper_submissions_institutionId_idx" ON "paper_submissions"("institutionId");

-- CreateIndex
CREATE INDEX "paper_submissions_labId_idx" ON "paper_submissions"("labId");

-- CreateIndex
CREATE INDEX "paper_submissions_oss_file_id_idx" ON "paper_submissions"("oss_file_id");

-- CreateIndex
CREATE INDEX "forum_posts_paperId_idx" ON "forum_posts"("paperId");

-- CreateIndex
CREATE INDEX "forum_posts_userId_idx" ON "forum_posts"("userId");

-- CreateIndex
CREATE INDEX "forum_comments_postId_idx" ON "forum_comments"("postId");

-- CreateIndex
CREATE INDEX "forum_comments_userId_idx" ON "forum_comments"("userId");

-- CreateIndex
CREATE INDEX "forum_comments_parentCommentId_idx" ON "forum_comments"("parentCommentId");

-- CreateIndex
CREATE INDEX "forum_likes_userId_idx" ON "forum_likes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "forum_likes_postId_userId_key" ON "forum_likes"("postId", "userId");

-- CreateIndex
CREATE INDEX "scholar_embeddings_doi_idx" ON "scholar_embeddings"("doi");

-- CreateIndex
CREATE INDEX "scholar_embeddings_vector_idx" ON "scholar_embeddings"("embedding");

-- CreateIndex
CREATE INDEX "scholar_research_periods_scholar_period_idx" ON "scholar_research_periods"("scholar_id", "period_start_year");

-- CreateIndex
CREATE INDEX "scholar_research_periods_generation_idx" ON "scholar_research_periods"("generation_id");

-- CreateIndex
CREATE INDEX "scholar_research_periods_tags_gin_idx" ON "scholar_research_periods" USING GIN ("focus_tags");

-- CreateIndex
CREATE UNIQUE INDEX "scholar_research_periods_generation_period_key" ON "scholar_research_periods"("generation_id", "period_start_year", "period_end_year");

-- CreateIndex
CREATE INDEX "scholar_timeline_generations_status_requested_idx" ON "scholar_research_timeline_generations"("status", "requested_at");

-- CreateIndex
CREATE INDEX "scholar_timeline_generations_scholar_created_idx" ON "scholar_research_timeline_generations"("scholar_id", "createdAt");

-- CreateIndex
CREATE INDEX "scholar_timeline_generations_requester_created_idx" ON "scholar_research_timeline_generations"("requested_by", "createdAt");

-- CreateIndex
CREATE INDEX "scholar_timeline_generations_fingerprint_idx" ON "scholar_research_timeline_generations"("source_fingerprint", "model", "prompt_version");

-- CreateIndex
CREATE UNIQUE INDEX "scholar_timeline_one_published_idx" ON "scholar_research_timeline_generations"("scholar_id") WHERE ((status)::text = 'published'::text);

-- CreateIndex
CREATE UNIQUE INDEX "scholar_timeline_one_active_job_idx" ON "scholar_research_timeline_generations"("scholar_id") WHERE ((status)::text = ANY (ARRAY[('queued'::character varying)::text, ('running'::character varying)::text]));

-- CreateIndex
CREATE UNIQUE INDEX "scholar_timeline_request_idempotency_idx" ON "scholar_research_timeline_generations"("requested_by", "idempotency_key") WHERE ((requested_by IS NOT NULL) AND (idempotency_key IS NOT NULL));

-- CreateIndex
CREATE INDEX "scholar_research_period_papers_period_idx" ON "scholar_research_period_papers"("period_id");

-- CreateIndex
CREATE INDEX "scholar_research_period_papers_paper_idx" ON "scholar_research_period_papers"("paper_id");

-- CreateIndex
CREATE UNIQUE INDEX "scholar_research_period_papers_period_order_key" ON "scholar_research_period_papers"("period_id", "display_order");

-- CreateIndex
CREATE INDEX "scholar_timeline_requests_generation_idx" ON "scholar_research_timeline_requests"("generation_id");

-- CreateIndex
CREATE INDEX "scholar_timeline_requests_generation_user_idx" ON "scholar_research_timeline_requests"("generation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "scholar_timeline_requests_user_idempotency_key" ON "scholar_research_timeline_requests"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "scholar_timeline_issues_generation_idx" ON "scholar_research_timeline_issues"("generation_id", "id");

-- CreateIndex
CREATE INDEX "scholar_timeline_issues_paper_idx" ON "scholar_research_timeline_issues"("paper_id");

-- AddForeignKey
ALTER TABLE "user_external_identities" ADD CONSTRAINT "user_external_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oss_files" ADD CONSTRAINT "oss_files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "oss_files" ADD CONSTRAINT "oss_files_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_access_audits" ADD CONSTRAINT "file_access_audits_ossFileId_fkey" FOREIGN KEY ("ossFileId") REFERENCES "oss_files"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_access_audits" ADD CONSTRAINT "file_access_audits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_access_audits" ADD CONSTRAINT "file_access_audits_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "file_access_audits" ADD CONSTRAINT "file_access_audits_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_authors" ADD CONSTRAINT "paper_authors_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_authors" ADD CONSTRAINT "paper_authors_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "user_bookmarks" ADD CONSTRAINT "user_bookmarks_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_handledBy_fkey" FOREIGN KEY ("handledBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "academic_subjects" ADD CONSTRAINT "academic_subjects_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "academic_subjects"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "academic_subjects" ADD CONSTRAINT "academic_subjects_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "academic_subject_aliases" ADD CONSTRAINT "academic_subject_aliases_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "academic_subjects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_subjects" ADD CONSTRAINT "scholar_subjects_scholarId_fkey" FOREIGN KEY ("scholarId") REFERENCES "scholars"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_subjects" ADD CONSTRAINT "scholar_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "academic_subjects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_subject_mappings" ADD CONSTRAINT "institution_subject_mappings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_subject_mappings" ADD CONSTRAINT "institution_subject_mappings_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "academic_subjects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_papers" ADD CONSTRAINT "scholar_papers_scholarId_fkey" FOREIGN KEY ("scholarId") REFERENCES "scholars"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_papers" ADD CONSTRAINT "scholar_papers_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "labs" ADD CONSTRAINT "labs_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lab_memberships" ADD CONSTRAINT "lab_memberships_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lab_memberships" ADD CONSTRAINT "lab_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_memberships" ADD CONSTRAINT "institution_memberships_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_memberships" ADD CONSTRAINT "institution_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_user_provisions" ADD CONSTRAINT "institution_user_provisions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_user_provisions" ADD CONSTRAINT "institution_user_provisions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_user_provisions" ADD CONSTRAINT "institution_user_provisions_claimedUserId_fkey" FOREIGN KEY ("claimedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_api_credentials" ADD CONSTRAINT "institution_api_credentials_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_api_credentials" ADD CONSTRAINT "institution_api_credentials_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_scholar_mappings" ADD CONSTRAINT "institution_scholar_mappings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_scholar_mappings" ADD CONSTRAINT "institution_scholar_mappings_scholarId_fkey" FOREIGN KEY ("scholarId") REFERENCES "scholars"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_data_imports" ADD CONSTRAINT "institution_data_imports_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_data_imports" ADD CONSTRAINT "institution_data_imports_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_data_imports" ADD CONSTRAINT "institution_data_imports_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "institution_api_credentials"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_data_imports" ADD CONSTRAINT "institution_data_imports_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_data_import_items" ADD CONSTRAINT "institution_data_import_items_importId_fkey" FOREIGN KEY ("importId") REFERENCES "institution_data_imports"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_join_requests" ADD CONSTRAINT "institution_join_requests_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_join_requests" ADD CONSTRAINT "institution_join_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_join_requests" ADD CONSTRAINT "institution_join_requests_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_paper_author_bindings" ADD CONSTRAINT "institution_paper_author_bindings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_paper_author_bindings" ADD CONSTRAINT "institution_paper_author_bindings_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_paper_author_bindings" ADD CONSTRAINT "institution_paper_author_bindings_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_paper_author_bindings" ADD CONSTRAINT "institution_paper_author_bindings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_paper_author_bindings" ADD CONSTRAINT "institution_paper_author_bindings_boundBy_fkey" FOREIGN KEY ("boundBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_nodes" ADD CONSTRAINT "institution_org_nodes_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_nodes" ADD CONSTRAINT "institution_org_nodes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_edges" ADD CONSTRAINT "institution_org_edges_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_edges" ADD CONSTRAINT "institution_org_edges_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "institution_org_nodes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_edges" ADD CONSTRAINT "institution_org_edges_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "institution_org_nodes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_people" ADD CONSTRAINT "institution_org_people_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_people" ADD CONSTRAINT "institution_org_people_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_people" ADD CONSTRAINT "institution_org_people_provisionId_fkey" FOREIGN KEY ("provisionId") REFERENCES "institution_user_provisions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_positions" ADD CONSTRAINT "institution_org_positions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_positions" ADD CONSTRAINT "institution_org_positions_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "institution_org_nodes"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_appointments" ADD CONSTRAINT "institution_org_appointments_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_appointments" ADD CONSTRAINT "institution_org_appointments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "institution_org_people"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_org_appointments" ADD CONSTRAINT "institution_org_appointments_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "institution_org_positions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_review_workflows" ADD CONSTRAINT "institution_review_workflows_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_review_workflows" ADD CONSTRAINT "institution_review_workflows_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_review_workflow_bindings" ADD CONSTRAINT "institution_review_workflow_bindings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_review_workflow_bindings" ADD CONSTRAINT "institution_review_workflow_bindings_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "institution_review_workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_review_workflow_bindings" ADD CONSTRAINT "institution_review_workflow_bindings_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "institution_org_nodes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_review_workflow_steps" ADD CONSTRAINT "institution_review_workflow_steps_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "institution_review_workflow_steps" ADD CONSTRAINT "institution_review_workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "institution_review_workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_claims" ADD CONSTRAINT "paper_claims_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_claims" ADD CONSTRAINT "paper_claims_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_claims" ADD CONSTRAINT "paper_claims_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_claims" ADD CONSTRAINT "paper_claims_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_claims" ADD CONSTRAINT "paper_claims_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "paper_submissions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_claims" ADD CONSTRAINT "paper_claims_reviewNodeId_fkey" FOREIGN KEY ("reviewNodeId") REFERENCES "institution_org_nodes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_claims" ADD CONSTRAINT "paper_claims_reviewCaseId_fkey" FOREIGN KEY ("reviewCaseId") REFERENCES "content_review_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_cases" ADD CONSTRAINT "content_review_cases_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_cases" ADD CONSTRAINT "content_review_cases_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_cases" ADD CONSTRAINT "content_review_cases_decidedBy_fkey" FOREIGN KEY ("decidedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_cases" ADD CONSTRAINT "content_review_cases_reviewNodeId_fkey" FOREIGN KEY ("reviewNodeId") REFERENCES "institution_org_nodes"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_cases" ADD CONSTRAINT "content_review_cases_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "institution_review_workflows"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_step_instances" ADD CONSTRAINT "content_review_steps_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "content_review_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_step_instances" ADD CONSTRAINT "content_review_steps_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_step_instances" ADD CONSTRAINT "content_review_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "institution_review_workflows"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "content_review_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "content_review_step_instances"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "content_review_actions" ADD CONSTRAINT "content_review_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "degree_theses" ADD CONSTRAINT "degree_theses_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "degree_theses" ADD CONSTRAINT "degree_theses_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "degree_theses" ADD CONSTRAINT "degree_theses_reviewCaseId_fkey" FOREIGN KEY ("reviewCaseId") REFERENCES "content_review_cases"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "degree_theses" ADD CONSTRAINT "degree_theses_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "degree_thesis_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "degree_theses" ADD CONSTRAINT "degree_theses_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "degree_thesis_versions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "degree_thesis_versions" ADD CONSTRAINT "degree_thesis_versions_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "degree_theses"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "degree_thesis_versions" ADD CONSTRAINT "degree_thesis_versions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "oss_files"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "degree_thesis_versions" ADD CONSTRAINT "degree_thesis_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_submissions" ADD CONSTRAINT "paper_submissions_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_submissions" ADD CONSTRAINT "paper_submissions_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "paper_claims"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_submissions" ADD CONSTRAINT "paper_submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_submissions" ADD CONSTRAINT "paper_submissions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_submissions" ADD CONSTRAINT "paper_submissions_labId_fkey" FOREIGN KEY ("labId") REFERENCES "labs"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "paper_submissions" ADD CONSTRAINT "paper_submissions_oss_file_id_fkey" FOREIGN KEY ("oss_file_id") REFERENCES "oss_files"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "papers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_posts" ADD CONSTRAINT "forum_posts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_comments" ADD CONSTRAINT "forum_comments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES "forum_comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_likes" ADD CONSTRAINT "forum_likes_postId_fkey" FOREIGN KEY ("postId") REFERENCES "forum_posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "forum_likes" ADD CONSTRAINT "forum_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_periods" ADD CONSTRAINT "scholar_research_periods_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "scholar_research_timeline_generations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_periods" ADD CONSTRAINT "scholar_research_periods_scholar_id_fkey" FOREIGN KEY ("scholar_id") REFERENCES "scholars"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_timeline_generations" ADD CONSTRAINT "scholar_timeline_generations_scholar_id_fkey" FOREIGN KEY ("scholar_id") REFERENCES "scholars"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_timeline_generations" ADD CONSTRAINT "scholar_timeline_generations_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_timeline_generations" ADD CONSTRAINT "scholar_timeline_generations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_timeline_generations" ADD CONSTRAINT "scholar_timeline_generations_reused_from_id_fkey" FOREIGN KEY ("reused_from_id") REFERENCES "scholar_research_timeline_generations"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_period_papers" ADD CONSTRAINT "scholar_research_period_papers_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "scholar_research_periods"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_period_papers" ADD CONSTRAINT "scholar_research_period_papers_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_timeline_requests" ADD CONSTRAINT "scholar_timeline_requests_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "scholar_research_timeline_generations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_timeline_requests" ADD CONSTRAINT "scholar_timeline_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_timeline_issues" ADD CONSTRAINT "scholar_timeline_issues_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "scholar_research_timeline_generations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "scholar_research_timeline_issues" ADD CONSTRAINT "scholar_timeline_issues_paper_id_fkey" FOREIGN KEY ("paper_id") REFERENCES "papers"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- Install the provider-neutral core academic subject catalog.
INSERT INTO "academic_subjects" (
  "code", "nameZh", "nameEn", "source", "taxonomyVersion", "sortOrder"
)
VALUES
  ('computer-science', '计算机科学', 'Computer Science', 'platform', 'scholar-core-v1', 10),
  ('mathematics', '数学', 'Mathematics', 'platform', 'scholar-core-v1', 20),
  ('physics', '物理学', 'Physics', 'platform', 'scholar-core-v1', 30),
  ('chemistry', '化学', 'Chemistry', 'platform', 'scholar-core-v1', 40),
  ('life-sciences', '生命科学', 'Life Sciences', 'platform', 'scholar-core-v1', 50),
  ('medicine', '医学', 'Medicine', 'platform', 'scholar-core-v1', 60),
  ('engineering', '工程学', 'Engineering', 'platform', 'scholar-core-v1', 70),
  ('environmental-science', '环境科学', 'Environmental Science', 'platform', 'scholar-core-v1', 80),
  ('economics', '经济学', 'Economics', 'platform', 'scholar-core-v1', 90),
  ('sociology', '社会学', 'Sociology', 'platform', 'scholar-core-v1', 100),
  ('law', '法学', 'Law', 'platform', 'scholar-core-v1', 110),
  ('humanities', '人文学科', 'Humanities', 'platform', 'scholar-core-v1', 120)
ON CONFLICT ("code") DO UPDATE SET
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "source" = EXCLUDED."source",
  "taxonomyVersion" = EXCLUDED."taxonomyVersion",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "academic_subjects" (
  "code", "parentId", "nameZh", "nameEn", "source", "taxonomyVersion", "sortOrder"
)
SELECT
  child."code",
  parent."id",
  child."nameZh",
  child."nameEn",
  'platform',
  'scholar-core-v1',
  child."sortOrder"
FROM (
  VALUES
    ('artificial-intelligence', 'computer-science', '人工智能', 'Artificial Intelligence', 11),
    ('data-science', 'computer-science', '数据科学', 'Data Science', 12),
    ('database-systems', 'computer-science', '数据库系统', 'Database Systems', 13),
    ('software-engineering', 'computer-science', '软件工程', 'Software Engineering', 14)
) AS child("code", "parentCode", "nameZh", "nameEn", "sortOrder")
JOIN "academic_subjects" parent ON parent."code" = child."parentCode"
ON CONFLICT ("code") DO UPDATE SET
  "parentId" = EXCLUDED."parentId",
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "source" = EXCLUDED."source",
  "taxonomyVersion" = EXCLUDED."taxonomyVersion",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "academic_subjects" (
  "code", "parentId", "nameZh", "nameEn", "source", "taxonomyVersion", "sortOrder"
)
SELECT
  child."code",
  parent."id",
  child."nameZh",
  child."nameEn",
  'platform',
  'scholar-core-v1',
  child."sortOrder"
FROM (
  VALUES
    ('machine-learning', 'artificial-intelligence', '机器学习', 'Machine Learning', 111),
    ('computer-vision', 'artificial-intelligence', '计算机视觉', 'Computer Vision', 112),
    ('natural-language-processing', 'artificial-intelligence', '自然语言处理', 'Natural Language Processing', 113),
    ('big-data', 'data-science', '大数据', 'Big Data', 121),
    ('program-analysis', 'software-engineering', '程序分析', 'Program Analysis', 141),
    ('formal-methods', 'software-engineering', '形式化方法', 'Formal Methods', 142),
    ('software-testing', 'software-engineering', '软件测试', 'Software Testing', 143)
) AS child("code", "parentCode", "nameZh", "nameEn", "sortOrder")
JOIN "academic_subjects" parent ON parent."code" = child."parentCode"
ON CONFLICT ("code") DO UPDATE SET
  "parentId" = EXCLUDED."parentId",
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "source" = EXCLUDED."source",
  "taxonomyVersion" = EXCLUDED."taxonomyVersion",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "academic_subjects" (
  "code", "parentId", "nameZh", "nameEn", "source", "taxonomyVersion", "sortOrder"
)
SELECT
  'deep-learning',
  parent."id",
  '深度学习',
  'Deep Learning',
  'platform',
  'scholar-core-v1',
  1111
FROM "academic_subjects" parent
WHERE parent."code" = 'machine-learning'
ON CONFLICT ("code") DO UPDATE SET
  "parentId" = EXCLUDED."parentId",
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "source" = EXCLUDED."source",
  "taxonomyVersion" = EXCLUDED."taxonomyVersion",
  "sortOrder" = EXCLUDED."sortOrder";

INSERT INTO "academic_subject_aliases" (
  "subjectId", "scopeKey", "alias", "normalizedAlias", "locale"
)
SELECT
  subject."id",
  'global',
  subject."nameZh",
  lower(regexp_replace(btrim(subject."nameZh"), '\s+', ' ', 'g')),
  'zh-CN'
FROM "academic_subjects" subject
WHERE subject."source" = 'platform'
UNION ALL
SELECT
  subject."id",
  'global',
  subject."nameEn",
  lower(regexp_replace(btrim(subject."nameEn"), '\s+', ' ', 'g')),
  'en'
FROM "academic_subjects" subject
WHERE subject."source" = 'platform' AND subject."nameEn" IS NOT NULL
ON CONFLICT ("scopeKey", "normalizedAlias") DO NOTHING;

INSERT INTO "academic_subject_aliases" (
  "subjectId", "scopeKey", "alias", "normalizedAlias", "locale"
)
SELECT
  subject."id",
  'global',
  alias."alias",
  lower(regexp_replace(btrim(alias."alias"), '\s+', ' ', 'g')),
  alias."locale"
FROM (
  VALUES
    ('computer-science', '计算机科学与技术', 'zh-CN'),
    ('computer-science', 'Computer Science and Technology', 'en'),
    ('artificial-intelligence', 'AI', 'en')
) AS alias("subjectCode", "alias", "locale")
JOIN "academic_subjects" subject ON subject."code" = alias."subjectCode"
ON CONFLICT ("scopeKey", "normalizedAlias") DO NOTHING;
