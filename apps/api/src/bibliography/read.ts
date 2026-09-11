import type { FastifyInstance } from 'fastify'
import type { Prisma, bibliometric_editions } from '../../prisma/generated/client'
import { resolvePaperAccess } from '../routes/papers/service.paper'
import { getInstitutionAccessById } from '../utils/permissions'
import { visibleCustomFields } from './custom-fields'
import type {
  BibliographyOutput,
  PublishedEdition,
  MetricsOutput,
  PageInput,
} from '../routes/v2/papers/schema'

export const readPaperBibliography = async (
  fastify: FastifyInstance,
  id: string,
  userId: string | null,
): Promise<BibliographyOutput> => {
  const { institutionId } = await resolvePaperAccess(fastify, id, userId)
  const access = userId ? await getInstitutionAccessById(fastify, userId, institutionId) : null
  const visibility = access?.can_edit_content
    ? 'admin'
    : access?.institution_role
      ? 'institution'
      : 'public'
  // Import provenance may contain private catalog identifiers. It is not public metadata.
  const canReadSources = access?.can_import_data === true
  return fastify.prisma.$transaction(
    async (tx) => {
      const definitions = await tx.institution_paper_field_definitions.findMany({
        where: {
          institutionId,
          is_active: true,
          ...(visibility === 'admin'
            ? {}
            : {
                visibility: {
                  in: visibility === 'institution' ? ['public', 'institution'] : ['public'],
                },
              }),
        },
        orderBy: [{ display_order: 'asc' }, { key: 'asc' }],
      })
      const paper = await tx.papers.findUniqueOrThrow({
        where: { id },
        select: {
          id: true,
          language_tags: true,
          document_type: true,
          publication_status: true,
          titles: {
            orderBy: [{ is_primary: 'desc' }, { language: 'asc' }, { kind: 'asc' }],
            select: { language: true, kind: true, title: true, is_primary: true },
          },
          identifiers: {
            orderBy: [{ scheme: 'asc' }, { value: 'asc' }],
            select: { scheme: true, value: true },
          },
          author_links: {
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
            include: {
              author: { select: { name: true } },
              affiliations: { orderBy: { affiliationId: 'asc' }, select: { affiliationId: true } },
            },
          },
          affiliations: { orderBy: { source_key: 'asc' } },
          funding: { orderBy: { source_key: 'asc' } },
          journal: {
            select: {
              id: true,
              name: true,
              identifiers: { orderBy: { scheme: 'asc' }, select: { scheme: true, value: true } },
            },
          },
          institution_metadata: { where: { institutionId } },
          sources: {
            where: { institutionId, ...(canReadSources ? {} : { id: { in: [] } }) },
            orderBy: { provider: 'asc' },
            select: { provider: true, external_id: true, collected_on: true },
          },
        },
      })
      const metadata = paper.institution_metadata[0]
      const raw = metadata?.custom_fields
      const fields = visibleCustomFields(
        raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {},
        definitions,
        visibility,
      )
      return {
        paper_id: paper.id,
        titles: paper.titles,
        language_tags: paper.language_tags,
        document_type: paper.document_type,
        publication_status: paper.publication_status,
        identifiers: paper.identifiers,
        authors: paper.author_links.map((row) => ({
          id: row.id,
          author_id: row.authorId,
          name: row.display_name ?? row.author.name,
          order: row.order,
          order_verified: row.order_verified,
          corresponding: row.corresponding,
          equal_contribution: row.equal_contribution,
          contributor_type: row.contributor_type,
          orcid: row.orcid,
          affiliation_ids: row.affiliations.map((link) => link.affiliationId),
        })),
        affiliations: paper.affiliations.map(
          ({ id, raw_name, organization_name, department, country_code, ror_id }) => ({
            id,
            raw_name,
            organization_name,
            department,
            country_code,
            ror_id,
          }),
        ),
        funding: paper.funding.map(
          ({ id, funder_name, funder_identifier, award_number, raw_text }) => ({
            id,
            funder_name,
            funder_identifier,
            award_number,
            raw_text,
          }),
        ),
        journal: paper.journal,
        sources: paper.sources.map((row) => ({
          ...row,
          collected_on: row.collected_on?.toISOString().slice(0, 10) ?? null,
        })),
        institution: {
          owning_units: metadata?.owning_units ?? [],
          secondary_units: metadata?.secondary_units ?? [],
          signature_type: metadata?.signature_type ?? null,
          reported_affiliation_count: metadata?.reported_affiliation_count ?? null,
          cooperation_types: metadata?.cooperation_types ?? [],
          cooperation_description: metadata?.cooperation_description ?? null,
          custom_fields: definitions
            .filter((field) => Object.hasOwn(fields, field.key))
            .map((field) => ({
              key: field.key,
              label: field.label,
              label_en: field.label_en,
              field_type: field.field_type,
              value: fields[field.key]!,
            })),
        },
      }
    },
    { isolationLevel: 'RepeatableRead' },
  )
}

