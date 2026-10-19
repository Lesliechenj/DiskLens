// 前端树操作：移到回收站成功后，把节点从内存树摘掉并沿链扣减大小
// 纯函数（原地改 root，返回是否命中）——可单测

import type { ScanNode } from '../../../shared/types'

/**
 * 按路径从树中摘除节点，并把所有祖先的 size 减去该节点大小。
 * 目录的 size = 子节点递归累计，所以摘除后必须逐级扣减，图表才守恒。
 *
 * @returns true = 命中并摘除；false = 路径不存在（或目标是根）
 */
export function removeNode(root: ScanNode, targetPath: string): boolean {
  // 栈元素带自己的祖先链（root 在链首，父节点在链尾）
  const stack: { node: ScanNode; ancestors: ScanNode[] }[] = [{ node: root, ancestors: [] }]

  let target: ScanNode | null = null
  let chain: ScanNode[] = []
  while (stack.length > 0) {
    const { node, ancestors } = stack.pop()!
    if (node.path === targetPath) {
      target = node
      chain = ancestors
      break
    }
    if (node.children) {
      const next = [...ancestors, node]
      for (const c of node.children) stack.push({ node: c, ancestors: next })
    }
  }

  // 未命中 / 根节点自身 → 不摘除
  if (!target || target === root) return false

  // 从父级摘除
  const parent = chain[chain.length - 1]
  if (!parent?.children) return false
  const idx = parent.children.indexOf(target)
  if (idx === -1) return false
  parent.children.splice(idx, 1)

  // 沿祖先链逐级扣减大小（root → … → parent）
  for (const ancestor of chain) {
    ancestor.size -= target.size
  }
  return true
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
