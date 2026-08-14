import type { FastifyInstance } from 'fastify'
import { resolveAvatarUrl } from '../../utils/avatar'
import type { Prisma } from '../../../prisma/generated/client'
import type { CreateScholarBody, UpdateScholarBody, ScholarListQuery } from './schema'
import { buildLabSlug } from '../../utils/labs'
import {
  loadScholarResearchTimelines,
  replaceScholarResearchTimeline,
  type ScholarResearchPeriod,
} from '../../utils/scholarResearchPeriod'
import {
  loadScholarSubjectSummaries,
  replaceScholarSubjectLinks,
  resolveAcademicSubjects,
  type AcademicSubjectSummary,
} from '../../utils/academic-subjects'
import { buildScholarWhere } from './filters'

interface ResearchDirectionItem {
  name: string
  description: string
}

interface EducationItem {
  school: string
  degree: string
  period: string
}

interface AchievementItem {
  title: string
  description: string
}

interface AchievementYear {
  year: string
  items: AchievementItem[]
}

interface AchievementGroup {
  phase: string
  label: string
  years: AchievementYear[]
}

interface ScholarRecord {
  id: string
  name: string
  avatar: string | null
  college: string[]
  title: string | null
  lab: string | null
  office: string | null
  email: string | null
  phone: string | null
  bio: string | null
  join_year: number | null
  research_directions: unknown
  education: unknown
  achievements: unknown
  letter_index: string | null
  createdAt: Date
  updatedAt: Date
}

interface FormattedScholar {
  id: string
  name: string
  avatar: string | null
  college: string[]
  title: string | null
  lab: string | null
  lab_slug: string | null
  office: string | null
  email: string | null
  phone: string | null
  bio: string | null
  join_year: number | null
  research_directions: ResearchDirectionItem[]
  education: EducationItem[]
  achievements: AchievementGroup[]
  research_timeline: ScholarResearchPeriod[]
  letter_index: string | null
  subjects: string[]
  subject_codes: string[]
  createdAt: string
  updatedAt: string
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const normalizeResearchDirections = (value: unknown): ResearchDirectionItem[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const name = typeof item.name === 'string' ? item.name : ''
      if (!name) {
        return null
      }

      return {
        name,
        description: typeof item.description === 'string' ? item.description : '',
      }
    })
    .filter((item): item is ResearchDirectionItem => item !== null)
}

const normalizeEducation = (value: unknown): EducationItem[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const school = typeof item.school === 'string' ? item.school : ''
      const degree = typeof item.degree === 'string' ? item.degree : ''
      const period = typeof item.period === 'string' ? item.period : ''

      if (!school && !degree && !period) {
        return null
      }

      return {
        school,
        degree,
        period,
      }
    })
    .filter((item): item is EducationItem => item !== null)
}

const normalizeAchievementItems = (value: unknown): AchievementItem[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const title = typeof item.title === 'string' ? item.title : ''
      if (!title) {
        return null
      }

      return {
        title,
        description: typeof item.description === 'string' ? item.description : '',
      }
    })
    .filter((item): item is AchievementItem => item !== null)
}

const normalizeAchievementYears = (value: unknown): AchievementYear[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const year = typeof item.year === 'string' ? item.year : ''
      const items = normalizeAchievementItems(item.items)
      if (!year || items.length === 0) {
        return null
      }

      return {
        year,
        items,
      }
    })
    .filter((item): item is AchievementYear => item !== null)
}

const normalizeAchievements = (value: unknown): AchievementGroup[] => {
  if (!Array.isArray(value) || value.length === 0) {
    return []
  }

  const groups = value
    .map((item) => {
      if (!isRecord(item)) {
        return null
      }

      const years = normalizeAchievementYears(item.years)
      if (years.length === 0) {
        return null
      }

      return {
        phase: typeof item.phase === 'string' ? item.phase : '',
        label: typeof item.label === 'string' ? item.label : '',
        years,
      }
    })
    .filter((item): item is AchievementGroup => item !== null)

  return groups.filter((group) => group.phase && group.label)
}

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const resolved: string[] = []
  const seen = new Set<string>()

  for (const item of value) {
    if (typeof item !== 'string') {
      continue
    }

    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    resolved.push(normalized)
  }

  return resolved
}

async function formatScholar(
  fastify: FastifyInstance,
  p: ScholarRecord,
  researchTimeline: ScholarResearchPeriod[],
  subjectSummaries: AcademicSubjectSummary[],
): Promise<FormattedScholar> {
  return {
    id: p.id,
    name: p.name,
    avatar: await resolveAvatarUrl(fastify, p.avatar),
    college: normalizeStringArray(p.college),
    title: p.title,
    lab: p.lab,
    lab_slug: p.lab ? buildLabSlug(p.lab) : null,
    office: p.office,
    email: p.email,
    phone: p.phone,
    bio: p.bio,
    join_year: p.join_year,
    research_directions: normalizeResearchDirections(p.research_directions),
    education: normalizeEducation(p.education),
    achievements: normalizeAchievements(p.achievements),
    research_timeline: researchTimeline,
    letter_index: p.letter_index,
    subjects: subjectSummaries.map((subject) => subject.nameZh),
    subject_codes: subjectSummaries.map((subject) => subject.code),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

export async function listScholars(fastify: FastifyInstance, query: ScholarListQuery) {
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0

  const where = await buildScholarWhere(fastify, query)

  const [items, total] = await Promise.all([
    fastify.prisma.scholars.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { name: 'asc' },
    }),
    fastify.prisma.scholars.count({ where }),
  ])
  const scholarIds = items.map((item) => item.id)
  const [researchTimelines, subjectSummaries] = await Promise.all([
    loadScholarResearchTimelines(fastify.prisma, scholarIds),
    loadScholarSubjectSummaries(fastify.prisma, scholarIds),
  ])

  return {
    items: await Promise.all(
      items.map((scholar) =>
        formatScholar(
          fastify,
          scholar,
          researchTimelines.get(scholar.id) ?? [],
          subjectSummaries.get(scholar.id) ?? [],
        ),
      ),
    ),
    total,
  }
}

