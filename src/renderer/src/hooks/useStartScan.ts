// 发起扫描：路径宽容解析 + 人话报错 + 状态机推进
// 欢迎页磁盘卡片、侧栏最近路径、扫描栏、拖拽投放都走这一个入口

import { useCallback } from 'react'
import { isDriveRoot, normalizeUserPath, pathErrorMessage } from '../../../shared/paths'
import { useScanStore } from '../store/scanStore'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/uiStore'
import { friendlyError } from '../lib/errors'

export interface StartScanResult {
  ok: boolean
}

/** 返回 startScan(path) —— 内部已做校验、报错、状态推进 */
export function useStartScan(): (rawPath: string) => Promise<StartScanResult> {
  const begin = useScanStore((state) => state.begin)
  const setError = useScanStore((state) => state.setError)
  const excludes = useSettingsStore((state) => state.settings.excludes)
  const addRecent = useSettingsStore((state) => state.addRecent)

  return useCallback(
    async (rawPath: string) => {
      const target = normalizeUserPath(rawPath)
      if (!target) {
        toast('err', '先选一个磁盘或者文件夹，再点开始扫描')
        return { ok: false }
      }
      try {
        // 新手第一坑：把「C盘」当路径 / 选了文件就来扫——先校验，用人话讲清楚
        const check = await window.api.checkPath(target)
        const problem = pathErrorMessage(check)
        if (problem) {
          setError(problem)
          toast('err', problem)
          return { ok: false }
        }
        begin()
        addRecent(target)
        useScanStore.getState().setInput(target)
        // 整盘扫描慢是客观事实，先给用户一句预期管理（别让人以为卡死了）
        if (isDriveRoot(target)) {
          toast(
            'info',
            `正在扫整个 ${target.replace(/\/$/, '')}，盘大的话要几分钟；随时可以点「取消扫描」`
          )
        }
        const started = await window.api.startScan(target, excludes)
        if (!started.ok) {
          const message = started.message ?? '扫描没启动起来，稍后再试'
          setError(message)
          toast('err', message)
          return { ok: false }
        }
        return { ok: true }
      } catch (error) {
        const message = friendlyError('启动扫描', error)
        setError(message)
        toast('err', message)
        return { ok: false }
      }
    },
    [begin, setError, excludes, addRecent]
  )
}
