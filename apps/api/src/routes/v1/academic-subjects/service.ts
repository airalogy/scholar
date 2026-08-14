import crypto from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../../prisma/generated/client'
import {
  assertCanEditInstitution,
  assertPlatformAdmin,
  getUserPlatformRole,
} from '../../../utils/permissions'
import {
  getAcademicSubjectDescendantIds,
  normalizeAcademicSubjectName,
} from '../../../utils/academic-subjects'
import type {
  AcademicSubjectCatalogQuery,
  CreateAcademicSubjectBody,
  UpdateAcademicSubjectBody,
} from './schema'

interface SubjectScope {
  institutionId: string | null
  institutionSlug: string | null
  scopeKey: string
}

interface FormattableSubject {
  id: string
  code: string
  parentId: string | null
  institutionId: string | null
  nameZh: string
  nameEn: string | null
  source: string
  taxonomyVersion: string | null
  isActive: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  institution: { slug: string } | null
  aliases: Array<{ alias: string; locale: string | null }>
  institution_mappings: Array<{ localCode: string | null }>
  _count: { scholar_links: number }
}

const globalScope: SubjectScope = {
  institutionId: null,
  institutionSlug: null,
  scopeKey: 'global',
}

const scopeKeysForCatalog = (scope?: SubjectScope): string[] => {
  return scope?.institutionId ? ['global', scope.scopeKey] : ['global']
}

const orderSubjectsByHierarchy = <T extends { id: string; parentId: string | null }>(
  subjects: T[],
): T[] => {
  const subjectIds = new Set(subjects.map((subject) => subject.id))
  const childrenByParentId = new Map<string, T[]>()
  const roots: T[] = []
  for (const subject of subjects) {
    if (!subject.parentId || !subjectIds.has(subject.parentId)) {
      roots.push(subject)
      continue
    }
    childrenByParentId.set(subject.parentId, [
      ...(childrenByParentId.get(subject.parentId) ?? []),
      subject,
    ])
  }
  const ordered: T[] = []
  const visit = (subject: T): void => {
    ordered.push(subject)
    for (const child of childrenByParentId.get(subject.id) ?? []) {
      visit(child)
    }
  }
  roots.forEach(visit)
  return ordered
}

const loadInstitutionScope = async (
  fastify: FastifyInstance,
  userId: string,
  slug?: string,
): Promise<SubjectScope> => {
  if (!slug) {
    await assertPlatformAdmin(fastify, userId)
    return globalScope
  }

  const fixedSlug = fastify.deployment.paperLibrary.fixedInstitutionSlug
  if (fixedSlug && fixedSlug !== slug) {
    throw fastify.httpErrors.notFound('Institution not found')
  }
  const institution = await fastify.prisma.institutions.findUnique({
    where: { slug },
    select: { id: true, slug: true },
  })
  if (!institution) {
    throw fastify.httpErrors.notFound('Institution not found')
  }
  await assertCanEditInstitution(fastify, userId, institution.id)
  return {
    institutionId: institution.id,
    institutionSlug: institution.slug,
    scopeKey: `institution:${institution.id}`,
  }
}

const buildInstitutionSubjectCode = (institutionId: string): string => {
  return `inst-${institutionId.slice(0, 8)}-${crypto.randomBytes(10).toString('hex')}`
}

const normalizeAliasInputs = (
  nameZh: string,
  nameEn: string | null,
  aliases: Array<{ alias: string; locale?: string }> = [],
): Array<{ alias: string; normalizedAlias: string; locale: string | null }> => {
  const values = [
    { alias: nameZh, locale: 'zh-CN' },
    ...(nameEn ? [{ alias: nameEn, locale: 'en' }] : []),
    ...aliases,
  ]
  const result = new Map<
    string,
    { alias: string; normalizedAlias: string; locale: string | null }
  >()
  for (const value of values) {
    const alias = value.alias.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    const normalizedAlias = normalizeAcademicSubjectName(alias)
    if (!alias || !normalizedAlias || result.has(normalizedAlias)) {
      continue
    }
    result.set(normalizedAlias, {
      alias,
      normalizedAlias,
      locale: value.locale?.trim() || null,
    })
  }
  return [...result.values()]
}

const replaceAliases = async (
  fastify: FastifyInstance,
  tx: Prisma.TransactionClient,
  subjectId: string,
  scopeKey: string,
  aliases: Array<{ alias: string; normalizedAlias: string; locale: string | null }>,
): Promise<void> => {
  const conflicts = await tx.academic_subject_aliases.findMany({
    where: {
      scopeKey,
      normalizedAlias: { in: aliases.map((alias) => alias.normalizedAlias) },
      NOT: { subjectId },
    },
    select: { alias: true },
  })
  if (conflicts.length > 0) {
    throw fastify.httpErrors.conflict(
      `Subject alias "${conflicts[0]?.alias ?? ''}" is already in use`,
    )
  }

  await tx.academic_subject_aliases.deleteMany({ where: { subjectId, scopeKey } })
  if (aliases.length > 0) {
    await tx.academic_subject_aliases.createMany({
      data: aliases.map((alias) => ({ subjectId, scopeKey, ...alias })),
    })
  }
}

