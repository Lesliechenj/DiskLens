// 发起扫描：路径宽容解析 + 人话报错 + 状态机推进
// 支持单个路径，也支持一次扫多个盘/目录（C:/;D:/;E:/ 或字符串数组）

import { useCallback } from 'react'
import {
  isDriveRoot,
  normalizeUserPath,
  normalizeUserPaths,
  pathErrorMessage,
  splitUserPaths
} from '../../../shared/paths'
import { useScanStore } from '../store/scanStore'
import { useSettingsStore } from '../store/settingsStore'
import { toast } from '../store/uiStore'
import { friendlyError } from '../lib/errors'

export interface StartScanResult {
  ok: boolean
}

/** 返回 startScan(paths) —— 内部已做校验、报错、状态推进 */
export function useStartScan(): (raw: string | string[]) => Promise<StartScanResult> {
  const begin = useScanStore((state) => state.begin)
  const setError = useScanStore((state) => state.setError)
  const excludes = useSettingsStore((state) => state.settings.excludes)
  const addRecent = useSettingsStore((state) => state.addRecent)

  return useCallback(
    async (raw: string | string[]) => {
      const paths = Array.isArray(raw)
        ? normalizeUserPaths(raw.join(';'))
        : splitUserPaths(raw).length > 1
          ? normalizeUserPaths(raw)
          : [normalizeUserPath(raw)].filter(Boolean)

      if (paths.length === 0) {
        toast('err', '先选一个磁盘或者文件夹，再点开始扫描')
        return { ok: false }
      }
      try {
        // 新手第一坑：把「C盘」当路径 / 选了文件就来扫——先校验，用人话讲清楚
        for (const target of paths) {
          const check = await window.api.checkPath(target)
          const problem = pathErrorMessage(check)
          if (problem) {
            setError(problem)
            toast('err', problem)
            return { ok: false }
          }
        }

        begin()
        if (paths.length === 1) addRecent(paths[0])
        const display = paths.join('; ')
        useScanStore.getState().setInput(display)

        if (paths.length > 1) {
          toast('info', `正在扫 ${paths.length} 个位置，盘大的话要几分钟；随时可以取消`)
        } else if (isDriveRoot(paths[0])) {
          toast(
            'info',
            `正在扫整个 ${paths[0].replace(/\/$/, '')}，盘大的话要几分钟；随时可以点「取消扫描」`
          )
        }

        const started = await window.api.startScan(paths, excludes)
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
