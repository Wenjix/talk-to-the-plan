import type { SemanticNode, SemanticEdge, CompiledContext, ContextEntry } from '../types'
import { buildAdjacencyIndex, getAncestorChain, getSiblings } from './traversal'
import { estimateTokens } from '../../utils/tokens'

const DEFAULT_TOKEN_BUDGET = 4000

// Tiered budget allocation (spec section)
const ROOT_RESERVE = 300
const ANCESTOR_RATIO = 0.6
const SIBLING_RATIO = 0.3
const COUSIN_RATIO = 0.1

function formatNodeContent(node: SemanticNode): string {
  const parts = [node.question]
  if (node.answer) {
    parts.push(node.answer.summary)
    parts.push(...node.answer.bullets)
  }
  return parts.join('\n')
}

export function compileContext(
  targetNodeId: string,
  allNodes: SemanticNode[],
  allEdges: SemanticEdge[],
  tokenBudget: number = DEFAULT_TOKEN_BUDGET,
): CompiledContext {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]))
  const index = buildAdjacencyIndex(allNodes, allEdges)
  const entries: ContextEntry[] = []
  let usedTokens = 0

  // ancestors[0] = nearest, ancestors[last] = root
  const ancestors = getAncestorChain(targetNodeId, nodeMap, index)

  // 0. Reserve root — always included if it fits within budget
  let rootEntry: ContextEntry | null = null
  let rootTokens = 0
  if (ancestors.length > 0) {
    const root = ancestors[ancestors.length - 1]
    const rootContent = formatNodeContent(root)
    rootTokens = estimateTokens(rootContent)
    if (rootTokens <= tokenBudget) {
      rootEntry = {
        nodeId: root.id,
        role: 'ancestor',
        distanceFromTarget: ancestors.length,
        content: rootContent,
        tokenEstimate: rootTokens,
      }
      usedTokens += rootTokens
    }
  }

  // Tiered budgets after root reserve
  const remainingBudget = Math.max(0, tokenBudget - ROOT_RESERVE - rootTokens)
  const ancestorBudget = Math.floor(remainingBudget * ANCESTOR_RATIO)
  let siblingBudget = Math.floor(remainingBudget * SIBLING_RATIO)
  let cousinBudget = Math.floor(remainingBudget * COUSIN_RATIO)

  // 1. Ancestors (highest priority) — pack nearest first, skip root (handled separately)
  let ancestorUsed = 0
  let ancestorsOmitted = 0
  const ancestorEntries: ContextEntry[] = []
  for (let i = 0; i < ancestors.length - 1; i++) {
    const node = ancestors[i]
    const content = formatNodeContent(node)
    const tokens = estimateTokens(content)
    if (ancestorUsed + tokens > ancestorBudget) {
      ancestorsOmitted++
      continue
    }
    ancestorEntries.push({
      nodeId: node.id,
      role: 'ancestor',
      distanceFromTarget: i + 1,
      content,
      tokenEstimate: tokens,
    })
    ancestorUsed += tokens
    usedTokens += tokens
  }

  // Add ancestors in order: nearest-first, then root at end
  entries.push(...ancestorEntries)
  if (rootEntry) {
    entries.push(rootEntry)
  }

  // Surplus rollover: unused ancestor budget flows to siblings
  const ancestorSurplus = ancestorBudget - ancestorUsed
  siblingBudget += ancestorSurplus

  // 2. Siblings (medium priority) — if budget allows
  let siblingUsed = 0
  const siblings = getSiblings(targetNodeId, nodeMap, index)
  for (const sibling of siblings) {
    const content = formatNodeContent(sibling)
    const tokens = estimateTokens(content)
    if (siblingUsed + tokens > siblingBudget) break
    entries.push({
      nodeId: sibling.id,
      role: 'sibling',
      distanceFromTarget: 1,
      content,
      tokenEstimate: tokens,
    })
    siblingUsed += tokens
    usedTokens += tokens
  }

  // Surplus rollover: unused sibling budget flows to cousins
  const siblingSurplus = siblingBudget - siblingUsed
  cousinBudget += siblingSurplus

  // 3. Cousins (lowest priority) — question-only, if budget remains
  let cousinUsed = 0
  const parentId = index.parentOf.get(targetNodeId)
  if (parentId) {
    const parentSiblingIds = getSiblings(parentId, nodeMap, index).map((s) => s.id)
    for (const psId of parentSiblingIds) {
      const cousinIds = index.childrenOf.get(psId) ?? []
      for (const cousinId of cousinIds) {
        const cousin = nodeMap.get(cousinId)
        if (!cousin) continue
        const content = cousin.question
        const tokens = estimateTokens(content)
        if (cousinUsed + tokens > cousinBudget) break
        entries.push({
          nodeId: cousin.id,
          role: 'cousin',
          distanceFromTarget: 2,
          content,
          tokenEstimate: tokens,
        })
        cousinUsed += tokens
        usedTokens += tokens
      }
    }
  }

  // 4. Format into prompt string
  const formatted = formatContextForPrompt(entries, targetNodeId, nodeMap, ancestorsOmitted)

  return {
    entries,
    totalTokenEstimate: usedTokens,
    targetNodeId,
    formatted,
  }
}

function formatContextForPrompt(
  entries: ContextEntry[],
  targetNodeId: string,
  nodeMap: Map<string, SemanticNode>,
  ancestorsOmitted: number = 0,
): string {
  const lines = ['[GRAPH CONTEXT]']

  const ancestors = entries
    .filter((e) => e.role === 'ancestor')
    .sort((a, b) => b.distanceFromTarget - a.distanceFromTarget) // Root first

  if (ancestorsOmitted > 0) {
    lines.push(`- [${ancestorsOmitted} ancestor${ancestorsOmitted > 1 ? 's' : ''} omitted]`)
  }

  for (const entry of ancestors) {
    const label = entry.distanceFromTarget === ancestors.length ? 'Root' : 'Ancestor'
    lines.push(`- ${label} (depth ${entry.distanceFromTarget}): "${entry.content.substring(0, 200)}"`)
  }

  const siblingEntries = entries.filter((e) => e.role === 'sibling')
  for (const entry of siblingEntries) {
    const node = nodeMap.get(entry.nodeId)
    const stateLabel = node?.fsmState === 'resolved' ? 'Explored' : 'Unexplored'
    lines.push(`- Sibling (${stateLabel}): "${entry.content.substring(0, 150)}"`)
  }

  const cousins = entries.filter((e) => e.role === 'cousin')
  if (cousins.length > 0) {
    for (const entry of cousins) {
      lines.push(`- Cousin (question only): "${entry.content.substring(0, 100)}"`)
    }
  }

  const target = nodeMap.get(targetNodeId)
  if (target) {
    lines.push(`- Current Node: "${target.question}"`)
  }

  return lines.join('\n')
}
