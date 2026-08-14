import type { FastifyInstance } from 'fastify'
import type { Prisma } from '../../../../prisma/generated/client'
import { lockMutationScope } from '../../../utils/advisory-lock'
import { assertCanEditInstitution } from '../../../utils/permissions'
import type { ReviewWorkflowContentType, UpsertReviewWorkflowBody } from './schema'
import { loadImportInstitution } from './service.shared'

const workflowKey = (contentType: ReviewWorkflowContentType): string => {
  return `default-${contentType.replace('_', '-')}-review`
}

const readRoles = (value: Prisma.JsonValue): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }
  const roles = (value as Record<string, unknown>).roles
  return Array.isArray(roles)
    ? roles.filter((role): role is string => typeof role === 'string')
    : []
}

export const getDefaultReviewWorkflow = async (
  fastify: FastifyInstance,
  slug: string,
  contentType: ReviewWorkflowContentType,
  userId: string,
) => {
  const institution = await loadImportInstitution(fastify, slug)
  await assertCanEditInstitution(fastify, userId, institution.id)
  const workflow = await fastify.prisma.institution_review_workflows.findUnique({
    where: {
      institutionId_key: {
        institutionId: institution.id,
        key: workflowKey(contentType),
      },
    },
    include: {
      bindings: { where: { content_type: contentType, is_active: true } },
      steps: { orderBy: { step_order: 'asc' } },
    },
  })
  if (!workflow || workflow.bindings.length === 0) {
    return { code: 0 as const, data: { workflow: null } }
  }
  return {
    code: 0 as const,
    data: {
      workflow: {
        id: workflow.id,
        content_type: contentType,
        name: workflow.name,
        steps: workflow.steps.map((step) => ({
          order: step.step_order,
          name: step.name,
          reviewer_roles: readRoles(step.resolver_config),
        })),
        updated_at: workflow.updatedAt.toISOString(),
      },
    },
  }
}

export const upsertDefaultReviewWorkflow = async (
  fastify: FastifyInstance,
  slug: string,
  contentType: ReviewWorkflowContentType,
  body: UpsertReviewWorkflowBody,
  userId: string,
) => {
  const institution = await loadImportInstitution(fastify, slug)
  await assertCanEditInstitution(fastify, userId, institution.id)
  const now = new Date()
  await fastify.prisma.$transaction(async (tx) => {
    await lockMutationScope(tx, 'institution', institution.id)
    const workflow = await tx.institution_review_workflows.upsert({
      where: {
        institutionId_key: {
          institutionId: institution.id,
          key: workflowKey(contentType),
        },
      },
      create: {
        institutionId: institution.id,
        key: workflowKey(contentType),
        name: body.name.trim(),
        description: `Default ${contentType} review workflow`,
        is_active: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      },
      update: {
        name: body.name.trim(),
        is_active: true,
        updatedAt: now,
      },
    })
    await Promise.all([
      tx.institution_review_workflow_bindings.deleteMany({
        where: { workflowId: workflow.id, content_type: contentType },
      }),
      tx.institution_review_workflow_steps.deleteMany({ where: { workflowId: workflow.id } }),
    ])
    await tx.institution_review_workflow_bindings.create({
      data: {
        institutionId: institution.id,
        workflowId: workflow.id,
        binding_type: 'institution_default',
        content_type: contentType,
        priority: 100,
        is_active: true,
        createdAt: now,
        updatedAt: now,
      },
    })
    await tx.institution_review_workflow_steps.createMany({
      data: body.steps.map((step, index) => ({
        institutionId: institution.id,
        workflowId: workflow.id,
        step_order: index + 1,
        name: step.name.trim(),
        resolver_type: 'institution_role',
        resolver_config: { roles: [...new Set(step.reviewer_roles)] },
        createdAt: now,
        updatedAt: now,
      })),
    })
  })
  return getDefaultReviewWorkflow(fastify, slug, contentType, userId)
}
