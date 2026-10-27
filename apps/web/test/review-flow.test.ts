import { expect, it } from 'vitest'
import { layoutReviewFlow, type ReviewFlowStage } from '@/utils/review-flow'

const stage = (id: string, tasks: string[]): ReviewFlowStage => ({ id, label: id, status: 'pending', detail: '', tasks: tasks.map(id => ({ id, label: id, detail: '', status: 'pending', selectable: true })) })
it('lays out parallel tasks with a join before the next sequential stage', () => {
  const { nodes, edges } = layoutReviewFlow([stage('authors', ['a', 'b']), stage('library', ['role'])])
  const position = (id: string) => nodes.find(node => node.id === id)!.position
  expect(position('task:a').x).toBe(position('task:b').x)
  expect(position('task:a').y).not.toBe(position('task:b').y)
  expect(position('stage:library').x).toBeGreaterThan(position('task:a').x)
  expect(edges.filter(edge => edge.target === 'stage:library').map(edge => edge.source).sort()).toEqual(['task:a', 'task:b'])
  expect(nodes.filter(node => node.id === 'task:role')).toHaveLength(1)
})
it('handles empty, legacy and large stages deterministically without mutating source data', () => {
  expect(layoutReviewFlow([])).toEqual({ nodes: [], edges: [] })
  const stages = [stage('legacy', []), stage('many', Array.from({ length: 100 }, (_, i) => String(i)))]
  const original = JSON.stringify(stages)
  const result = layoutReviewFlow(stages)
  expect(result).toEqual(layoutReviewFlow(stages))
  expect(JSON.stringify(stages)).toBe(original)
  expect(result.nodes).toHaveLength(102)
  expect(new Set(result.nodes.map(node => `${node.position.x}:${node.position.y}`)).size).toBe(102)
  expect(result.edges[0]).toMatchObject({ source: 'stage:legacy', target: 'stage:many' })
})
