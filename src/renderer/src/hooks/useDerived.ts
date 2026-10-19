// 派生数据 hooks：一棵树 → 统计/清理建议（带记忆化，百万文件也只算一次）
// 依赖 treeVersion：树是就地修改的（删文件不换 root 引用），
// 只有 treeVersion 变化时能知道"该重算了"——所以它是必要的依赖，不是多余的。

import { useMemo } from 'react'
import { useScanStore } from '../store/scanStore'
import { computeInsights, type Insights } from '../lib/insights'
import { findCleanupGroups, type CleanupGroup } from '../lib/cleanup'
import { primeCategoryCache } from '../lib/chartCommon'

/** 全树统计（类型构成、大文件榜、文件夹榜共用一次遍历） */
export function useInsights(): Insights | null {
  const result = useScanStore((state) => state.result)
  const treeVersion = useScanStore((state) => state.treeVersion)
  return useMemo(
    () => {
      if (!result) return null
      // 顺手把"目录的代表大类"一次算完，面积图上色就不用每个目录各扫一遍子树
      primeCategoryCache(result.root)
      return computeInsights(result.root)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 树就地修改，靠 treeVersion 触发重算
    [result, treeVersion]
  )
}

/** 清理建议清单 */
export function useCleanupGroups(): CleanupGroup[] {
  const result = useScanStore((state) => state.result)
  const treeVersion = useScanStore((state) => state.treeVersion)
  return useMemo(
    () => {
      if (!result) return []
      return findCleanupGroups(result.root)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 同上
    [result, treeVersion]
  )
}

/** 可清理总空间（侧栏徽章用） */
export function useCleanupTotal(): number {
  const groups = useCleanupGroups()
  return useMemo(() => groups.reduce((sum, group) => sum + group.totalSize, 0), [groups])
}
