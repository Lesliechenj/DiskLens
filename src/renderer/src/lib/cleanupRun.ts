// 清理统一入口：确认弹窗、清理建议、新手向导都走这里
// 负责：调主进程执行（可能一次 UAC）、更新内存树、刷新回收站、弹出清理报告

import type { CleanupElevation, CleanupTarget, ScanNode } from '../../../shared/types'
import { baseNameOf } from '../../../shared/paths'
import { formatBytes } from '../../../shared/format'
import { toast, useUiStore } from '../store/uiStore'
import { useScanStore } from '../store/scanStore'
import { useDuplicateStore } from '../store/duplicateStore'
import { useTrashStore } from '../store/trashStore'

export interface CleanupRunOptions {
  /** 范围/来源说明，写进报告 */
  label?: string
  groupId?: string
  /** 覆盖设置里的授权策略 */
  elevation?: CleanupElevation
  /** 清理后立即从回收站彻底删除（不可恢复） */
  purgeAfter?: boolean
  /** 由调用方自己显示进度（向导） */
  silentProgress?: boolean
}

function driveScopeOf(paths: string[]): string {
  const drives = new Set<string>()
  for (const path of paths) {
    const match = /^([a-zA-Z]:)[\\/]/.exec(path)
    if (match) drives.add(match[1].toUpperCase())
  }
  return drives.size > 0 ? [...drives].join(' / ') : '本次清理'
}

/** 把扫描树节点转成清理目标 */
export function toCleanupTargets(nodes: ScanNode[], label = '', groupId = ''): CleanupTarget[] {
  return nodes.map((node) => ({
    path: node.path,
    name: node.name || baseNameOf(node.path),
    size: node.size,
    type: node.type,
    mtime: node.mtime,
    groupId: groupId || undefined,
    groupTitle: label || undefined
  }))
}

/**
 * 执行一次清理并弹出报告。
 * 返回报告；用户取消授权/失败时返回 null。
 */
export async function runCleanup(
  targets: CleanupTarget[],
  options: CleanupRunOptions = {}
): Promise<boolean> {
  if (targets.length === 0) {
    toast('info', '没有选中的清理项')
    return false
  }
  const ui = useUiStore.getState()
  const scope = options.label || driveScopeOf(targets.map((item) => item.path))
  const total = targets.length

  if (!options.silentProgress) {
    ui.setTrashProgress({ done: 0, total, current: targets[0]?.path ?? '' })
  }

  try {
    const result = await window.api.executeCleanup({
      targets,
      scope,
      elevation: options.elevation,
      purgeAfter: options.purgeAfter === true
    })

    if (result.elevationCancelled) {
      toast('info', '已取消管理员授权，没有删除任何文件')
      return false
    }
    if (!result.ok || !result.report) {
      toast('err', result.message ?? '清理没有完成，稍后再试')
      return false
    }

    const report = result.report
    const okPaths = report.outcomes.filter((item) => item.ok).map((item) => item.path)
    if (okPaths.length > 0) {
      const removal = useScanStore.getState().removePaths(okPaths)
      useDuplicateStore.getState().applyDeleted(okPaths, useScanStore.getState().treeVersion)
      // 快照里还有刚删掉的文件，继续保留会误导下次恢复；清理成功后作废
      useScanStore.getState().setSnapshotMeta(null)
      void window.api.deleteSnapshot().catch(() => undefined)
      toast(
        'ok',
        `已清理 ${report.successCount} 项，腾出 ${formatBytes(report.freedBytes)}${
          removal.removed > 0 ? '' : '（这些项目不在当前扫描树里）'
        }`
      )
    } else {
      toast('err', '这批项目都没能删掉，报告里有原因')
    }
    if (report.failedCount > 0 && report.successCount > 0) {
      toast('err', `${report.failedCount} 项没删掉，详细原因见报告`)
    }

    ui.setCleanupReport(report)
    void useTrashStore.getState().refresh()
    return true
  } catch (error) {
    toast('err', error instanceof Error ? error.message : String(error))
    return false
  } finally {
    if (!options.silentProgress) {
      ui.setTrashProgress({ done: total, total, current: '' })
      window.setTimeout(() => ui.setTrashProgress(null), 900)
    }
  }
}
