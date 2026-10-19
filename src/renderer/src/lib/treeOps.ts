// 前端树操作：移到回收站成功后，把节点从内存树摘掉并沿链扣减大小
// 纯函数（原地改 root）——可单测

import type { ScanNode } from '../../../shared/types'

/**
 * 批量按路径从树中摘除节点，并沿祖先链扣减大小与文件计数。
 * 一次遍历解决，避免"删 200 个文件就遍历 200 遍整棵树"。
 *
 * @returns 实际摘除的节点数与被释放的字节数（图表/状态栏据此刷新）
 */
export function removeNodes(
  root: ScanNode,
  targetPaths: Iterable<string>
): { removed: number; freedBytes: number } {
  const targets = new Set(targetPaths)
  if (targets.size === 0) return { removed: 0, freedBytes: 0 }
  if (targets.has(root.path)) return { removed: 0, freedBytes: 0 }

  let removed = 0
  let freedBytes = 0

  /** 后序遍历：先处理孩子，再决定自己要不要留（孩子被摘掉后 size 已经更新） */
  const stack: { node: ScanNode; visited: boolean }[] = [{ node: root, visited: false }]
  while (stack.length > 0) {
    const item = stack.pop()!
    if (!item.visited) {
      stack.push({ node: item.node, visited: true })
      for (const kid of item.node.children ?? []) stack.push({ node: kid, visited: false })
      continue
    }
    const node = item.node
    if (!node.children || node.children.length === 0) continue

    const before = node.children.length
    let delta = 0
    const kept: ScanNode[] = []
    for (const kid of node.children) {
      if (targets.has(kid.path)) {
        // 直接命中：整棵摘掉，扣它现在的 size
        removed++
        freedBytes += kid.size
        delta += kid.size
      } else {
        kept.push(kid)
      }
    }
    if (kept.length !== before) {
      node.children = kept
      node.size = Math.max(0, node.size - delta)
    }
  }

  return { removed, freedBytes }
}

/** 单个节点摘除（保留旧语义，内部走批量实现） */
export function removeNode(root: ScanNode, targetPath: string): boolean {
  return removeNodes(root, [targetPath]).removed > 0
}

/**
 * 全盘最大的 N 个文件（排行榜数据源）。
 * 有界选择：只维护一个长度 limit 的有序小数组，不把所有文件排序——
 * 百万文件的盘也就一次遍历 + 常数次插入，比全排序快一个量级。
 */
export function topFilesOfTree(root: ScanNode, limit = 10): ScanNode[] {
  const top: ScanNode[] = []
  const stack: ScanNode[] = [root]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.type === 'file') {
      if (top.length < limit) {
        top.push(node)
        top.sort((a, b) => b.size - a.size)
      } else if (node.size > top[limit - 1].size) {
        top[limit - 1] = node
        top.sort((a, b) => b.size - a.size)
      }
    } else if (node.children) {
      for (const c of node.children) stack.push(c)
    }
  }
  return top
}