export async function getScholar(fastify: FastifyInstance, id: string) {
  const [p, researchTimelines, subjectSummaries] = await Promise.all([
    fastify.prisma.scholars.findUnique({ where: { id } }),
    loadScholarResearchTimelines(fastify.prisma, [id]),
    loadScholarSubjectSummaries(fastify.prisma, [id]),
  ])
  if (!p) throw fastify.httpErrors.notFound('Scholar not found')
  return formatScholar(fastify, p, researchTimelines.get(id) ?? [], subjectSummaries.get(id) ?? [])
}

export async function createScholar(
  fastify: FastifyInstance,
  body: CreateScholarBody,
  actorId: string,
) {
  const now = new Date()
  const result = await fastify.prisma.$transaction(async (tx) => {
    const subjects = await resolveAcademicSubjects(tx, {
      codes: body.subject_codes,
    })
    const scholar = await tx.scholars.create({
      data: {
        name: body.name,
        avatar: body.avatar,
        college: normalizeStringArray(body.college),
        title: body.title,
        lab: body.lab,
        office: body.office,
        email: body.email,
        phone: body.phone,
        bio: body.bio,
        join_year: body.join_year,
        research_directions: body.research_directions ?? [],
        education: body.education ?? [],
        achievements: body.achievements ?? [],
        letter_index: body.letter_index,
        createdAt: now,
        updatedAt: now,
      },
    })
    await replaceScholarSubjectLinks(tx, scholar.id, subjects, 'manual')
    const researchTimeline = await replaceScholarResearchTimeline(
      tx,
      scholar.id,
      body.research_timeline,
      { sourceType: 'manual', actorId },
    )
    return { scholar, researchTimeline, subjects }
  })
  return formatScholar(fastify, result.scholar, result.researchTimeline, result.subjects)
}

export async function updateScholar(
  fastify: FastifyInstance,
  id: string,
  body: UpdateScholarBody,
  actorId: string,
) {
  const existing = await fastify.prisma.scholars.findUnique({ where: { id } })
  if (!existing) throw fastify.httpErrors.notFound('Scholar not found')

  const data: Prisma.scholarsUncheckedUpdateInput = { updatedAt: new Date() }
  if (body.name !== undefined) data.name = body.name
  if (body.avatar !== undefined) data.avatar = body.avatar
  if (body.college !== undefined) data.college = normalizeStringArray(body.college)
  if (body.title !== undefined) data.title = body.title
  if (body.lab !== undefined) data.lab = body.lab
  if (body.office !== undefined) data.office = body.office
  if (body.email !== undefined) data.email = body.email
  if (body.phone !== undefined) data.phone = body.phone
  if (body.bio !== undefined) data.bio = body.bio
  if (body.join_year !== undefined) data.join_year = body.join_year
  if (body.research_directions !== undefined) {
    data.research_directions = body.research_directions
  }
  if (body.education !== undefined) data.education = body.education
  if (body.achievements !== undefined) data.achievements = body.achievements
  if (body.letter_index !== undefined) data.letter_index = body.letter_index
  const shouldUpdateSubjects = body.subject_codes !== undefined

  const result = await fastify.prisma.$transaction(async (tx) => {
    const subjects = shouldUpdateSubjects
      ? await resolveAcademicSubjects(tx, {
          codes: body.subject_codes,
        })
      : ((await loadScholarSubjectSummaries(tx, [id])).get(id) ?? [])
    const scholar = await tx.scholars.update({ where: { id }, data })
    if (shouldUpdateSubjects) {
      await replaceScholarSubjectLinks(tx, id, subjects, 'manual')
    }
    const researchTimeline =
      body.research_timeline === undefined
        ? ((await loadScholarResearchTimelines(tx, [id])).get(id) ?? [])
        : await replaceScholarResearchTimeline(tx, id, body.research_timeline, {
            sourceType: 'manual',
            actorId,
          })
    return { scholar, researchTimeline, subjects }
  })
  return formatScholar(fastify, result.scholar, result.researchTimeline, result.subjects)
}

export async function deleteScholar(fastify: FastifyInstance, id: string) {
  const existing = await fastify.prisma.scholars.findUnique({ where: { id } })
  if (!existing) throw fastify.httpErrors.notFound('Scholar not found')
  await fastify.prisma.$transaction([
    fastify.prisma.scholar_research_periods.deleteMany({ where: { scholar_id: id } }),
    fastify.prisma.scholars.delete({ where: { id } }),
  ])
  return { message: 'Scholar deleted' }
}
