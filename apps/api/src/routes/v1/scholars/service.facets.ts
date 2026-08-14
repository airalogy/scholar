import type { FastifyInstance } from 'fastify'
import { buildScholarWhere, resolveScholarScopeInstitutionId } from '../../scholars/filters'
import { getAcademicSubjectFacetCounts } from '../../../utils/academic-subjects'
import type { ScholarFacetsQuery } from './schema'

export const getScholarFacets = async (fastify: FastifyInstance, query: ScholarFacetsQuery) => {
  const institutionId = await resolveScholarScopeInstitutionId(fastify, query.institution_slug)
  const [subjectScholarWhere, collegeScholarWhere, letterScholarWhere] = await Promise.all([
    buildScholarWhere(fastify, query, { institutionId, omit: 'subject' }),
    buildScholarWhere(fastify, query, { institutionId, omit: 'college' }),
    buildScholarWhere(fastify, query, { institutionId, omit: 'letter' }),
  ])
  const subjectScope = institutionId
    ? { OR: [{ institutionId: null }, { institutionId }] }
    : { institutionId: null }

  const [subjectScholarRows, collegeRows, letterRows] = await Promise.all([
    fastify.prisma.scholars.findMany({
      where: subjectScholarWhere,
      select: { id: true },
    }),
    fastify.prisma.scholars.findMany({
      where: collegeScholarWhere,
      distinct: ['college'],
      select: { college: true },
    }),
    fastify.prisma.scholars.findMany({
      where: letterScholarWhere,
      distinct: ['letter_index'],
      select: { letter_index: true },
      orderBy: { letter_index: 'asc' },
    }),
  ])

  const countBySubjectId = await getAcademicSubjectFacetCounts(
    fastify.prisma,
    subjectScholarRows.map((scholar) => scholar.id),
  )
  const subjectIds = [...countBySubjectId.keys()]
  const subjects =
    subjectIds.length === 0
      ? []
      : await fastify.prisma.academic_subjects.findMany({
          where: {
            id: { in: subjectIds },
            isActive: true,
            ...subjectScope,
          },
          orderBy: [{ sortOrder: 'asc' }, { nameZh: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            code: true,
            parentId: true,
            nameZh: true,
            nameEn: true,
          },
        })

  const colleges = [
    ...new Set(
      collegeRows.flatMap((row) => row.college.map((college) => college.trim()).filter(Boolean)),
    ),
  ].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  const letters = letterRows
    .map((row) => row.letter_index?.trim().toUpperCase() ?? '')
    .filter(Boolean)

  return {
    code: 0 as const,
    data: {
      subjects: subjects.map((subject) => ({
        ...subject,
        count: countBySubjectId.get(subject.id) ?? 0,
      })),
      colleges,
      letters,
    },
  }
}