const assertValidParent = async (
  fastify: FastifyInstance,
  parentId: string | null | undefined,
  institutionId: string | null,
  subjectId?: string,
): Promise<void> => {
  if (!parentId) {
    return
  }
  if (parentId === subjectId) {
    throw fastify.httpErrors.badRequest('A subject cannot be its own parent')
  }
  if (subjectId) {
    const descendantIds = await getAcademicSubjectDescendantIds(fastify.prisma, subjectId)
    if (descendantIds.includes(parentId)) {
      throw fastify.httpErrors.badRequest('A subject cannot use one of its descendants as parent')
    }
  }
  const parent = await fastify.prisma.academic_subjects.findUnique({
    where: { id: parentId },
    select: { institutionId: true },
  })
  if (!parent || (parent.institutionId !== null && parent.institutionId !== institutionId)) {
    throw fastify.httpErrors.badRequest('Parent subject is outside the selected catalog scope')
  }
}

const formatAcademicSubject = (
  subject: FormattableSubject,
  scope: SubjectScope,
  isPlatformAdmin: boolean,
) => {
  const mapping = subject.institution_mappings[0]
  return {
    id: subject.id,
    code: subject.code,
    parent_id: subject.parentId,
    institution_id: subject.institutionId,
    institution_slug: subject.institution?.slug ?? null,
    name_zh: subject.nameZh,
    name_en: subject.nameEn,
    source: subject.source,
    taxonomy_version: subject.taxonomyVersion,
    is_active: subject.isActive,
    sort_order: subject.sortOrder,
    aliases: subject.aliases.map((alias) => ({ alias: alias.alias, locale: alias.locale })),
    local_code: mapping?.localCode ?? null,
    scholar_count: subject._count.scholar_links,
    can_edit:
      subject.institutionId === null
        ? scope.institutionId === null && isPlatformAdmin
        : subject.institutionId === scope.institutionId,
    created_at: subject.createdAt.toISOString(),
    updated_at: subject.updatedAt.toISOString(),
  }
}

const loadFormattedSubject = async (
  fastify: FastifyInstance,
  subjectId: string,
  userId: string,
  requestedScope?: SubjectScope,
) => {
  const subject = await fastify.prisma.academic_subjects.findUnique({
    where: { id: subjectId },
    include: {
      institution: { select: { slug: true } },
      aliases: {
        where: { scopeKey: { in: scopeKeysForCatalog(requestedScope) } },
        orderBy: [{ locale: 'asc' }, { alias: 'asc' }],
      },
      institution_mappings: {
        where: requestedScope?.institutionId
          ? { institutionId: requestedScope.institutionId }
          : { id: '00000000-0000-0000-0000-000000000000' },
      },
      _count: { select: { scholar_links: true } },
    },
  })
  if (!subject) {
    throw fastify.httpErrors.notFound('Academic subject not found')
  }
  const isPlatformAdmin = (await getUserPlatformRole(fastify, userId)) === 'platform_admin'
  return formatAcademicSubject(subject, requestedScope ?? globalScope, isPlatformAdmin)
}

export const listAcademicSubjects = async (
  fastify: FastifyInstance,
  query: AcademicSubjectCatalogQuery,
  userId: string,
) => {
  const scope = await loadInstitutionScope(fastify, userId, query.institution_slug)
  const [subjects, platformRole] = await Promise.all([
    fastify.prisma.academic_subjects.findMany({
      where: {
        ...(query.include_inactive ? {} : { isActive: true }),
        ...(scope.institutionId
          ? { OR: [{ institutionId: null }, { institutionId: scope.institutionId }] }
          : { institutionId: null }),
      },
      orderBy: [{ sortOrder: 'asc' }, { nameZh: 'asc' }, { id: 'asc' }],
      include: {
        institution: { select: { slug: true } },
        aliases: {
          where: { scopeKey: { in: scopeKeysForCatalog(scope) } },
          orderBy: [{ locale: 'asc' }, { alias: 'asc' }],
        },
        institution_mappings: {
          where: scope.institutionId
            ? { institutionId: scope.institutionId }
            : { id: '00000000-0000-0000-0000-000000000000' },
        },
        _count: { select: { scholar_links: true } },
      },
    }),
    getUserPlatformRole(fastify, userId),
  ])
  return {
    code: 0 as const,
    data: {
      items: orderSubjectsByHierarchy(subjects).map((subject) =>
        formatAcademicSubject(subject, scope, platformRole === 'platform_admin'),
      ),
    },
  }
}

