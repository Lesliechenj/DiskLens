// 应用设置：默认值 + 合并逻辑（纯函数，主进程与渲染层共用）

import type { AppSettings, ThemeMode } from './types'
import { DEFAULT_EXCLUDE_NAMES } from './excludes'

/** 设置默认值 */
export function defaultSettings(): AppSettings {
  return {
    theme: 'dark',
    excludes: [...DEFAULT_EXCLUDE_NAMES],
    minChildSize: 0,
    rememberPath: true,
    lastPath: '',
    recentPaths: [],
    windowBounds: null
  }
}

const THEMES: ThemeMode[] = ['dark', 'light', 'system']

/** 把任意输入合并成合法设置（坏数据/旧版本设置不崩，字段逐个兜底） */
export function normalizeSettings(raw: unknown): AppSettings {
  const base = defaultSettings()
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Partial<AppSettings>

  const theme = THEMES.includes(input.theme as ThemeMode) ? (input.theme as ThemeMode) : base.theme
  const excludes = Array.isArray(input.excludes)
    ? input.excludes.filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    : base.excludes
  const minChildSize =
    typeof input.minChildSize === 'number' && Number.isFinite(input.minChildSize)
      ? Math.max(0, Math.round(input.minChildSize))
      : base.minChildSize
  const recentPaths = Array.isArray(input.recentPaths)
    ? input.recentPaths
        .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
        .slice(0, 8)
    : base.recentPaths

  return {
    theme,
    excludes,
    minChildSize,
    rememberPath: typeof input.rememberPath === 'boolean' ? input.rememberPath : base.rememberPath,
    lastPath: typeof input.lastPath === 'string' ? input.lastPath : base.lastPath,
    recentPaths,
    windowBounds:
      input.windowBounds &&
      typeof input.windowBounds === 'object' &&
      Number.isFinite((input.windowBounds as { width?: number }).width) &&
      Number.isFinite((input.windowBounds as { height?: number }).height)
        ? {
            x: typeof input.windowBounds.x === 'number' ? input.windowBounds.x : undefined,
            y: typeof input.windowBounds.y === 'number' ? input.windowBounds.y : undefined,
            width: Math.max(880, Math.round(input.windowBounds.width)),
            height: Math.max(560, Math.round(input.windowBounds.height)),
            maximized: input.windowBounds.maximized === true
          }
        : base.windowBounds
  }
}

/** 把一个路径塞进"最近扫描"列表：去重、置顶、最多 8 条 */
export function pushRecentPath(list: string[], path: string): string[] {
  const trimmed = path.trim()
  if (!trimmed) return list
  return [trimmed, ...list.filter((p) => p.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8)
}
