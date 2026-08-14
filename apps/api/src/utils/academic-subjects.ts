import { Prisma, type PrismaClient } from '../../prisma/generated/client'

export interface AcademicSubjectSummary {
  id: string
  code: string
  parentId: string | null
  nameZh: string
  nameEn: string | null
}

export interface ResolveAcademicSubjectsOptions {
  codes?: string[]
  institutionId?: string | null
}

type SubjectPrismaClient = Prisma.TransactionClient | PrismaClient

export class AcademicSubjectInputError extends Error {
  readonly statusCode = 400
}

const SUBJECT_SELECT = {
  id: true,
  code: true,
  parentId: true,
  nameZh: true,
  nameEn: true,
} as const

export const normalizeAcademicSubjectName = (value: string): string => {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US')
}

const normalizeSubjectCode = (value: string): string => {
  return value.normalize('NFKC').trim().toLocaleLowerCase('en-US')
}

const uniqueValues = (values: string[] | undefined, normalizer: (value: string) => string) => {
  const result: Array<{ raw: string; normalized: string }> = []
  const seen = new Set<string>()

  for (const value of values ?? []) {
    const raw = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    const normalized = normalizer(raw)
    if (!raw || !normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push({ raw, normalized })
  }

  return result
}

export const resolveAcademicSubjects = async (
  prisma: SubjectPrismaClient,
  options: ResolveAcademicSubjectsOptions,
): Promise<AcademicSubjectSummary[]> => {
  const codes = uniqueValues(options.codes, normalizeSubjectCode)

  const institutionId = options.institutionId ?? null
  const resolved = new Map<string, AcademicSubjectSummary>()

  const codeValues = codes.map((item) => item.normalized)
  const [subjects, mappings] = await Promise.all([
    prisma.academic_subjects.findMany({
      where: {
        code: { in: codeValues },
        isActive: true,
        OR: [{ institutionId: null }, ...(institutionId ? [{ institutionId }] : [])],
      },
      select: SUBJECT_SELECT,
    }),
    institutionId
      ? prisma.institution_subject_mappings.findMany({
          where: {
            institutionId,
            normalizedLocalCode: { in: codeValues },
          },
          include: { subject: { select: SUBJECT_SELECT } },
        })
      : Promise.resolve([]),
  ])
  const byCode = new Map(subjects.map((subject) => [normalizeSubjectCode(subject.code), subject]))
  for (const mapping of mappings) {
    if (mapping.localCode) {
      byCode.set(normalizeSubjectCode(mapping.localCode), mapping.subject)
    }
  }

  for (const code of codes) {
    const subject = byCode.get(code.normalized)
    if (!subject) {
      throw new AcademicSubjectInputError(`Unknown subject code "${code.raw}"`)
    }
    resolved.set(subject.id, subject)
  }

  return [...resolved.values()]
}

export const replaceScholarSubjectLinks = async (
  prisma: SubjectPrismaClient,
  scholarId: string,
  subjects: AcademicSubjectSummary[],
  source: string,
): Promise<void> => {
  await prisma.scholar_subjects.deleteMany({ where: { scholarId } })
  if (subjects.length === 0) {
    return
  }
  await prisma.scholar_subjects.createMany({
    data: subjects.map((subject, index) => ({
      scholarId,
      subjectId: subject.id,
      isPrimary: index === 0,
      displayOrder: index,
      source,
    })),
  })
}

export const loadScholarSubjectSummaries = async (
  prisma: SubjectPrismaClient,
  scholarIds: string[],
): Promise<Map<string, AcademicSubjectSummary[]>> => {
  const result = new Map<string, AcademicSubjectSummary[]>()
  if (scholarIds.length === 0) {
    return result
  }
  const links = await prisma.scholar_subjects.findMany({
    where: { scholarId: { in: scholarIds }, subject: { isActive: true } },
    orderBy: [{ scholarId: 'asc' }, { displayOrder: 'asc' }, { subjectId: 'asc' }],
    include: { subject: { select: SUBJECT_SELECT } },
  })
  for (const link of links) {
    result.set(link.scholarId, [...(result.get(link.scholarId) ?? []), link.subject])
  }
  return result
}

export const getAcademicSubjectDescendantIds = async (
  prisma: SubjectPrismaClient,
  subjectId: string,
): Promise<string[]> => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH RECURSIVE descendants AS (
      SELECT "id"
      FROM "academic_subjects"
      WHERE "id" = ${subjectId}::uuid AND "isActive" = true
      UNION ALL
      SELECT child."id"
      FROM "academic_subjects" child
      JOIN descendants parent ON child."parentId" = parent."id"
      WHERE child."isActive" = true
    )
    SELECT "id" FROM descendants
  `)
  return rows.map((row) => row.id)
}

export const getAcademicSubjectFacetCounts = async (
  prisma: SubjectPrismaClient,
  scholarIds: string[],
): Promise<Map<string, number>> => {
  if (scholarIds.length === 0) {
    return new Map()
  }
  const rows = await prisma.$queryRaw<Array<{ subjectId: string; count: bigint }>>(Prisma.sql`
    WITH RECURSIVE ancestry AS (
      SELECT "id" AS "descendantId", "id" AS "ancestorId"
      FROM "academic_subjects"
      WHERE "isActive" = true
      UNION ALL
      SELECT ancestry."descendantId", parent."parentId" AS "ancestorId"
      FROM ancestry
      JOIN "academic_subjects" parent ON parent."id" = ancestry."ancestorId"
      WHERE parent."parentId" IS NOT NULL
    )
    SELECT
      ancestry."ancestorId" AS "subjectId",
      count(DISTINCT links."scholarId") AS "count"
    FROM "scholar_subjects" links
    JOIN ancestry ON ancestry."descendantId" = links."subjectId"
    WHERE links."scholarId" IN (${Prisma.join(scholarIds)})
    GROUP BY ancestry."ancestorId"
  `)
  return new Map(rows.map((row) => [row.subjectId, Number(row.count)]))
}
