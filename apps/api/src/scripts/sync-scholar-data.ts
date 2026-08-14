import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { Prisma, PrismaClient } from '../../prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { normalizeDoi } from '../utils/doi'

interface SyncedPaperRecord {
  id: string
  title: string
  abstract: string | null
  doi: string
  normalized_doi: string
  journal_name: string | null
  publish_year: number | null
  publish_date: Date | null
  paper_type: number | null
  language: number | null
  citation_count: number | null
  pages: string | null
  keywords: string[]
  link: string | null
  createdAt: Date
  updatedAt: Date
}

interface ClaimRecord {
  id: string
  paperId: string
  institutionId: string
  labId: string | null
  submittedBy: string
  submissionId: string | null
  reviewCaseId: string
  review_status: string
  review_notes: string | null
  reviewedBy: string | null
  reviewedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

interface SubmissionRecord {
  id: string
  paperId: string
  claimId: string | null
  userId: string
  institutionId: string | null
  labId: string | null
  oss_file_id: string | null
  metadata_snapshot: Prisma.JsonValue
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

interface ClearCounters {
  embeddings: number
  paperClaims: number
  paperSubmissions: number
  paperAuthors: number
  papers: number
  scholars: number
  authors: number
  scholarPapers: number
  institutionPaperAuthorBindings: number
}

interface ClearTargets {
  paperIds: string[]
  profileIds: string[]
}

interface SummaryCounters {
  cleared: ClearCounters
  papers: {
    created: number
    updated: number
    unchanged: number
    skipped: number
    conflicts: number
  }
  scholars: {
    created: number
    updated: number
    unchanged: number
  }
  authors: {
    created: number
    updated: number
    unchanged: number
  }
  paperAuthors: {
    created: number
    unchanged: number
    skippedMissingPaper: number
  }
  scholarPapers: {
    created: number
    updated: number
    skippedMissingPaper: number
  }
  institutionPaperAuthorBindings: {
    created: number
    updated: number
    unchanged: number
    skippedMissingPaper: number
    conflicts: number
  }
  publicClaims: {
    created: number
    updated: number
    approvedExisting: number
  }
  submissions: {
    created: number
    updated: number
  }
}

const DEFAULT_PAPER_TYPE = 1
const DEFAULT_LANGUAGE = 1
const CHUNK_SIZE = 500
const DRY_RUN_FLAG = '--dry-run'
const CLEAR_FLAG = '--clear'
const MAX_WARNING_OUTPUT = 100
const isDryRun = process.argv.includes(DRY_RUN_FLAG)
const isClear = process.argv.includes(CLEAR_FLAG)

const connectionString = process.env.DATABASE_URL
const importInstitutionName = process.env.SCHOLAR_IMPORT_INSTITUTION_NAME?.trim()

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}
if (!importInstitutionName) {
  throw new Error('SCHOLAR_IMPORT_INSTITUTION_NAME environment variable is required')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const emptyJsonArray: Prisma.InputJsonArray = []
const emptyClearCounters: ClearCounters = {
  embeddings: 0,
  paperClaims: 0,
  paperSubmissions: 0,
  paperAuthors: 0,
  papers: 0,
  scholars: 0,
  authors: 0,
  scholarPapers: 0,
  institutionPaperAuthorBindings: 0,
}

const summary: SummaryCounters = {
  cleared: { ...emptyClearCounters },
  papers: {
    created: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    conflicts: 0,
  },
  scholars: {
    created: 0,
    updated: 0,
    unchanged: 0,
  },
  authors: {
    created: 0,
    updated: 0,
    unchanged: 0,
  },
  paperAuthors: {
    created: 0,
    unchanged: 0,
    skippedMissingPaper: 0,
  },
  scholarPapers: {
    created: 0,
    updated: 0,
    skippedMissingPaper: 0,
  },
  institutionPaperAuthorBindings: {
    created: 0,
    updated: 0,
    unchanged: 0,
    skippedMissingPaper: 0,
    conflicts: 0,
  },
  publicClaims: {
    created: 0,
    updated: 0,
    approvedExisting: 0,
  },
  submissions: {
    created: 0,
    updated: 0,
  },
}

const warnings: string[] = []
let warningOutputSuppressed = false

const logInfo = (message: string) => {
  console.log(message)
}

const logWarn = (message: string) => {
  warnings.push(message)

  if (warnings.length <= MAX_WARNING_OUTPUT) {
    console.warn(message)
    return
  }

  if (!warningOutputSuppressed) {
    warningOutputSuppressed = true
    console.warn(`Further warnings suppressed after ${MAX_WARNING_OUTPUT} entries`)
  }
}

const chunkArray = <T>(items: T[], size: number): T[][] => {
  if (items.length === 0) {
    return []
  }

  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }

  return chunks
}

const normalizeOptionalString = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const normalizeStringArray = (values: readonly string[] | null | undefined): string[] => {
  if (!Array.isArray(values)) {
    return []
  }

  const resolved: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const normalized = normalizeOptionalString(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    resolved.push(normalized)
  }

  return resolved
}

const hasSameStringArray = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false
    }
  }

  return true
}

