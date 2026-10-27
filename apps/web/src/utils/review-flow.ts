import { Graph, layout } from '@dagrejs/dagre'
import type { Edge, Node } from '@vue-flow/core'

export interface ReviewFlowItem {
  id: string; label: string; detail: string; status: string; selectable?: boolean; alert?: string
}
export interface ReviewFlowStage extends ReviewFlowItem { tasks: ReviewFlowItem[] }
export interface ReviewFlowNode extends ReviewFlowItem { stage: boolean }
export interface ReviewFlowLayout { nodes: Node<ReviewFlowNode>[]; edges: Edge[] }

// Role candidates stay inside one task. Separate branches mean ALL tasks must pass.
export const layoutReviewFlow = (stages: ReviewFlowStage[]): ReviewFlowLayout => {
  const graph = new Graph().setGraph({ rankdir: 'LR', nodesep: 24, ranksep: 56, marginx: 24, marginy: 24 })
  graph.setDefaultEdgeLabel(() => ({}))
  const nodes: Node<ReviewFlowNode>[] = []
  const edges: Edge[] = []
  const add = (item: ReviewFlowItem, stage: boolean): string => {
    const id = `${stage ? 'stage' : 'task'}:${item.id}`
    graph.setNode(id, { width: 240, height: 142 })
    nodes.push({ id, type: 'review', position: { x: 0, y: 0 }, data: { ...item, stage } })
    return id
  }
  const connect = (source: string, target: string): void => {
    graph.setEdge(source, target)
    edges.push({ id: `${source}->${target}`, source, target, type: 'smoothstep' })
  }
  let previous: string[] = []
  for (const stage of stages) {
    const id = add(stage, true)
    for (const source of previous) connect(source, id)
    previous = stage.tasks.map(task => { const taskId = add(task, false); connect(id, taskId); return taskId })
    if (!previous.length) previous = [id]
  }
  if (nodes.length) layout(graph)
  for (const node of nodes) {
    const point = graph.node(node.id)
    node.position = { x: point.x - 120, y: point.y - 71 }
  }
  return { nodes, edges }
}
