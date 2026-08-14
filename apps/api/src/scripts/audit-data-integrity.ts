import process from 'node:process'
import { PrismaClient } from '../../prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'

interface IntegrityAuditRow {
  check_name: string
  issue_count: bigint
}

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
})

const run = async (): Promise<void> => {
  const rows = await prisma.$queryRaw<IntegrityAuditRow[]>`
    WITH normalized_papers AS (
      SELECT
        "id",
        lower(
          btrim(
            regexp_replace(
              regexp_replace(btrim("doi"), '^https?://(dx\\.)?doi\\.org/', '', 'i'),
              '^doi:[[:space:]]*',
              '',
              'i'
            )
          )
        ) AS normalized_doi
      FROM "papers"
    )
    SELECT 'papers.empty_normalized_doi' AS check_name, count(*)::bigint AS issue_count
    FROM normalized_papers
    WHERE normalized_doi = ''
    UNION ALL
    SELECT 'papers.duplicate_normalized_doi', count(*)::bigint
    FROM (
      SELECT normalized_doi
      FROM normalized_papers
      GROUP BY normalized_doi
      HAVING count(*) > 1
    ) duplicates
    UNION ALL
    SELECT 'embeddings.orphan_paper', count(*)::bigint
    FROM "embeddings" child
    LEFT JOIN "papers" parent ON parent."id" = child."paperId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'paper_authors.orphan_paper', count(*)::bigint
    FROM "paper_authors" child
    LEFT JOIN "papers" parent ON parent."id" = child."paperId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'paper_authors.orphan_author', count(*)::bigint
    FROM "paper_authors" child
    LEFT JOIN "authors" parent ON parent."id" = child."authorId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'scholar_papers.orphan_scholar', count(*)::bigint
    FROM "scholar_papers" child
    LEFT JOIN "scholars" parent ON parent."id" = child."scholarId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'scholar_papers.orphan_paper', count(*)::bigint
    FROM "scholar_papers" child
    LEFT JOIN "papers" parent ON parent."id" = child."paperId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'paper_claims.orphan_paper', count(*)::bigint
    FROM "paper_claims" child
    LEFT JOIN "papers" parent ON parent."id" = child."paperId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'paper_submissions.orphan_paper', count(*)::bigint
    FROM "paper_submissions" child
    LEFT JOIN "papers" parent ON parent."id" = child."paperId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'institution_scholar_mappings.orphan_scholar', count(*)::bigint
    FROM "institution_scholar_mappings" child
    LEFT JOIN "scholars" parent ON parent."id" = child."scholarId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'institution_memberships.orphan_institution', count(*)::bigint
    FROM "institution_memberships" child
    LEFT JOIN "institutions" parent ON parent."id" = child."institutionId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'institution_memberships.orphan_user', count(*)::bigint
    FROM "institution_memberships" child
    LEFT JOIN "users" parent ON parent."id" = child."userId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'lab_memberships.orphan_lab', count(*)::bigint
    FROM "lab_memberships" child
    LEFT JOIN "labs" parent ON parent."id" = child."labId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'lab_memberships.orphan_user', count(*)::bigint
    FROM "lab_memberships" child
    LEFT JOIN "users" parent ON parent."id" = child."userId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'paper_claims.orphan_submitter', count(*)::bigint
    FROM "paper_claims" child
    LEFT JOIN "users" parent ON parent."id" = child."submittedBy"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'paper_submissions.orphan_claim', count(*)::bigint
    FROM "paper_submissions" child
    LEFT JOIN "paper_claims" parent ON parent."id" = child."claimId"
    WHERE child."claimId" IS NOT NULL AND parent."id" IS NULL
    UNION ALL
    SELECT 'paper_submissions.orphan_user', count(*)::bigint
    FROM "paper_submissions" child
    LEFT JOIN "users" parent ON parent."id" = child."userId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'user_bookmarks.orphan_user', count(*)::bigint
    FROM "user_bookmarks" child
    LEFT JOIN "users" parent ON parent."id" = child."userId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'user_bookmarks.orphan_paper', count(*)::bigint
    FROM "user_bookmarks" child
    LEFT JOIN "papers" parent ON parent."id" = child."paperId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'forum_posts.orphan_paper', count(*)::bigint
    FROM "forum_posts" child
    LEFT JOIN "papers" parent ON parent."id" = child."paperId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'forum_comments.orphan_post', count(*)::bigint
    FROM "forum_comments" child
    LEFT JOIN "forum_posts" parent ON parent."id" = child."postId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'forum_likes.orphan_post', count(*)::bigint
    FROM "forum_likes" child
    LEFT JOIN "forum_posts" parent ON parent."id" = child."postId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'institution_data_import_items.orphan_import', count(*)::bigint
    FROM "institution_data_import_items" child
    LEFT JOIN "institution_data_imports" parent ON parent."id" = child."importId"
    WHERE parent."id" IS NULL
    UNION ALL
    SELECT 'paper_claims.missing_unified_review_case', count(*)::bigint
    FROM "paper_claims"
    WHERE "institutionId" IS NOT NULL AND "reviewCaseId" IS NULL
    UNION ALL
    SELECT 'content_review_cases.orphan_paper_subject', count(*)::bigint
    FROM "content_review_cases" review_case
    LEFT JOIN "paper_claims" claim ON claim."id" = review_case."subjectId"
    WHERE review_case."content_type" = 'paper' AND claim."id" IS NULL
    UNION ALL
    SELECT 'content_review_cases.orphan_degree_thesis_subject', count(*)::bigint
    FROM "content_review_cases" review_case
    LEFT JOIN "degree_theses" thesis ON thesis."id" = review_case."subjectId"
    WHERE review_case."content_type" = 'degree_thesis' AND thesis."id" IS NULL
    UNION ALL
    SELECT 'paper_claims.review_case_mismatch', count(*)::bigint
    FROM "paper_claims" claim
    JOIN "content_review_cases" review_case ON review_case."id" = claim."reviewCaseId"
    WHERE review_case."content_type" <> 'paper'
      OR review_case."subjectId" <> claim."id"
      OR review_case."institutionId" IS DISTINCT FROM claim."institutionId"
      OR review_case."submittedBy" <> claim."submittedBy"
    UNION ALL
    SELECT 'degree_theses.review_case_mismatch', count(*)::bigint
    FROM "degree_theses" thesis
    JOIN "content_review_cases" review_case ON review_case."id" = thesis."reviewCaseId"
    WHERE review_case."content_type" <> 'degree_thesis'
      OR review_case."subjectId" <> thesis."id"
      OR review_case."institutionId" <> thesis."institutionId"
      OR review_case."submittedBy" <> thesis."submittedBy"
    UNION ALL
    SELECT 'content_review_steps.case_scope_mismatch', count(*)::bigint
    FROM "content_review_step_instances" review_step
    JOIN "content_review_cases" review_case ON review_case."id" = review_step."caseId"
    WHERE review_step."institutionId" <> review_case."institutionId"
    UNION ALL
    SELECT 'content_review_actions.case_scope_mismatch', count(*)::bigint
    FROM "content_review_actions" review_action
    JOIN "content_review_cases" review_case ON review_case."id" = review_action."caseId"
    WHERE review_action."institutionId" <> review_case."institutionId"
    UNION ALL
    SELECT 'content_review_cases.invalid_current_step', count(*)::bigint
    FROM "content_review_cases" review_case
    WHERE (
      review_case."status" = 'pending_review'
      AND review_case."currentStep" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "content_review_step_instances" review_step
        WHERE review_step."caseId" = review_case."id"
          AND review_step."step_order" = review_case."currentStep"
          AND review_step."status" = 'pending'
      )
    ) OR (
      review_case."status" <> 'pending_review'
      AND EXISTS (
        SELECT 1
        FROM "content_review_step_instances" review_step
        WHERE review_step."caseId" = review_case."id"
          AND review_step."status" = 'pending'
      )
    )
    UNION ALL
    SELECT 'degree_theses.foreign_current_version', count(*)::bigint
    FROM "degree_theses" thesis
    JOIN "degree_thesis_versions" version ON version."id" = thesis."currentVersionId"
    WHERE version."thesisId" <> thesis."id"
    UNION ALL
    SELECT 'degree_theses.foreign_published_version', count(*)::bigint
    FROM "degree_theses" thesis
    JOIN "degree_thesis_versions" version ON version."id" = thesis."publishedVersionId"
    WHERE version."thesisId" <> thesis."id"
    UNION ALL
    SELECT 'degree_theses.review_version_mismatch', count(*)::bigint
    FROM "degree_theses" thesis
    JOIN "content_review_cases" review_case ON review_case."id" = thesis."reviewCaseId"
    WHERE review_case."currentVersionId" IS DISTINCT FROM thesis."currentVersionId"
    UNION ALL
    SELECT 'database.unvalidated_foreign_keys', count(*)::bigint
    FROM pg_constraint constraint_row
    JOIN pg_class relation ON relation.oid = constraint_row.conrelid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE constraint_row.contype = 'f'
      AND constraint_row.convalidated = false
      AND namespace.nspname = current_schema()
    ORDER BY check_name
  `

  const results = rows.map((row) => ({
    check: row.check_name,
    issues: Number(row.issue_count),
  }))
  const issueCount = results.reduce((total, result) => total + result.issues, 0)

  console.log(JSON.stringify({ ok: issueCount === 0, issueCount, results }, null, 2))
  if (issueCount > 0) {
    process.exitCode = 1
  }
}

try {
  await run()
} finally {
  await prisma.$disconnect()
}
