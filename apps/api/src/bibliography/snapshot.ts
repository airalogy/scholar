import type { Prisma } from '../../prisma/generated/client'
import { fingerprint } from './normalize'

export interface BibliographySnapshot {
  id: string
  journal_id: string | null
  [key: string]: unknown
}

export const loadBibliographySnapshot = async (
  tx: Prisma.TransactionClient,
  paperId: string,
  institutionId: string,
): Promise<BibliographySnapshot> => {
  const paper = await tx.papers.findUniqueOrThrow({
    where: { id: paperId },
    select: {
      id: true,
      title: true,
      abstract: true,
      doi: true,
      normalized_doi: true,
      journal_name: true,
      journal_id: true,
      journal: {
        select: {
          name: true,
          identifiers: {
            orderBy: [{ scheme: 'asc' }, { value: 'asc' }],
            select: { scheme: true, value: true },
          },
          rankings: {
            orderBy: [
              { editionId: 'asc' },
              { category_level: 'asc' },
              { category: 'asc' },
              { metric: 'asc' },
            ],
            select: {
              editionId: true,
              category_level: true,
              category: true,
              metric: true,
              quartile: true,
              is_top: true,
              source: true,
              edition: {
                select: {
                  system: true,
                  version: true,
                  revision: true,
                  metric_year: true,
                  source: true,
                  source_url: true,
                  released_on: true,
                  observed_on: true,
                },
              },
            },
          },
        },
      },
      language: true,
      language_tags: true,
      document_type: true,
      publication_status: true,
      publish_year: true,
      publish_date: true,
      paper_type: true,
      citation_count: true,
      pages: true,
      keywords: true,
      link: true,
      titles: {
        orderBy: [{ language: 'asc' }, { kind: 'asc' }],
        select: { language: true, kind: true, title: true, is_primary: true, source: true },
      },
      identifiers: {
        orderBy: [{ scheme: 'asc' }, { normalized_value: 'asc' }],
        select: { scheme: true, value: true, normalized_value: true },
      },
      author_links: {
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          authorId: true,
          order: true,
          display_name: true,
          source_key: true,
          order_verified: true,
          corresponding: true,
          equal_contribution: true,
          contributor_type: true,
          orcid: true,
          affiliations: { orderBy: { affiliationId: 'asc' }, select: { affiliationId: true } },
        },
      },
      affiliations: {
        orderBy: { source_key: 'asc' },
        select: {
          id: true,
          source_key: true,
          raw_name: true,
          organization_name: true,
          department: true,
          country_code: true,
          ror_id: true,
        },
      },
      funding: {
        orderBy: { source_key: 'asc' },
        select: {
          source_key: true,
          funder_name: true,
          funder_identifier: true,
          award_number: true,
          raw_text: true,
        },
      },
      sources: {
        where: { institutionId },
        orderBy: { provider: 'asc' },
        select: { provider: true, external_id: true, collected_on: true },
      },
      institution_metadata: {
        where: { institutionId },
        select: {
          owning_units: true,
          secondary_units: true,
          signature_type: true,
          reported_affiliation_count: true,
          source_author_order: true,
          cooperation_types: true,
          cooperation_description: true,
          custom_fields: true,
        },
      },
      indicators: {
        orderBy: [{ editionId: 'asc' }, { kind: 'asc' }, { category: 'asc' }],
        select: { editionId: true, kind: true, category: true, value: true },
      },
    },
  })
  return paper
}

export const bibliographySnapshotFingerprint = async (
  tx: Prisma.TransactionClient,
  paperId: string,
  institutionId: string,
): Promise<string> =>
  fingerprint({
    paper: await loadBibliographySnapshot(tx, paperId, institutionId),
    fieldDefinitions: await tx.institution_paper_field_definitions.findMany({
      where: { institutionId },
      orderBy: { key: 'asc' },
    }),
  })