export const createAcademicSubject = async (
  fastify: FastifyInstance,
  body: CreateAcademicSubjectBody,
  userId: string,
) => {
  const scope = await loadInstitutionScope(fastify, userId, body.institution_slug)
  if (!scope.institutionId && !body.code) {
    throw fastify.httpErrors.badRequest('code is required for a platform subject')
  }
  await assertValidParent(fastify, body.parent_id, scope.institutionId)

  const nameZh = body.name_zh.trim()
  const nameEn = body.name_en?.trim() || null
  const code = scope.institutionId ? buildInstitutionSubjectCode(scope.institutionId) : body.code!
  const subject = await fastify.prisma.$transaction(async (tx) => {
    const created = await tx.academic_subjects.create({
      data: {
        code,
        parentId: body.parent_id ?? null,
        institutionId: scope.institutionId,
        nameZh,
        nameEn,
        source: scope.institutionId ? 'institution_admin' : 'platform_admin',
        taxonomyVersion: scope.institutionId ? 'institution-custom-v1' : 'scholar-custom-v1',
        isActive: body.is_active ?? true,
        sortOrder: body.sort_order ?? 10000,
      },
    })
    await replaceAliases(
      fastify,
      tx,
      created.id,
      scope.scopeKey,
      normalizeAliasInputs(nameZh, nameEn, body.aliases),
    )
    if (scope.institutionId) {
      await tx.institution_subject_mappings.create({
        data: {
          institutionId: scope.institutionId,
          subjectId: created.id,
          localCode: body.local_code?.trim() || null,
          normalizedLocalCode: body.local_code
            ? normalizeAcademicSubjectName(body.local_code)
            : null,
          localName: nameZh,
          normalizedLocalName: normalizeAcademicSubjectName(nameZh),
        },
      })
    }
    return created
  })
  return { code: 0 as const, data: await loadFormattedSubject(fastify, subject.id, userId, scope) }
}

export const updateAcademicSubject = async (
  fastify: FastifyInstance,
  id: string,
  body: UpdateAcademicSubjectBody,
  userId: string,
) => {
  const existing = await fastify.prisma.academic_subjects.findUnique({
    where: { id },
    include: {
      institution: { select: { slug: true } },
      aliases: true,
    },
  })
  if (!existing) {
    throw fastify.httpErrors.notFound('Academic subject not found')
  }
  const scope = existing.institutionId
    ? await loadInstitutionScope(fastify, userId, existing.institution?.slug)
    : await loadInstitutionScope(fastify, userId)
  await assertValidParent(fastify, body.parent_id, existing.institutionId, id)

  const nameZh = body.name_zh?.trim() || existing.nameZh
  const nameEn = body.name_en === undefined ? existing.nameEn : body.name_en?.trim() || null
  const suppliedAliases =
    body.aliases ??
    existing.aliases.map((alias) => ({
      alias: alias.alias,
      ...(alias.locale ? { locale: alias.locale } : {}),
    }))
  await fastify.prisma.$transaction(async (tx) => {
    await tx.academic_subjects.update({
      where: { id },
      data: {
        ...(body.parent_id !== undefined ? { parentId: body.parent_id } : {}),
        nameZh,
        nameEn,
        ...(body.sort_order !== undefined ? { sortOrder: body.sort_order } : {}),
        ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
        updatedAt: new Date(),
      },
    })
    await replaceAliases(
      fastify,
      tx,
      id,
      scope.scopeKey,
      normalizeAliasInputs(nameZh, nameEn, suppliedAliases),
    )
    if (existing.institutionId) {
      await tx.institution_subject_mappings.upsert({
        where: {
          institutionId_normalizedLocalName: {
            institutionId: existing.institutionId,
            normalizedLocalName: normalizeAcademicSubjectName(existing.nameZh),
          },
        },
        create: {
          institutionId: existing.institutionId,
          subjectId: id,
          localCode: body.local_code?.trim() || null,
          normalizedLocalCode: body.local_code
            ? normalizeAcademicSubjectName(body.local_code)
            : null,
          localName: nameZh,
          normalizedLocalName: normalizeAcademicSubjectName(nameZh),
        },
        update: {
          subjectId: id,
          ...(body.local_code !== undefined
            ? {
                localCode: body.local_code?.trim() || null,
                normalizedLocalCode: body.local_code
                  ? normalizeAcademicSubjectName(body.local_code)
                  : null,
              }
            : {}),
          localName: nameZh,
          normalizedLocalName: normalizeAcademicSubjectName(nameZh),
          updatedAt: new Date(),
        },
      })
    }
  })
  return { code: 0 as const, data: await loadFormattedSubject(fastify, id, userId, scope) }
}