const formatPublishedEdition = (edition: bibliometric_editions): PublishedEdition => ({
  id: edition.id,
  system: edition.system,
  version: edition.version,
  revision: edition.revision,
  metric_year: edition.metric_year,
  source: edition.source,
  source_url: edition.source_url,
  released_on: edition.released_on?.toISOString().slice(0, 10) ?? null,
  observed_on: edition.observed_on?.toISOString().slice(0, 10) ?? null,
})

const editionWhere = (
  paperId: string,
  journalId: string | null,
): Prisma.bibliometric_editionsWhereInput => ({
  status: 'published',
  OR: [
    { indicators: { some: { paperId } } },
    ...(journalId ? [{ rankings: { some: { journalId } } }] : []),
  ],
})

export const listPaperEditions = async (
  fastify: FastifyInstance,
  id: string,
  userId: string | null,
  query: PageInput,
): Promise<{ items: PublishedEdition[]; total: number }> => {
  const { paper } = await resolvePaperAccess(fastify, id, userId)
  const where = editionWhere(id, paper.journal_id)
  const [items, total] = await fastify.prisma.$transaction(
    [
      fastify.prisma.bibliometric_editions.findMany({
        where,
        take: query.limit ?? 20,
        skip: query.offset ?? 0,
        orderBy: [
          { released_on: { sort: 'desc', nulls: 'last' } },
          { version: 'desc' },
          { revision: 'desc' },
          { id: 'asc' },
        ],
      }),
      fastify.prisma.bibliometric_editions.count({ where }),
    ],
    { isolationLevel: 'RepeatableRead' },
  )
  return { items: items.map(formatPublishedEdition), total }
}

export const readPaperMetrics = async (
  fastify: FastifyInstance,
  id: string,
  editionId: string,
  userId: string | null,
  query: PageInput,
): Promise<MetricsOutput> => {
  await resolvePaperAccess(fastify, id, userId)
  return fastify.prisma.$transaction(
    async (tx) => {
      const paper = await tx.papers.findUniqueOrThrow({
        where: { id },
        select: { journal_id: true },
      })
      const edition = await tx.bibliometric_editions.findFirst({
        where: { id: editionId, ...editionWhere(id, paper.journal_id) },
      })
      if (!edition) throw fastify.httpErrors.notFound('Published edition not found for this paper')
      const rankingWhere = {
        editionId,
        ...(paper.journal_id ? { journalId: paper.journal_id } : { id: { in: [] as string[] } }),
      }
      const indicatorWhere = { editionId, paperId: id }
      const page = { take: query.limit ?? 20, skip: query.offset ?? 0 }
      const rankings = await tx.journal_rankings.findMany({
        where: rankingWhere,
        ...page,
        orderBy: [{ category_level: 'asc' }, { category: 'asc' }, { metric: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          category_level: true,
          category: true,
          metric: true,
          quartile: true,
          is_top: true,
        },
      })
      const indicators = await tx.paper_indicators.findMany({
        where: indicatorWhere,
        ...page,
        orderBy: [{ kind: 'asc' }, { category: 'asc' }, { id: 'asc' }],
        select: { id: true, kind: true, category: true, value: true },
      })
      return {
        edition: formatPublishedEdition(edition),
        rankings,
        indicators,
        ranking_total: await tx.journal_rankings.count({ where: rankingWhere }),
        indicator_total: await tx.paper_indicators.count({ where: indicatorWhere }),
      }
    },
    { isolationLevel: 'RepeatableRead' },
  )
}