const dedupeDoiList = (doiList: string[]): string[] => {
  const resolved: string[] = []
  const seen = new Set<string>()

  for (const rawDoi of doiList) {
    const doi = normalizeDoi(rawDoi)
    if (!doi || seen.has(doi)) {
      continue
    }

    seen.add(doi)
    resolved.push(doi)
  }

  return resolved
}

const buildSubmissionSnapshot = (paper: SyncedPaperRecord): Prisma.InputJsonObject => {
  return {
    title: paper.title,
    abstract: paper.abstract,
    doi: paper.doi,
    journal_name: paper.journal_name,
    publish_year: paper.publish_year,
    publish_date: paper.publish_date ? paper.publish_date.toISOString().split('T')[0] : null,
    paper_type: paper.paper_type,
    language: paper.language,
    citation_count: paper.citation_count,
    pages: paper.pages,
    keywords: paper.keywords,
    link: paper.link,
  }
}

const printSummary = () => {
  console.log(
    JSON.stringify(
      {
        dryRun: isDryRun,
        clear: isClear,
        summary,
        warningCount: warnings.length,
      },
      null,
      2,
    ),
  )
}

const groupBy = <T, K>(items: T[], getKey: (item: T) => K): Map<K, T[]> => {
  const grouped = new Map<K, T[]>()

  for (const item of items) {
    const key = getKey(item)
    const existing = grouped.get(key) ?? []
    existing.push(item)
    grouped.set(key, existing)
  }

  return grouped
}

const loadPapersByDoi = async (dois: string[]) => {
  const results: SyncedPaperRecord[] = []

  const normalizedDois = dedupeDoiList(dois)
  for (const chunk of chunkArray(normalizedDois, CHUNK_SIZE)) {
    const papers = await prisma.papers.findMany({
      where: {
        normalized_doi: { in: chunk },
      },
    })
    results.push(...papers)
  }

  return results
}

