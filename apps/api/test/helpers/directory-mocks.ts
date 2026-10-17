import type { FastifyInstance } from 'fastify'

// Unrelated unit tests model a deployment before directory admission is enabled.
// Governance integration tests use real PostgreSQL and never install these defaults.
export const addDirectoryMocks = (app: FastifyInstance): void => {
  const prisma = app.prisma as unknown as Record<string, Record<string, unknown>>
  prisma.institution_directory_policies ??= { findUnique: async () => null }
  prisma.institution_people ??= {}
  prisma.institution_people.findUnique ??= async () => null
  prisma.institution_people.findFirst ??= async () => null
  prisma.content_review_tasks ??= { findMany: async () => [] }
  prisma.institution_reviewer_grants ??= { findMany: async () => [] }
  prisma.institution_review_workflows ??= {}
  prisma.institution_review_workflows.count ??= async () => 0
}
