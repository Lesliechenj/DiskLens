// 设置与磁盘列表：主题、排除清单、最近路径、分区容量
// 设置读写走主进程 JSON（跨启动保留），主题解析在渲染层做（要跟随系统）

import { create } from 'zustand'
import type { AppSettings, DriveInfo, ThemeMode } from '../../../shared/types'
import { defaultSettings, pushRecentPath } from '../../../shared/settings'
import type { AppInfo } from '../../../preload/index.d'
import { useScanStore } from './scanStore'

interface SettingsState {
  /** 当前设置（初始为默认值，init 后与磁盘一致） */
  settings: AppSettings
  /** 磁盘分区列表 */
  drives: DriveInfo[]
  drivesLoading: boolean
  /** 分区容量刷新时间 */
  drivesUpdatedAt: number
  /** 是否已完成首次初始化 */
  ready: boolean
  /** 系统是否偏好深色（theme = system 时用） */
  systemDark: boolean
  /** 最终生效是否深色 */
  dark: boolean
  /** 应用版本/平台信息（状态栏与关于页用） */
  info: AppInfo | null
  init: () => Promise<void>
  refreshDrives: () => Promise<void>
  /** 改设置：立即生效 + 落盘 */
  patch: (patch: Partial<AppSettings>) => Promise<void>
  setTheme: (theme: ThemeMode) => void
  /** 记录一次扫描路径到"最近" */
  addRecent: (path: string) => void
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return true
  }
}

function resolveDark(theme: ThemeMode, systemDark: boolean): boolean {
  if (theme === 'light') return false
  if (theme === 'dark') return true
  return systemDark
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: defaultSettings(),
  drives: [],
  drivesLoading: false,
  drivesUpdatedAt: 0,
  ready: false,
  systemDark: systemPrefersDark(),
  dark: resolveDark(defaultSettings().theme, systemPrefersDark()),
  info: null,

  init: async () => {
    // 版本/平台信息（状态栏与关于页）
    try {
      const info = await window.api.appInfo()
      set({ info })
    } catch {
      // 拿不到就显示兜底版本号
    }
    // 跟随系统主题的实时切换
    try {
      const query = window.matchMedia('(prefers-color-scheme: dark)')
      const onChange = (event: MediaQueryListEvent): void => {
        const systemDark = event.matches
        set((state) => ({
          systemDark,
          dark: resolveDark(state.settings.theme, systemDark)
        }))
      }
      query.addEventListener('change', onChange)
    } catch {
      // 老 Chromium 没有 addEventListener：忽略，主题退化为手动
    }

    // 卷标补齐后主进程会再推一次完整磁盘列表（首屏先用快速结果）
    try {
      window.api.onDrivesUpdated((drives) => {
        set({ drives, drivesUpdatedAt: Date.now() })
      })
    } catch {
      // 老版本 preload 没有这个接口：忽略，卷标只显示为空
    }

    try {
      const settings = await window.api.getSettings()
      set((state) => ({
        settings,
        ready: true,
        dark: resolveDark(settings.theme, state.systemDark)
      }))
      // 记住上次路径：扫描栏输入框启动就带出来
      if (settings.rememberPath && settings.lastPath) {
        const scan = useScanStore.getState()
        if (!scan.input) scan.setInput(settings.lastPath)
      }
    } catch {
      set({ ready: true })
    }
    await get().refreshDrives()
  },

  refreshDrives: async () => {
    set({ drivesLoading: true })
    try {
      const drives = await window.api.listDrives()
      set({ drives, drivesLoading: false, drivesUpdatedAt: Date.now() })
    } catch {
      set({ drivesLoading: false, drivesUpdatedAt: Date.now() })
    }
  },

  patch: async (patch) => {
    const merged = { ...get().settings, ...patch }
    set((state) => ({ settings: merged, dark: resolveDark(merged.theme, state.systemDark) }))
    try {
      const settings = await window.api.updateSettings(patch)
      set((state) => ({
        settings,
        dark: resolveDark(settings.theme, state.systemDark)
      }))
    } catch {
      // 落盘失败：界面已生效，下次启动回落旧值，不打断使用
    }
  },

  setTheme: (theme) => {
    set((state) => ({
      settings: { ...state.settings, theme },
      dark: resolveDark(theme, state.systemDark)
    }))
    void window.api.updateSettings({ theme }).catch(() => undefined)
  },

  addRecent: (path) => {
    const next = pushRecentPath(get().settings.recentPaths, path)
    set((state) => ({ settings: { ...state.settings, recentPaths: next, lastPath: path } }))
  }
}))

/** 当前生效主题是否深色（组件里直接用它选图表配色） */
export function useDark(): boolean {
  return useSettingsStore((state) => state.dark)
}