const loadClearTargets = async (): Promise<ClearTargets> => {
  const [sourceProfiles, sourcePapers] = await Promise.all([
    prisma.scholar_source_profiles.findMany({
      select: { id: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.scholar_source_papers.findMany({
      select: { doi: true },
      orderBy: [{ createdAt: 'asc' }, { doi: 'asc' }],
    }),
  ])
  const profileIds = sourceProfiles.map((profile) => profile.id)
  const sourceDois = sourcePapers.map((paper) => paper.doi)
  const papers = await loadPapersByDoi(sourceDois)

  return {
    profileIds,
    paperIds: [...new Set(papers.map((paper) => paper.id))],
  }
}

const buildPaperAuthorClearWhere = (
  targets: ClearTargets,
): Prisma.paper_authorsWhereInput | null => {
  const filters: Prisma.paper_authorsWhereInput[] = []

  if (targets.paperIds.length > 0) {
    filters.push({ paperId: { in: targets.paperIds } })
  }

  if (targets.profileIds.length > 0) {
    filters.push({ authorId: { in: targets.profileIds } })
  }

  return filters.length > 0 ? { OR: filters } : null
}

const buildScholarPaperClearWhere = (
  targets: ClearTargets,
): Prisma.scholar_papersWhereInput | null => {
  const filters: Prisma.scholar_papersWhereInput[] = []

  if (targets.paperIds.length > 0) {
    filters.push({ paperId: { in: targets.paperIds } })
  }

  if (targets.profileIds.length > 0) {
    filters.push({ scholarId: { in: targets.profileIds } })
  }

  return filters.length > 0 ? { OR: filters } : null
}

const buildInstitutionPaperAuthorBindingClearWhere = (
  targets: ClearTargets,
  institutionId: string,
): Prisma.institution_paper_author_bindingsWhereInput | null => {
  const filters: Prisma.institution_paper_author_bindingsWhereInput[] = []

  if (targets.paperIds.length > 0) {
    filters.push({ paperId: { in: targets.paperIds } })
  }

  if (targets.profileIds.length > 0) {
    filters.push({ authorId: { in: targets.profileIds } })
    filters.push({ userId: { in: targets.profileIds } })
  }

  return filters.length > 0
    ? {
        institutionId,
        OR: filters,
      }
    : null
}

const countClearTargets = async (
  targets: ClearTargets,
  institutionId: string,
): Promise<ClearCounters> => {
  const counters: ClearCounters = { ...emptyClearCounters }
  const paperAuthorWhere = buildPaperAuthorClearWhere(targets)
  const scholarPaperWhere = buildScholarPaperClearWhere(targets)
  const institutionPaperAuthorBindingWhere = buildInstitutionPaperAuthorBindingClearWhere(
    targets,
    institutionId,
  )

  if (targets.paperIds.length > 0) {
    const paperScopedWhere = { paperId: { in: targets.paperIds } }
    const [embeddings, paperClaims, paperSubmissions, papers] = await Promise.all([
      prisma.embeddings.count({ where: paperScopedWhere }),
      prisma.paper_claims.count({ where: paperScopedWhere }),
      prisma.paper_submissions.count({ where: paperScopedWhere }),
      prisma.papers.count({ where: { id: { in: targets.paperIds } } }),
    ])
    counters.embeddings = embeddings
    counters.paperClaims = paperClaims
    counters.paperSubmissions = paperSubmissions
    counters.papers = papers
  }

  if (targets.profileIds.length > 0) {
    const [scholars, authors] = await Promise.all([
      prisma.scholars.count({ where: { id: { in: targets.profileIds } } }),
      prisma.authors.count({ where: { id: { in: targets.profileIds } } }),
    ])
    counters.scholars = scholars
    counters.authors = authors
  }

  if (paperAuthorWhere) {
    counters.paperAuthors = await prisma.paper_authors.count({ where: paperAuthorWhere })
  }

  if (scholarPaperWhere) {
    counters.scholarPapers = await prisma.scholar_papers.count({
      where: scholarPaperWhere,
    })
  }

  if (institutionPaperAuthorBindingWhere) {
    counters.institutionPaperAuthorBindings = await prisma.institution_paper_author_bindings.count({
      where: institutionPaperAuthorBindingWhere,
    })
  }

  return counters
}

const clearImportedData = async (institutionId: string) => {
  const targets = await loadClearTargets()

  logInfo(
    `Clearing scholar sync data for ${targets.paperIds.length} papers and ${targets.profileIds.length} profiles`,
  )

  if (isDryRun) {
    summary.cleared = await countClearTargets(targets, institutionId)
    return
  }

  const paperAuthorWhere = buildPaperAuthorClearWhere(targets)
  const scholarPaperWhere = buildScholarPaperClearWhere(targets)
  const institutionPaperAuthorBindingWhere = buildInstitutionPaperAuthorBindingClearWhere(
    targets,
    institutionId,
  )

  summary.cleared = await prisma.$transaction(async (tx): Promise<ClearCounters> => {
    const counters: ClearCounters = { ...emptyClearCounters }

    if (institutionPaperAuthorBindingWhere) {
      counters.institutionPaperAuthorBindings = (
        await tx.institution_paper_author_bindings.deleteMany({
          where: institutionPaperAuthorBindingWhere,
        })
      ).count
    }

    if (scholarPaperWhere) {
      counters.scholarPapers = (
        await tx.scholar_papers.deleteMany({ where: scholarPaperWhere })
      ).count
    }

    if (paperAuthorWhere) {
      counters.paperAuthors = (await tx.paper_authors.deleteMany({ where: paperAuthorWhere })).count
    }

    if (targets.paperIds.length > 0) {
      const paperScopedWhere = { paperId: { in: targets.paperIds } }
      const claimIds = (
        await tx.paper_claims.findMany({ where: paperScopedWhere, select: { id: true } })
      ).map((claim) => claim.id)

      await tx.paper_claims.updateMany({
        where: paperScopedWhere,
        data: {
          submissionId: null,
        },
      })

      counters.paperSubmissions = (
        await tx.paper_submissions.deleteMany({ where: paperScopedWhere })
      ).count
      counters.paperClaims = claimIds.length
      if (claimIds.length > 0) {
        await tx.content_review_cases.deleteMany({
          where: { content_type: 'paper', subjectId: { in: claimIds } },
        })
      }
      counters.embeddings = (await tx.embeddings.deleteMany({ where: paperScopedWhere })).count
      counters.papers = (
        await tx.papers.deleteMany({ where: { id: { in: targets.paperIds } } })
      ).count
    }

    if (targets.profileIds.length > 0) {
      counters.authors = (
        await tx.authors.deleteMany({ where: { id: { in: targets.profileIds } } })
      ).count
      counters.scholars = (
        await tx.scholars.deleteMany({ where: { id: { in: targets.profileIds } } })
      ).count
    }

    return counters
  })
}

const loadScholarsById = async (ids: string[]) => {
  const results: Awaited<ReturnType<typeof prisma.scholars.findMany>> = []

  for (const chunk of chunkArray(ids, CHUNK_SIZE)) {
    const scholars = await prisma.scholars.findMany({
      where: {
        id: { in: chunk },
      },
    })
    results.push(...scholars)
  }

  return results
}

const loadAuthorsById = async (ids: string[]) => {
  const results: Awaited<ReturnType<typeof prisma.authors.findMany>> = []

  for (const chunk of chunkArray(ids, CHUNK_SIZE)) {
    const authors = await prisma.authors.findMany({
      where: {
        id: { in: chunk },
      },
    })
    results.push(...authors)
  }

  return results
}

const loadInstitutionPaperAuthorBindings = async (institutionId: string, authorIds: string[]) => {
  const results: Awaited<ReturnType<typeof prisma.institution_paper_author_bindings.findMany>> = []
  const seenBindingIds = new Set<string>()

  for (const chunk of chunkArray(authorIds, CHUNK_SIZE)) {
    const bindings = await prisma.institution_paper_author_bindings.findMany({
      where: {
        institutionId,
        OR: [{ authorId: { in: chunk } }, { userId: { in: chunk } }],
      },
    })
    for (const binding of bindings) {
      if (seenBindingIds.has(binding.id)) {
        continue
      }

      seenBindingIds.add(binding.id)
      results.push(binding)
    }
  }

  return results
}

const loadPaperAuthorsByPaperId = async (paperIds: string[]) => {
  const results: Awaited<ReturnType<typeof prisma.paper_authors.findMany>> = []

  for (const chunk of chunkArray(paperIds, CHUNK_SIZE)) {
    const paperAuthors = await prisma.paper_authors.findMany({
      where: {
        paperId: { in: chunk },
      },
    })
    results.push(...paperAuthors)
  }

  return results
}

const loadScholarLinksByScholarId = async (scholarIds: string[]) => {
  const results: Awaited<ReturnType<typeof prisma.scholar_papers.findMany>> = []

  for (const chunk of chunkArray(scholarIds, CHUNK_SIZE)) {
    const links = await prisma.scholar_papers.findMany({
      where: {
        scholarId: { in: chunk },
      },
    })
    results.push(...links)
  }

  return results
}

const loadClaimsByPaperId = async (paperIds: string[]) => {
  const results: ClaimRecord[] = []

  for (const chunk of chunkArray(paperIds, CHUNK_SIZE)) {
    const claims = await prisma.paper_claims.findMany({
      where: {
        paperId: { in: chunk },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { review_case: true },
    })
    results.push(
      ...claims.map((claim) => ({
        ...claim,
        review_status: claim.review_case.status,
        review_notes: claim.review_case.decision_notes,
        reviewedBy: claim.review_case.decidedBy,
        reviewedAt: claim.review_case.decidedAt,
      })),
    )
  }

  return results
}

const loadSubmissionsByPaperId = async (paperIds: string[]) => {
  const results: SubmissionRecord[] = []

  for (const chunk of chunkArray(paperIds, CHUNK_SIZE)) {
    const submissions = await prisma.paper_submissions.findMany({
      where: {
        paperId: { in: chunk },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })
    results.push(...submissions)
  }

  return results
}

const selectAdminUser = async () => {
  const admin = await prisma.users.findFirst({
    where: {
      platform_role: 'platform_admin',
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      username: true,
      name: true,
    },
  })

  if (!admin) {
    throw new Error('No platform_admin user found for scholar sync')
  }

  return admin
}

const selectInstitutionByName = async (name: string) => {
  const institution = await prisma.institutions.findFirst({
    where: { name },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
    },
  })

  if (!institution) {
    throw new Error(`Institution "${name}" not found`)
  }

  return institution
}

const syncPapers = async () => {
  const sourcePapers = await prisma.scholar_source_papers.findMany({
    orderBy: [{ createdAt: 'asc' }, { doi: 'asc' }],
  })
  const sourceDois = sourcePapers.map((paper) => normalizeDoi(paper.doi))
  const existingPapers = await loadPapersByDoi(sourceDois)
  const existingPaperGroups = groupBy(existingPapers, (paper) => paper.normalized_doi)
  const finalPaperMap = new Map<string, SyncedPaperRecord>()

  for (const sourcePaper of sourcePapers) {
    const doi = normalizeDoi(sourcePaper.doi)
    const title = sourcePaper.title.trim()
    const missingFields: string[] = []

    if (!doi) missingFields.push('doi')
    if (!title) missingFields.push('title')

    if (missingFields.length > 0) {
      summary.papers.skipped += 1
      logWarn(
        `Skipped scholar_source_papers row missing ${missingFields.join(', ')}: doi="${sourcePaper.doi}"`,
      )
      continue
    }

    const publishYear = null
    const abstract = normalizeOptionalString(sourcePaper.abstract)
    const existingMatches = existingPaperGroups.get(doi) ?? []

    if (existingMatches.length > 1) {
      summary.papers.conflicts += 1
      logWarn(`Skipped DOI "${doi}" because papers has duplicate rows`)
      continue
    }

    const runAt = new Date()

    if (existingMatches.length === 0) {
      const createData = {
        title,
        abstract,
        doi,
        normalized_doi: doi,
        journal_name: null,
        publish_year: publishYear,
        publish_date: null,
        paper_type: DEFAULT_PAPER_TYPE,
        language: DEFAULT_LANGUAGE,
        citation_count: null,
        pages: null,
        keywords: [],
        link: null,
        createdAt: runAt,
        updatedAt: runAt,
      } satisfies Prisma.papersCreateInput

      const createdPaper = isDryRun
        ? ({
            id: `dry-run-paper:${doi}`,
            ...createData,
          } satisfies SyncedPaperRecord)
        : await prisma.papers.create({ data: createData })

      summary.papers.created += 1
      finalPaperMap.set(doi, createdPaper)
      continue
    }

    const existingPaper = existingMatches[0]
    const hasChanges =
      existingPaper.title !== title ||
      existingPaper.abstract !== abstract ||
      existingPaper.publish_year !== publishYear

    if (!hasChanges) {
      summary.papers.unchanged += 1
      finalPaperMap.set(doi, existingPaper)
      continue
    }

    const updateData = {
      title,
      abstract,
      doi,
      normalized_doi: doi,
      publish_year: publishYear,
      updatedAt: runAt,
    } satisfies Prisma.papersUpdateInput

    const updatedPaper = isDryRun
      ? ({
          ...existingPaper,
          title,
          abstract,
          doi,
          normalized_doi: doi,
          publish_year: publishYear,
          updatedAt: runAt,
        } satisfies SyncedPaperRecord)
      : await prisma.papers.update({
          where: { id: existingPaper.id },
          data: updateData,
        })

    summary.papers.updated += 1
    finalPaperMap.set(doi, updatedPaper)
  }

  return {
    sourcePapers,
    finalPaperMap,
  }
}

const syncScholars = async () => {
  const sourceProfiles = await prisma.scholar_source_profiles.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  const existingScholars = await loadScholarsById(sourceProfiles.map((profile) => profile.id))
  const scholarMap = new Map(existingScholars.map((scholar) => [scholar.id, scholar]))

  for (const profile of sourceProfiles) {
    const name = profile.name.trim()
    const college = normalizeStringArray(profile.academy)
    const existingScholar = scholarMap.get(profile.id)
    const runAt = new Date()

    if (!existingScholar) {
      const createData = {
        id: profile.id,
        name,
        avatar: null,
        college,
        title: null,
        lab: null,
        office: null,
        email: null,
        phone: null,
        bio: null,
        join_year: null,
        research_directions: emptyJsonArray,
        education: emptyJsonArray,
        achievements: emptyJsonArray,
        letter_index: null,
        createdAt: runAt,
        updatedAt: runAt,
      } satisfies Prisma.scholarsCreateInput

      if (!isDryRun) {
        const createdScholar = await prisma.scholars.create({ data: createData })
        scholarMap.set(createdScholar.id, createdScholar)
      }

      summary.scholars.created += 1
      continue
    }

    const hasChanges =
      existingScholar.name !== name || !hasSameStringArray(existingScholar.college, college)

    if (!hasChanges) {
      summary.scholars.unchanged += 1
      continue
    }

    if (!isDryRun) {
      const updatedScholar = await prisma.scholars.update({
        where: { id: profile.id },
        data: {
          name,
          college,
          updatedAt: runAt,
        },
      })
      scholarMap.set(updatedScholar.id, updatedScholar)
    }

    summary.scholars.updated += 1
  }

  return {
    sourceProfiles,
  }
}

const syncAuthors = async (
  sourceProfiles: Awaited<ReturnType<typeof prisma.scholar_source_profiles.findMany>>,
) => {
  const existingAuthors = await loadAuthorsById(sourceProfiles.map((profile) => profile.id))
  const authorMap = new Map(existingAuthors.map((author) => [author.id, author]))

  for (const profile of sourceProfiles) {
    const name = profile.name.trim()
    const existingAuthor = authorMap.get(profile.id)
    const runAt = new Date()

    if (!existingAuthor) {
      const createData = {
        id: profile.id,
        name,
        email: null,
        phone: null,
        createdAt: runAt,
        updatedAt: runAt,
      } satisfies Prisma.authorsCreateInput

      if (!isDryRun) {
        const createdAuthor = await prisma.authors.create({ data: createData })
        authorMap.set(createdAuthor.id, createdAuthor)
      }

      summary.authors.created += 1
      continue
    }

    if (existingAuthor.name === name) {
      summary.authors.unchanged += 1
      continue
    }

    if (!isDryRun) {
      const updatedAuthor = await prisma.authors.update({
        where: { id: profile.id },
        data: {
          name,
          updatedAt: runAt,
        },
      })
      authorMap.set(updatedAuthor.id, updatedAuthor)
    }

    summary.authors.updated += 1
  }
}

const syncScholarPapers = async (
  sourceProfiles: Awaited<ReturnType<typeof prisma.scholar_source_profiles.findMany>>,
  finalPaperMap: Map<string, SyncedPaperRecord>,
) => {
  const existingLinks = await loadScholarLinksByScholarId(
    sourceProfiles.map((profile) => profile.id),
  )
  const existingLinkMap = new Map(
    existingLinks.map((link) => [`${link.scholarId}:${link.paperId}`, link]),
  )

  for (const profile of sourceProfiles) {
    const dedupedDoiList = dedupeDoiList(profile.doi_list)

    for (let index = 0; index < dedupedDoiList.length; index++) {
      const doi = dedupedDoiList[index]
      const paper = finalPaperMap.get(doi)

      if (!paper) {
        summary.scholarPapers.skippedMissingPaper += 1
        logWarn(
          `Skipped scholar_papers link for scholar "${profile.id}" because DOI "${doi}" was not synced`,
        )
        continue
      }

      const desiredDisplayOrder = index + 1
      const desiredRepresentative = index === 0
      const linkKey = `${profile.id}:${paper.id}`
      const existingLink = existingLinkMap.get(linkKey)

      if (!existingLink) {
        if (!isDryRun) {
          const createdLink = await prisma.scholar_papers.create({
            data: {
              scholarId: profile.id,
              paperId: paper.id,
              is_representative: desiredRepresentative,
              display_order: desiredDisplayOrder,
            },
          })
          existingLinkMap.set(linkKey, createdLink)
        }

        summary.scholarPapers.created += 1
        continue
      }

      const hasChanges =
        existingLink.is_representative !== desiredRepresentative ||
        existingLink.display_order !== desiredDisplayOrder

      if (!hasChanges) {
        continue
      }

      if (!isDryRun) {
        const updatedLink = await prisma.scholar_papers.update({
          where: { id: existingLink.id },
          data: {
            is_representative: desiredRepresentative,
            display_order: desiredDisplayOrder,
          },
        })
        existingLinkMap.set(linkKey, updatedLink)
      }

      summary.scholarPapers.updated += 1
    }
  }
}

const syncPaperAuthors = async (
  sourceProfiles: Awaited<ReturnType<typeof prisma.scholar_source_profiles.findMany>>,
  finalPaperMap: Map<string, SyncedPaperRecord>,
) => {
  const paperIds = [...new Set([...finalPaperMap.values()].map((paper) => paper.id))]
  const realPaperIds = paperIds.filter((paperId) => !paperId.startsWith('dry-run-paper:'))
  const existingPaperAuthors = await loadPaperAuthorsByPaperId(realPaperIds)
  const existingPaperAuthorMap = new Map(
    existingPaperAuthors.map((paperAuthor) => [
      `${paperAuthor.paperId}:${paperAuthor.authorId}`,
      paperAuthor,
    ]),
  )
  const nextOrderByPaperId = new Map<string, number>()

  for (const paperId of paperIds) {
    const maxOrder = existingPaperAuthors
      .filter((paperAuthor) => paperAuthor.paperId === paperId)
      .reduce((max, paperAuthor) => Math.max(max, paperAuthor.order), 0)
    nextOrderByPaperId.set(paperId, maxOrder + 1)
  }

  for (const profile of sourceProfiles) {
    const authorId = profile.id
    const dedupedDoiList = dedupeDoiList(profile.doi_list)

    for (const doi of dedupedDoiList) {
      const paper = finalPaperMap.get(doi)

      if (!paper) {
        summary.paperAuthors.skippedMissingPaper += 1
        logWarn(
          `Skipped paper_authors link for author "${authorId}" because DOI "${doi}" was not synced`,
        )
        continue
      }

      const paperAuthorKey = `${paper.id}:${authorId}`
      if (existingPaperAuthorMap.has(paperAuthorKey)) {
        summary.paperAuthors.unchanged += 1
        continue
      }

      const order = nextOrderByPaperId.get(paper.id) ?? 1
      if (!isDryRun) {
        const createdPaperAuthor = await prisma.paper_authors.create({
          data: {
            paperId: paper.id,
            authorId,
            order,
          },
        })
        existingPaperAuthorMap.set(paperAuthorKey, createdPaperAuthor)
      }

      nextOrderByPaperId.set(paper.id, order + 1)
      summary.paperAuthors.created += 1
    }
  }
}

const syncInstitutionPaperAuthorBindings = async (
  sourceProfiles: Awaited<ReturnType<typeof prisma.scholar_source_profiles.findMany>>,
  finalPaperMap: Map<string, SyncedPaperRecord>,
  institutionId: string,
  boundByUserId: string,
) => {
  const existingBindings = await loadInstitutionPaperAuthorBindings(
    institutionId,
    sourceProfiles.map((profile) => profile.id),
  )
  const existingBindingByAuthor = new Map(
    existingBindings.map((binding) => [`${binding.paperId}:${binding.authorId}`, binding]),
  )
  const existingBindingByUser = new Map(
    existingBindings.map((binding) => [`${binding.paperId}:${binding.userId}`, binding]),
  )

  for (const profile of sourceProfiles) {
    const authorId = profile.id
    const userId = profile.id
    const dedupedDoiList = dedupeDoiList(profile.doi_list)

    for (const doi of dedupedDoiList) {
      const paper = finalPaperMap.get(doi)

      if (!paper) {
        summary.institutionPaperAuthorBindings.skippedMissingPaper += 1
        logWarn(
          `Skipped institution_paper_author_bindings row for author "${authorId}" because DOI "${doi}" was not synced`,
        )
        continue
      }

      const authorBindingKey = `${paper.id}:${authorId}`
      const userBindingKey = `${paper.id}:${userId}`
      const existingBinding = existingBindingByAuthor.get(authorBindingKey)
      const existingUserBinding = existingBindingByUser.get(userBindingKey)

      if (!existingBinding) {
        if (existingUserBinding && existingUserBinding.authorId !== authorId) {
          summary.institutionPaperAuthorBindings.conflicts += 1
          logWarn(
            `Skipped institution_paper_author_bindings row for author "${authorId}" and paper "${paper.id}" because user "${userId}" is already bound to author "${existingUserBinding.authorId}"`,
          )
          continue
        }

        const runAt = new Date()
        if (!isDryRun) {
          const createdBinding = await prisma.institution_paper_author_bindings.create({
            data: {
              institutionId,
              paperId: paper.id,
              authorId,
              userId,
              boundBy: boundByUserId,
              createdAt: runAt,
              updatedAt: runAt,
            },
          })
          existingBindingByAuthor.set(authorBindingKey, createdBinding)
          existingBindingByUser.set(userBindingKey, createdBinding)
        }

        summary.institutionPaperAuthorBindings.created += 1
        continue
      }

      if (existingBinding.userId === userId && existingBinding.boundBy === boundByUserId) {
        summary.institutionPaperAuthorBindings.unchanged += 1
        continue
      }

      if (existingUserBinding && existingUserBinding.id !== existingBinding.id) {
        summary.institutionPaperAuthorBindings.conflicts += 1
        logWarn(
          `Skipped institution_paper_author_bindings update for author "${authorId}" and paper "${paper.id}" because user "${userId}" is already bound to author "${existingUserBinding.authorId}"`,
        )
        continue
      }

      if (!isDryRun) {
        const updatedBinding = await prisma.institution_paper_author_bindings.update({
          where: { id: existingBinding.id },
          data: {
            userId,
            boundBy: boundByUserId,
            updatedAt: new Date(),
          },
        })
        existingBindingByAuthor.set(authorBindingKey, updatedBinding)
        existingBindingByUser.set(userBindingKey, updatedBinding)
      }

      summary.institutionPaperAuthorBindings.updated += 1
    }
  }
}

const ensureSubmissionForClaim = async (
  claim: ClaimRecord,
  paper: SyncedPaperRecord,
  adminUserId: string,
  institutionId: string,
  submissionByClaimId: Map<string, SubmissionRecord[]>,
) => {
  const runAt = new Date()
  const snapshot = buildSubmissionSnapshot(paper)
  const linkedSubmissions = submissionByClaimId.get(claim.id) ?? []
  const linkedSubmission = claim.submissionId
    ? (linkedSubmissions.find((submission) => submission.id === claim.submissionId) ?? null)
    : (linkedSubmissions[0] ?? null)

  if (!linkedSubmission) {
    if (!isDryRun) {
      const createdSubmission = await prisma.paper_submissions.create({
        data: {
          paperId: paper.id,
          claimId: claim.id,
          userId: adminUserId,
          institutionId,
          labId: null,
          oss_file_id: null,
          metadata_snapshot: snapshot,
          notes: null,
          createdAt: runAt,
          updatedAt: runAt,
        },
      })

      if (claim.submissionId !== createdSubmission.id) {
        await prisma.paper_claims.update({
          where: { id: claim.id },
          data: {
            submissionId: createdSubmission.id,
            updatedAt: runAt,
          },
        })
        claim.submissionId = createdSubmission.id
        claim.updatedAt = runAt
      }

      const nextList = submissionByClaimId.get(claim.id) ?? []
      nextList.push(createdSubmission)
      submissionByClaimId.set(claim.id, nextList)
    }

    summary.submissions.created += 1
    return
  }

  const shouldUpdateSubmission =
    linkedSubmission.userId !== adminUserId ||
    linkedSubmission.institutionId !== institutionId ||
    linkedSubmission.labId !== null ||
    linkedSubmission.oss_file_id !== null ||
    linkedSubmission.notes !== null ||
    JSON.stringify(linkedSubmission.metadata_snapshot) !== JSON.stringify(snapshot)

  if (!isDryRun) {
    if (shouldUpdateSubmission) {
      const updatedSubmission = await prisma.paper_submissions.update({
        where: { id: linkedSubmission.id },
        data: {
          userId: adminUserId,
          institutionId,
          labId: null,
          oss_file_id: null,
          metadata_snapshot: snapshot,
          notes: null,
          updatedAt: runAt,
        },
      })

      if (claim.submissionId !== updatedSubmission.id) {
        await prisma.paper_claims.update({
          where: { id: claim.id },
          data: {
            submissionId: updatedSubmission.id,
            updatedAt: runAt,
          },
        })
        claim.submissionId = updatedSubmission.id
        claim.updatedAt = runAt
      }

      submissionByClaimId.set(
        claim.id,
        linkedSubmissions.map((submission) => {
          return submission.id === updatedSubmission.id ? updatedSubmission : submission
        }),
      )
    } else if (claim.submissionId !== linkedSubmission.id) {
      await prisma.paper_claims.update({
        where: { id: claim.id },
        data: {
          submissionId: linkedSubmission.id,
          updatedAt: runAt,
        },
      })
      claim.submissionId = linkedSubmission.id
      claim.updatedAt = runAt
    }
  } else if (!shouldUpdateSubmission && claim.submissionId === linkedSubmission.id) {
    return
  }

  summary.submissions.updated += 1
}

const ensurePublicClaims = async (
  finalPaperMap: Map<string, SyncedPaperRecord>,
  adminUserId: string,
  institutionId: string,
) => {
  const syncedPapers = [...finalPaperMap.values()]
  const realPapers = syncedPapers.filter((paper) => !paper.id.startsWith('dry-run-paper:'))
  const realPaperIds = realPapers.map((paper) => paper.id)
  const claims = await loadClaimsByPaperId(realPaperIds)
  const submissions = await loadSubmissionsByPaperId(realPaperIds)
  const claimsByPaperId = groupBy(claims, (claim) => claim.paperId)
  const submissionsByClaimId = groupBy(
    submissions.filter(
      (submission): submission is SubmissionRecord & { claimId: string } =>
        submission.claimId !== null,
    ),
    (submission) => submission.claimId,
  )

  for (const paper of syncedPapers) {
    const paperClaims = claimsByPaperId.get(paper.id) ?? []
    const institutionClaims = paperClaims.filter((claim) => {
      return claim.institutionId === institutionId && claim.labId === null
    })
    const approvedInstitutionClaim =
      institutionClaims.find((claim) => claim.review_status === 'approved') ?? null
    let activeClaim = approvedInstitutionClaim ?? institutionClaims[0] ?? null

    if (!activeClaim) {
      const runAt = new Date()

      if (!isDryRun) {
        const claimId = randomUUID()
        const reviewCase = await prisma.content_review_cases.create({
          data: {
            institutionId,
            content_type: 'paper',
            subjectId: claimId,
            currentVersionId: null,
            submittedBy: adminUserId,
            status: 'approved',
            currentStep: null,
            decidedBy: adminUserId,
            submittedAt: runAt,
            decidedAt: runAt,
            createdAt: runAt,
            updatedAt: runAt,
          },
        })
        const createdClaim = await prisma.paper_claims.create({
          data: {
            id: claimId,
            paperId: paper.id,
            institutionId,
            labId: null,
            submittedBy: adminUserId,
            submissionId: null,
            reviewCaseId: reviewCase.id,
            createdAt: runAt,
            updatedAt: runAt,
          },
        })
        activeClaim = {
          ...createdClaim,
          review_status: 'approved',
          review_notes: null,
          reviewedBy: adminUserId,
          reviewedAt: runAt,
        }

        const nextClaims = claimsByPaperId.get(paper.id) ?? []
        nextClaims.push(activeClaim)
        claimsByPaperId.set(paper.id, nextClaims)
      } else {
        activeClaim = {
          id: `dry-run-claim:${paper.id}`,
          paperId: paper.id,
          institutionId,
          labId: null,
          submittedBy: adminUserId,
          submissionId: null,
          reviewCaseId: `dry-run-review-case:${paper.id}`,
          review_status: 'approved',
          review_notes: null,
          reviewedBy: adminUserId,
          reviewedAt: runAt,
          createdAt: runAt,
          updatedAt: runAt,
        }
      }

      summary.publicClaims.created += 1
      await ensureSubmissionForClaim(
        activeClaim,
        paper,
        adminUserId,
        institutionId,
        submissionsByClaimId,
      )
      continue
    }

    const shouldUpdateClaim =
      activeClaim.institutionId !== institutionId ||
      activeClaim.labId !== null ||
      activeClaim.submittedBy !== adminUserId ||
      activeClaim.review_status !== 'approved' ||
      activeClaim.review_notes !== null ||
      activeClaim.reviewedBy !== adminUserId ||
      activeClaim.reviewedAt === null

    if (!shouldUpdateClaim) {
      summary.publicClaims.approvedExisting += 1
      await ensureSubmissionForClaim(
        activeClaim,
        paper,
        adminUserId,
        institutionId,
        submissionsByClaimId,
      )
      continue
    }

    const runAt = new Date()
    if (!isDryRun) {
      const updatedClaim = await prisma.paper_claims.update({
        where: { id: activeClaim.id },
        data: {
          institutionId,
          labId: null,
          submittedBy: adminUserId,
          updatedAt: runAt,
        },
      })
      await prisma.content_review_cases.update({
        where: { id: updatedClaim.reviewCaseId },
        data: {
          status: 'approved',
          currentStep: null,
          decision_notes: null,
          decidedBy: adminUserId,
          submittedAt: runAt,
          decidedAt: runAt,
          updatedAt: runAt,
        },
      })
      activeClaim = {
        ...updatedClaim,
        review_status: 'approved',
        review_notes: null,
        reviewedBy: adminUserId,
        reviewedAt: runAt,
      }

      const nextClaims = (claimsByPaperId.get(paper.id) ?? []).map((claim) => {
        return claim.id === activeClaim?.id ? activeClaim : claim
      })
      claimsByPaperId.set(paper.id, nextClaims)
    } else {
      activeClaim = {
        ...activeClaim,
        institutionId,
        labId: null,
        submittedBy: adminUserId,
        review_status: 'approved',
        review_notes: null,
        reviewedBy: adminUserId,
        reviewedAt: runAt,
        updatedAt: runAt,
      }
    }

    summary.publicClaims.updated += 1
    await ensureSubmissionForClaim(
      activeClaim,
      paper,
      adminUserId,
      institutionId,
      submissionsByClaimId,
    )
  }
}

const main = async () => {
  logInfo(`Starting scholar sync${isDryRun ? ' (dry run)' : ''}${isClear ? ' (clear)' : ''}`)

  const importInstitution = await selectInstitutionByName(importInstitutionName)
  logInfo(`Using institution ${importInstitution.name} (${importInstitution.id})`)

  if (isClear) {
    await clearImportedData(importInstitution.id)

    if (isDryRun) {
      logInfo('Dry-run clear completed; skipping sync because the database was not modified')
      printSummary()
      return
    }
  }

  const adminUser = await selectAdminUser()
  logInfo(`Using platform admin ${adminUser.username} (${adminUser.id})`)

  const { finalPaperMap } = await syncPapers()
  const { sourceProfiles } = await syncScholars()
  await syncAuthors(sourceProfiles)
  await syncPaperAuthors(sourceProfiles, finalPaperMap)
  await syncScholarPapers(sourceProfiles, finalPaperMap)
  await ensurePublicClaims(finalPaperMap, adminUser.id, importInstitution.id)
  await syncInstitutionPaperAuthorBindings(
    sourceProfiles,
    finalPaperMap,
    importInstitution.id,
    adminUser.id,
  )

  printSummary()
}

main()
  .catch((error) => {
    console.error('Scholar sync failed')
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
