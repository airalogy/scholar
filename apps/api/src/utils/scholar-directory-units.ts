import type { PrismaClient } from '../../prisma/generated/client'

export interface DirectoryNode {
  id: string
  name: string
  node_type: string
  directorySourceId: string | null
}

export interface DirectoryEdge {
  fromNodeId: string
  toNodeId: string
  is_primary: boolean
}

export interface DirectoryUnit {
  id: string
  name: string
  kind: 'college' | 'department' | 'unit'
  parent_id: string | null
  ancestors: string[]
  matchable: boolean
}

// This is a public navigation projection, not an authority/appointment resolver.
// A node is exposed only when it matches an existing public scholar affiliation,
// or is an unambiguous academic ancestor of such a node.
export const buildDirectoryUnits = (
  nodes: DirectoryNode[],
  edges: DirectoryEdge[],
): DirectoryUnit[] => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const names = new Map<string, number>()
  for (const node of nodes) names.set(node.name.trim(), (names.get(node.name.trim()) ?? 0) + 1)
  const candidates = new Map<string, Array<{ id: string; primary: boolean }>>()
  for (const edge of edges) {
    const from = byId.get(edge.fromNodeId)
    const to = byId.get(edge.toNodeId)
    if (!from || !to || from.id === to.id || from.directorySourceId !== to.directorySourceId)
      continue
    // Directory sync writes parent -> child; legacy snapshots write child -> parent.
    // Mixed-source edges have no reliable convention and remain flat.
    const [parent, child] = from.directorySourceId ? [from, to] : [to, from]
    const parents = candidates.get(child.id) ?? []
    parents.push({ id: parent.id, primary: edge.is_primary })
    candidates.set(child.id, parents)
  }
  const parents = new Map<string, string>()
  for (const [id, options] of candidates) {
    const primary = options.filter((option) => option.primary)
    const selected =
      options.length === 1 ? options[0] : primary.length === 1 ? primary[0] : undefined
    if (selected) parents.set(id, selected.id)
  }
  // Flatten every member of a cycle. Descendants may still point at these roots.
  for (const node of nodes) {
    const path: string[] = []
    let current: string | undefined = node.id
    while (current && !path.includes(current)) {
      path.push(current)
      current = parents.get(current)
    }
    if (current) for (const id of path.slice(path.indexOf(current))) parents.delete(id)
  }
  return nodes.map((node): DirectoryUnit => {
    const ancestors: string[] = []
    let current: string | undefined = node.id
    while (current) {
      ancestors.push(`org:${current}`)
      current = parents.get(current)
    }
    return {
      id: `org:${node.id}`,
      name: node.name.trim(),
      kind: ['college', 'school', 'faculty'].includes(node.node_type)
        ? 'college'
        : node.node_type === 'department'
          ? 'department'
          : 'unit',
      parent_id: parents.has(node.id) ? `org:${parents.get(node.id)}` : null,
      ancestors,
      matchable: Boolean(node.name.trim()) && names.get(node.name.trim()) === 1,
    }
  })
}

export const loadDirectoryUnits = async (
  prisma: PrismaClient,
  institutionId: string,
): Promise<DirectoryUnit[]> => {
  const [nodes, edges] = await Promise.all([
    prisma.institution_org_nodes.findMany({
      where: {
        institutionId,
        is_active: true,
        node_type: {
          in: ['college', 'school', 'faculty', 'department', 'center', 'institute', 'lab', 'unit'],
        },
      },
      select: { id: true, name: true, node_type: true, directorySourceId: true },
    }),
    prisma.institution_org_edges.findMany({
      where: { institutionId, edge_type: 'hierarchy' },
      select: { fromNodeId: true, toNodeId: true, is_primary: true },
    }),
  ])
  return buildDirectoryUnits(nodes, edges)
}
