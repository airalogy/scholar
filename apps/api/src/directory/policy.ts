import type { Prisma } from '../../prisma/generated/client'

export const activeAppointmentWhere = (
  now = new Date(),
): Prisma.institution_org_appointmentsWhereInput => ({
  status: 'active',
  AND: [
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
  ],
  position: { is_active: true, node: { is_active: true } },
})

export const personAdmitted = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  personId: string,
): Promise<boolean> => {
  const [person, policy] = await Promise.all([
    tx.institution_people.findFirst({ where: { id: personId, institutionId } }),
    tx.institution_directory_policies.findUnique({ where: { institutionId } }),
  ])
  if (
    !person ||
    !person.is_active ||
    person.manually_suspended ||
    person.lifecycle_status !== 'active'
  )
    return false
  if (
    policy?.admissionMode === 'directory' &&
    !(await tx.institution_directory_people.findUnique({ where: { personId } }))
  )
    return false
  if (!policy?.requireAppointment) return true
  return (
    (await tx.institution_org_appointments.count({
      where: { institutionId, personId, ...activeAppointmentWhere() },
    })) > 0
  )
}

// This is deliberately independent of the JWT's identifier claims: legacy and
// password sessions must not bypass the institution's directory admission policy.
export const userAdmitted = async (
  tx: Prisma.TransactionClient,
  institutionId: string,
  userId: string,
): Promise<boolean> => {
  const person = await tx.institution_people.findUnique({
    where: { institutionId_userId: { institutionId, userId } },
  })
  if (person) return personAdmitted(tx, institutionId, person.id)
  const policy = await tx.institution_directory_policies.findUnique({ where: { institutionId } })
  return policy?.admissionMode !== 'directory'
}

export const exceedsDeactivationLimit = (
  active: number,
  deactivated: number,
  percent: number,
): boolean => deactivated > 0 && (active === 0 || deactivated * 100 > active * percent)
