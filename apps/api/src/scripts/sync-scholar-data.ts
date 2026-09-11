import process from 'node:process'
import { Prisma, PrismaClient } from '../../prisma/generated/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { normalizeDoi } from '../utils/doi'
import { lockMutationScope } from '../utils/advisory-lock'
import { writePaperBibliography } from '../bibliography/write'
import { BibliographyConflict } from '../bibliography/identity'
import { ensureBibliographyClaim } from '../bibliography/claims'

interface SyncedPaperRecord {
  id: string
  title: string
  abstract: string | null
  doi: string | null
  normalized_doi: string | null
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
    preservedExisting: number
  }
  submissions: {
    created: number
    updated: number
  }
}

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
    preservedExisting: 0,
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
    filters.push({ person: { scholarId: { in: targets.profileIds } } })
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
        OR: [{ authorId: { in: chunk } }, { person: { scholarId: { in: chunk } } }],
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

const syncPapers = async (
  institutionId: string,
  actorUserId: string,
): Promise<{ finalPaperMap: Map<string, SyncedPaperRecord> }> => {
  const finalPaperMap = new Map<string, SyncedPaperRecord>()
  let cursor: string | undefined
  class SourcePreview extends Error {
    constructor(
      readonly result: { paper: SyncedPaperRecord; action: 'created' | 'updated' | 'unchanged' },
    ) {
      super('Rollback source preview')
    }
  }
  while (true) {
    const sourcePapers = await prisma.scholar_source_papers.findMany({
      take: CHUNK_SIZE,
      orderBy: { doi: 'asc' },
      ...(cursor ? { cursor: { doi: cursor }, skip: 1 } : {}),
      select: { doi: true, title: true, abstract: true },
    })
    if (!sourcePapers.length) break
    for (const source of sourcePapers) {
      const doi = normalizeDoi(source.doi)
      if (finalPaperMap.has(doi)) {
        summary.papers.conflicts += 1
        logWarn(
          'Skipped a duplicate normalized source DOI; reconcile the source records before importing',
        )
        continue
      }
      try {
        const operation = async (
          tx: Prisma.TransactionClient,
        ): Promise<{ paper: SyncedPaperRecord; action: 'created' | 'updated' | 'unchanged' }> => {
          const write = await writePaperBibliography(
            tx,
            {
              doi,
              title: source.title.trim(),
              abstract: normalizeOptionalString(source.abstract) ?? undefined,
            },
            { institutionId, actorUserId, source: 'scholar_source_sync' },
          )
          const result = {
            action: write.action,
            paper: await tx.papers.findUniqueOrThrow({ where: { id: write.paperId } }),
          }
          if (isDryRun) throw new SourcePreview(result)
          return result
        }
        let result: { paper: SyncedPaperRecord; action: 'created' | 'updated' | 'unchanged' }
        try {
          result = await prisma.$transaction(operation, { timeout: 30000 })
        } catch (error) {
          if (!(error instanceof SourcePreview)) throw error
          result = error.result
        }
        summary.papers[result.action] += 1
        finalPaperMap.set(doi, {
          ...result.paper,
          id: isDryRun && result.action === 'created' ? `dry-run-paper:${doi}` : result.paper.id,
        })
      } catch (error) {
        if (!(error instanceof BibliographyConflict)) throw error
        summary.papers.conflicts += 1
        logWarn(`Skipped invalid source metadata: ${error.message}`)
      }
    }
    cursor = sourcePapers.at(-1)!.doi
  }
  return { finalPaperMap }
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
  const existingBindingByPerson = new Map(
    existingBindings.map((binding) => [`${binding.paperId}:${binding.personId}`, binding]),
  )
  const existingPeople = await prisma.institution_people.findMany({
    where: {
      institutionId,
      scholarId: { in: sourceProfiles.map((profile) => profile.id) },
    },
  })
  const personByScholarId = new Map<string, (typeof existingPeople)[number]>()
  for (const person of existingPeople) {
    if (person.scholarId) {
      personByScholarId.set(person.scholarId, person)
    }
  }
  const matchingUsers = await prisma.users.findMany({
    where: { id: { in: sourceProfiles.map((profile) => profile.id) } },
    select: { id: true },
  })
  const matchingUserIds = new Set(matchingUsers.map((user) => user.id))

  for (const profile of sourceProfiles) {
    if (personByScholarId.has(profile.id) || isDryRun) {
      continue
    }
    const runAt = new Date()
    const person = await prisma.$transaction(async (tx) => {
      await lockMutationScope(tx, 'institution-identity', institutionId)
      const existingPerson = await tx.institution_people.findUnique({
        where: { institutionId_scholarId: { institutionId, scholarId: profile.id } },
      })
      if (existingPerson) return existingPerson
      return tx.institution_people.create({
        data: {
          institutionId,
          key: `scholar:${profile.id}`,
          internalId: `legacy-scholar:${profile.id}`,
          normalizedInternalId: `legacy-scholar:${profile.id}`,
          name: profile.name.trim(),
          userId: matchingUserIds.has(profile.id) ? profile.id : null,
          scholarId: profile.id,
          userLinkedAt: matchingUserIds.has(profile.id) ? runAt : null,
          scholarLinkedAt: runAt,
          createdAt: runAt,
          updatedAt: runAt,
        },
      })
    })
    personByScholarId.set(profile.id, person)
  }

  for (const profile of sourceProfiles) {
    const authorId = profile.id
    const person = personByScholarId.get(profile.id)
    if (!person && !isDryRun) {
      throw new Error(`Institution person was not created for scholar "${profile.id}"`)
    }
    const personId = person?.id ?? profile.id
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
      const personBindingKey = `${paper.id}:${personId}`
      const existingBinding = existingBindingByAuthor.get(authorBindingKey)
      const existingPersonBinding = existingBindingByPerson.get(personBindingKey)

      if (!existingBinding) {
        if (existingPersonBinding && existingPersonBinding.authorId !== authorId) {
          summary.institutionPaperAuthorBindings.conflicts += 1
          logWarn(
            `Skipped institution_paper_author_bindings row for author "${authorId}" and paper "${paper.id}" because person "${personId}" is already bound to author "${existingPersonBinding.authorId}"`,
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
              personId,
              boundBy: boundByUserId,
              createdAt: runAt,
              updatedAt: runAt,
            },
          })
          existingBindingByAuthor.set(authorBindingKey, createdBinding)
          existingBindingByPerson.set(personBindingKey, createdBinding)
        }

        summary.institutionPaperAuthorBindings.created += 1
        continue
      }

      if (existingBinding.personId === personId && existingBinding.boundBy === boundByUserId) {
        summary.institutionPaperAuthorBindings.unchanged += 1
        continue
      }

      if (existingPersonBinding && existingPersonBinding.id !== existingBinding.id) {
        summary.institutionPaperAuthorBindings.conflicts += 1
        logWarn(
          `Skipped institution_paper_author_bindings update for author "${authorId}" and paper "${paper.id}" because person "${personId}" is already bound to author "${existingPersonBinding.authorId}"`,
        )
        continue
      }

      if (!isDryRun) {
        const updatedBinding = await prisma.institution_paper_author_bindings.update({
          where: { id: existingBinding.id },
          data: {
            personId,
            boundBy: boundByUserId,
            updatedAt: new Date(),
          },
        })
        existingBindingByAuthor.set(authorBindingKey, updatedBinding)
        existingBindingByPerson.set(personBindingKey, updatedBinding)
      }

      summary.institutionPaperAuthorBindings.updated += 1
    }
  }
}

const ensurePublicClaims = async (
  finalPaperMap: Map<string, SyncedPaperRecord>,
  adminUserId: string,
  institutionId: string,
): Promise<void> => {
  for (const paper of finalPaperMap.values()) {
    if (isDryRun) {
      const exists =
        !paper.id.startsWith('dry-run-paper:') &&
        (await prisma.paper_claims.count({ where: { paperId: paper.id, institutionId } })) > 0
      if (exists) summary.publicClaims.preservedExisting += 1
      else {
        summary.publicClaims.created += 1
        summary.submissions.created += 1
      }
      continue
    }
    const result = await prisma.$transaction(
      (tx) =>
        ensureBibliographyClaim(tx, {
          paperId: paper.id,
          institutionId,
          userId: adminUserId,
          scope: { institutionId, labId: null, reviewNodeId: null },
          snapshot: { ...buildSubmissionSnapshot(paper), source: 'scholar_source_sync' },
        }),
      { timeout: 30000 },
    )
    if (result.created) {
      summary.publicClaims.created += 1
      summary.submissions.created += 1
    } else summary.publicClaims.preservedExisting += 1
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

  const { finalPaperMap } = await syncPapers(importInstitution.id, adminUser.id)
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
