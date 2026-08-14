import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../../prisma/generated/client'
import type { ScholarImportItem } from './schema'
import { normalizeDoi } from '../../../utils/doi'
import type { ImportAction } from './service.shared'
import {
  assertValidScholarResearchTimeline,
  loadScholarResearchTimelines,
  normalizeScholarResearchTimeline,
  replaceScholarResearchTimeline,
} from '../../../utils/scholarResearchPeriod'
import {
  replaceScholarSubjectLinks,
  resolveAcademicSubjects,
} from '../../../utils/academic-subjects'

interface ScholarImportResult {
  action: ImportAction
  targetId: string
  message: string | null
}

const normalizeStringArray = (values: string[] | undefined): string[] | undefined => {
  if (values === undefined) {
    return undefined
  }
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

const normalizeJsonValue = (value: unknown): Prisma.InputJsonValue => {
  return value as Prisma.InputJsonValue
}

const resolveScholarPaperIds = async (
  tx: Prisma.TransactionClient,
  paperDois: string[],
): Promise<string[]> => {
  const normalizedDois = paperDois.map(normalizeDoi)
  if (normalizedDois.some((doi) => !doi)) {
    throw new Error('paper_dois must not contain empty DOI values')
  }
  if (new Set(normalizedDois).size !== normalizedDois.length) {
    throw new Error('paper_dois must not contain duplicated DOI values')
  }
  if (normalizedDois.length === 0) {
    return []
  }

  const papers = await tx.papers.findMany({
    where: {
      normalized_doi: { in: normalizedDois },
    },
    select: {
      id: true,
      normalized_doi: true,
    },
  })
  const idsByDoi = new Map<string, string>()
  for (const paper of papers) {
    idsByDoi.set(paper.normalized_doi, paper.id)
  }

  for (const doi of normalizedDois) {
    if (!idsByDoi.has(doi)) {
      throw new Error(`paper_dois references missing DOI "${doi}"`)
    }
  }

  return normalizedDois.map((doi) => idsByDoi.get(doi) as string)
}

export const validateScholarImportItem = async (
  fastify: FastifyInstance,
  item: ScholarImportItem,
): Promise<void> => {
  if (item.research_timeline !== undefined) {
    assertValidScholarResearchTimeline(item.research_timeline)
  }
  if (item.paper_dois === undefined) {
    return
  }
  await fastify.prisma.$transaction(async (tx) => {
    await resolveScholarPaperIds(tx, item.paper_dois ?? [])
  })
}

const setIfChanged = (
  data: Prisma.scholarsUpdateInput,
  key: keyof Prisma.scholarsUpdateInput,
  currentValue: unknown,
  nextValue: unknown,
): boolean => {
  if (JSON.stringify(currentValue) === JSON.stringify(nextValue)) {
    return false
  }
  Object.assign(data, { [key]: nextValue })
  return true
}

export const applyScholarImportItem = async (
  fastify: FastifyInstance,
  institutionId: string,
  item: ScholarImportItem,
  actorId: string | null = null,
  importItemId?: string,
): Promise<ScholarImportResult> => {
  const externalId = item.external_id.trim()
  if (!externalId) {
    throw new Error('external_id must not be empty')
  }
  if (item.research_timeline !== undefined) {
    assertValidScholarResearchTimeline(item.research_timeline)
  }

  return fastify.prisma.$transaction(async (tx) => {
    const now = new Date()
    const mapping = await tx.institution_scholar_mappings.findUnique({
      where: {
        institutionId_externalId: {
          institutionId,
          externalId,
        },
      },
    })
    const linkedPaperIds =
      item.paper_dois === undefined ? undefined : await resolveScholarPaperIds(tx, item.paper_dois)
    const college = normalizeStringArray(item.college)
    const hasSubjectInput = item.subject_codes !== undefined
    const resolvedSubjects = hasSubjectInput
      ? await resolveAcademicSubjects(tx, {
          codes: item.subject_codes,
          institutionId,
        })
      : undefined

    if (!mapping) {
      const scholar = await tx.scholars.create({
        data: {
          name: item.name.trim(),
          avatar: item.avatar ?? null,
          college: college ?? [],
          title: item.title ?? null,
          lab: item.lab ?? null,
          office: item.office ?? null,
          email: item.email ?? null,
          phone: item.phone ?? null,
          bio: item.bio ?? null,
          join_year: item.join_year ?? null,
          research_directions: normalizeJsonValue(item.research_directions ?? []),
          education: normalizeJsonValue(item.education ?? []),
          achievements: normalizeJsonValue(item.achievements ?? []),
          letter_index: item.letter_index?.toUpperCase() ?? null,
          createdAt: now,
          updatedAt: now,
        },
      })

      if (resolvedSubjects) {
        await replaceScholarSubjectLinks(tx, scholar.id, resolvedSubjects, 'institution_import')
      }

      if (item.research_timeline !== undefined) {
        await replaceScholarResearchTimeline(tx, scholar.id, item.research_timeline, {
          sourceType: 'institution_import',
          actorId,
        })
      }

      await tx.institution_scholar_mappings.create({
        data: {
          institutionId,
          externalId,
          scholarId: scholar.id,
          createdAt: now,
          updatedAt: now,
        },
      })

      if (linkedPaperIds && linkedPaperIds.length > 0) {
        await tx.scholar_papers.createMany({
          data: linkedPaperIds.map((paperId, index) => ({
            scholarId: scholar.id,
            paperId,
            is_representative: index === 0,
            display_order: index + 1,
          })),
        })
      }

      const importResult: ScholarImportResult = {
        action: 'created',
        targetId: scholar.id,
        message: null,
      }
      if (importItemId) {
        await tx.institution_data_import_items.update({
          where: { id: importItemId },
          data: {
            targetId: importResult.targetId,
            action: importResult.action,
            status: 'completed',
            message: importResult.message,
            updatedAt: now,
          },
        })
      }
      return importResult
    }

    const scholar = await tx.scholars.findUnique({
      where: { id: mapping.scholarId },
    })
    if (!scholar) {
      throw new Error('Scholar mapping references a missing scholar')
    }

    const updateData: Prisma.scholarsUpdateInput = {}
    const nextName = item.name.trim()
    let changed = setIfChanged(updateData, 'name', scholar.name, nextName)

    const optionalFields: Array<{
      key: keyof Prisma.scholarsUpdateInput
      current: unknown
      value: unknown
      provided: boolean
    }> = [
      {
        key: 'avatar',
        current: scholar.avatar,
        value: item.avatar,
        provided: item.avatar !== undefined,
      },
      {
        key: 'college',
        current: scholar.college,
        value: college,
        provided: college !== undefined,
      },
      {
        key: 'title',
        current: scholar.title,
        value: item.title,
        provided: item.title !== undefined,
      },
      { key: 'lab', current: scholar.lab, value: item.lab, provided: item.lab !== undefined },
      {
        key: 'office',
        current: scholar.office,
        value: item.office,
        provided: item.office !== undefined,
      },
      {
        key: 'email',
        current: scholar.email,
        value: item.email,
        provided: item.email !== undefined,
      },
      {
        key: 'phone',
        current: scholar.phone,
        value: item.phone,
        provided: item.phone !== undefined,
      },
      { key: 'bio', current: scholar.bio, value: item.bio, provided: item.bio !== undefined },
      {
        key: 'join_year',
        current: scholar.join_year,
        value: item.join_year,
        provided: item.join_year !== undefined,
      },
      {
        key: 'research_directions',
        current: scholar.research_directions,
        value: item.research_directions,
        provided: item.research_directions !== undefined,
      },
      {
        key: 'education',
        current: scholar.education,
        value: item.education,
        provided: item.education !== undefined,
      },
      {
        key: 'achievements',
        current: scholar.achievements,
        value: item.achievements,
        provided: item.achievements !== undefined,
      },
      {
        key: 'letter_index',
        current: scholar.letter_index,
        value: item.letter_index?.toUpperCase(),
        provided: item.letter_index !== undefined,
      },
    ]

    for (const field of optionalFields) {
      if (field.provided) {
        const value =
          field.key === 'research_directions' ||
          field.key === 'education' ||
          field.key === 'achievements'
            ? normalizeJsonValue(field.value)
            : field.value
        changed = setIfChanged(updateData, field.key, field.current, value) || changed
      }
    }
    let researchTimelineChanged = false
    if (item.research_timeline !== undefined) {
      const currentResearchTimeline =
        (await loadScholarResearchTimelines(tx, [scholar.id])).get(scholar.id) ?? []
      const nextResearchTimeline = normalizeScholarResearchTimeline(item.research_timeline)
      researchTimelineChanged =
        JSON.stringify(currentResearchTimeline) !== JSON.stringify(nextResearchTimeline)
      if (researchTimelineChanged) {
        await replaceScholarResearchTimeline(tx, scholar.id, nextResearchTimeline, {
          sourceType: 'institution_import',
          actorId,
        })
      }
    }

    let paperLinksChanged = false
    if (linkedPaperIds !== undefined) {
      const existingLinks = await tx.scholar_papers.findMany({
        where: { scholarId: scholar.id },
        orderBy: [{ display_order: 'asc' }, { id: 'asc' }],
      })
      paperLinksChanged =
        JSON.stringify(existingLinks.map((link) => link.paperId)) !== JSON.stringify(linkedPaperIds)
      if (paperLinksChanged) {
        await tx.scholar_papers.deleteMany({
          where: { scholarId: scholar.id },
        })
        if (linkedPaperIds.length > 0) {
          await tx.scholar_papers.createMany({
            data: linkedPaperIds.map((paperId, index) => ({
              scholarId: scholar.id,
              paperId,
              is_representative: index === 0,
              display_order: index + 1,
            })),
          })
        }
      }
    }

    if (changed) {
      await tx.scholars.update({
        where: { id: scholar.id },
        data: {
          ...updateData,
          updatedAt: now,
        },
      })
    }
    if (resolvedSubjects) {
      await replaceScholarSubjectLinks(tx, scholar.id, resolvedSubjects, 'institution_import')
    }

    await tx.institution_scholar_mappings.update({
      where: { id: mapping.id },
      data: { updatedAt: now },
    })

    const importResult: ScholarImportResult = {
      action: changed || researchTimelineChanged || paperLinksChanged ? 'updated' : 'unchanged',
      targetId: scholar.id,
      message: null,
    }
    if (importItemId) {
      await tx.institution_data_import_items.update({
        where: { id: importItemId },
        data: {
          targetId: importResult.targetId,
          action: importResult.action,
          status: 'completed',
          message: importResult.message,
          updatedAt: now,
        },
      })
    }
    return importResult
  })
}
