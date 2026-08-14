import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../prisma/generated/client'
import {
  getAcademicSubjectDescendantIds,
  normalizeAcademicSubjectName,
} from '../../utils/academic-subjects'

export interface ScholarFilterInput {
  q?: string
  college?: string
  subject?: string
  subject_id?: string
  letter?: string
  institution_slug?: string
}

export type ScholarFilterDimension = 'college' | 'subject' | 'letter'

export const resolveScholarScopeInstitutionId = async (
  fastify: FastifyInstance,
  requestedSlug?: string,
): Promise<string | null> => {
  const fixedSlug = fastify.deployment.paperLibrary.fixedInstitutionSlug
  const effectiveSlug = fixedSlug ?? requestedSlug?.trim()
  if (!effectiveSlug) {
    return null
  }
  if (fixedSlug && requestedSlug && requestedSlug !== fixedSlug) {
    throw fastify.httpErrors.forbidden(
      'This deployment is restricted to its configured institution',
    )
  }
  const institution = await fastify.prisma.institutions.findUnique({
    where: { slug: effectiveSlug },
    select: { id: true },
  })
  if (!institution) {
    throw fastify.httpErrors.notFound('Institution not found')
  }
  return institution.id
}

export const buildScholarWhere = async (
  fastify: FastifyInstance,
  query: ScholarFilterInput,
  options: {
    institutionId?: string | null
    omit?: ScholarFilterDimension
  } = {},
): Promise<Prisma.scholarsWhereInput> => {
  const and: Prisma.scholarsWhereInput[] = []
  const institutionId =
    options.institutionId === undefined
      ? await resolveScholarScopeInstitutionId(fastify, query.institution_slug)
      : options.institutionId

  const keyword = query.q?.trim()
  if (keyword) {
    and.push({
      OR: [
        { name: { contains: keyword, mode: 'insensitive' } },
        { bio: { contains: keyword, mode: 'insensitive' } },
        {
          subject_links: {
            some: {
              subject: {
                aliases: {
                  some: { alias: { contains: keyword, mode: 'insensitive' } },
                },
              },
            },
          },
        },
      ],
    })
  }
  if (institutionId) {
    and.push({ institution_mappings: { some: { institutionId } } })
  }
  if (options.omit !== 'college' && query.college) {
    and.push({ college: { has: query.college } })
  }
  if (options.omit !== 'letter' && query.letter) {
    and.push({ letter_index: query.letter.toUpperCase() })
  }
  if (options.omit !== 'subject') {
    if (query.subject_id) {
      const subjectIds = await getAcademicSubjectDescendantIds(fastify.prisma, query.subject_id)
      if (subjectIds.length === 0) {
        and.push({ id: { equals: '00000000-0000-0000-0000-000000000000' } })
      } else {
        and.push({ subject_links: { some: { subjectId: { in: subjectIds } } } })
      }
    } else if (query.subject) {
      const normalizedAlias = normalizeAcademicSubjectName(query.subject)
      and.push({
        subject_links: {
          some: {
            subject: {
              aliases: { some: { normalizedAlias } },
            },
          },
        },
      })
    }
  }

  return and.length > 0 ? { AND: and } : {}
}
