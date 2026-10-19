// 文件名模糊搜索：前端全树匹配，不重扫
// 命中结果带祖先链，点击可跳转到所在层

import type { ScanNode } from '../../../shared/types'

/** 单条命中 */
export interface SearchHit {
  node: ScanNode
  /** 祖先链（从根到父节点，含根）；跳转时直接铺成面包屑 */
  ancestors: ScanNode[]
}

/** 结果上限：小白一屏能看完的量，防匹配上万条卡死渲染 */
export const SEARCH_LIMIT = 200

/**
 * 全树按名称模糊匹配（大小写不敏感），按大小降序。
 * keyword 为空返回空数组。迭代遍历，深树不爆栈。
 */
export function searchTree(root: ScanNode, keyword: string, limit = SEARCH_LIMIT): SearchHit[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw) return []

  const hits: SearchHit[] = []
  // 栈元素：节点 + 它的祖先链
  const stack: { node: ScanNode; ancestors: ScanNode[] }[] = [{ node: root, ancestors: [] }]

  while (stack.length > 0) {
    const { node, ancestors } = stack.pop()!
    if (node.name.toLowerCase().includes(kw)) {
      hits.push({ node, ancestors })
    }
    if (node.children) {
      const nextAncestors = [...ancestors, node]
      for (const c of node.children) stack.push({ node: c, ancestors: nextAncestors })
    }
  }

  hits.sort((a, b) => b.node.size - a.node.size)
  return limit > 0 ? hits.slice(0, limit) : hits
}
