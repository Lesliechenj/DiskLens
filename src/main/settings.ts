// 设置持久化：userData/disklens-settings.json
// 读写都走内存缓存 + 防抖落盘，UI 改设置不产生磁盘风暴

import { app } from 'electron'
import { promises as fs } from 'fs'
import { dirname, join } from 'path'
import { defaultSettings, normalizeSettings } from '../shared/settings'
import type { AppSettings } from '../shared/types'

let cache: AppSettings | null = null
let saveTimer: NodeJS.Timeout | null = null
let pending: AppSettings | null = null

/** 设置文件路径（延迟到 app ready 之后才可用） */
export function settingsFilePath(): string {
  return join(app.getPath('userData'), 'disklens-settings.json')
}

/** 读设置：文件不存在/损坏都回落默认值，绝不让应用起不来 */
export async function loadSettings(): Promise<AppSettings> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(settingsFilePath(), 'utf8')
    cache = normalizeSettings(JSON.parse(raw))
  } catch {
    cache = defaultSettings()
  }
  return cache
}

/** 同步取当前设置（已 load 过才有值） */
export function currentSettings(): AppSettings {
  return cache ?? defaultSettings()
}

/** 立即写盘 */
async function flush(): Promise<void> {
  if (!pending) return
  const data = pending
  pending = null
  try {
    await fs.mkdir(dirname(settingsFilePath()), { recursive: true })
    await fs.writeFile(settingsFilePath(), JSON.stringify(data, null, 2), 'utf8')
  } catch {
    // 磁盘满/权限问题：设置写不进去不该影响使用，下次再试
  }
}

/** 合并一批改动并安排落盘（600ms 防抖，避免拖拽窗口时疯狂写盘） */
export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = normalizeSettings({ ...currentSettings(), ...patch })
  cache = merged
  pending = merged
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flush()
  }, 600)
  return merged
}

/** 退出前落盘，保证窗口尺寸这类"最后一次改动"不丢 */
export async function flushSettings(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  await flush()
}
