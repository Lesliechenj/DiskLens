// 系统垃圾扫描：只扫已知的临时/缓存/日志目录，比整盘扫描快得多
// 目的：让「一键清理」真的能清到浏览器缓存、Windows 临时文件，而不是只扫到用户文档里的安装包。

import { promises as fs } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ScanResult } from '../shared/types'
import { scanPaths } from '../scanner/scan'

export interface JunkScanResult {
  ok: boolean
  result?: ScanResult
  roots?: string[]
  message?: string
}

/** 判断目录存在（存在且是目录） */
async function isDir(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** 列出子目录（失败返回空数组） */
async function listDirs(path: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(path, { withFileTypes: true })
    return entries.filter((entry) => entry.isDirectory()).map((entry) => join(path, entry.name))
  } catch {
    return []
  }
}

/** 收集这台机器上已知的垃圾目录（不存在就跳过） */
export async function discoverJunkRoots(): Promise<string[]> {
  const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local')
  const roaming = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const programData = process.env.ProgramData ?? 'C:\\ProgramData'
  const candidates = new Set<string>()

  const add = (path: string | undefined): void => {
    if (path && path.trim()) candidates.add(path)
  }

  // 用户临时文件 / 崩溃转储 / 缩略图 / 浏览器缓存
  // 不把 Downloads 放进"一键清理"：里面可能有用户自己的 .bak/.old 资料，
  // 想清安装包请用「完整扫描」后在清理建议里手动确认。
  add(process.env.TEMP)
  add(join(local, 'Temp'))
  add(join(local, 'CrashDumps'))
  add(join(local, 'Microsoft', 'Windows', 'INetCache'))
  add(join(local, 'Microsoft', 'Windows', 'Explorer'))
  add(join(local, 'Microsoft', 'Windows', 'WebCache'))
  for (const browser of [
    join(local, 'Google', 'Chrome', 'User Data'),
    join(local, 'Microsoft', 'Edge', 'User Data'),
    join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    join(roaming, 'Opera Software', 'Opera Stable')
  ]) {
    for (const profile of await listDirs(browser)) {
      for (const cache of ['Cache', 'Code Cache', 'GPUCache', 'Service Worker']) {
        add(join(profile, cache))
      }
    }
    for (const cache of ['Cache', 'Code Cache', 'GPUCache', 'Service Worker']) {
      add(join(browser, cache))
    }
  }
  const firefoxProfiles = join(roaming, 'Mozilla', 'Firefox', 'Profiles')
  for (const profile of await listDirs(firefoxProfiles)) add(join(profile, 'cache2'))

  // Windows 系统临时/更新/日志/错误报告
  add(join(systemRoot, 'Temp'))
  add(join(systemRoot, 'SystemTemp'))
  add(join(systemRoot, 'SoftwareDistribution', 'Download'))
  add(join(systemRoot, 'SoftwareDistribution', 'DeliveryOptimization'))
  add(join(systemRoot, 'Prefetch'))
  add(join(systemRoot, 'Logs'))
  add(join(systemRoot, 'Minidump'))
  add(join(systemRoot, 'LiveKernelReports'))
  add(join(programData, 'Microsoft', 'Windows', 'WER'))
  add(join(programData, 'Microsoft', 'Windows', 'DeliveryOptimization'))
  add(join(programData, 'Microsoft', 'Windows', 'RetailDemo', 'OfflineContent'))

  // 非 C 盘根目录下的常见临时目录（游戏/软件有时会建）
  for (const letter of 'DEFGHIJKLMNOPQRSTUVWXYZ') {
    add(`${letter}:\\Temp`)
    add(`${letter}:\\tmp`)
  }

  const roots: string[] = []
  for (const path of candidates) {
    if (await isDir(path)) roots.push(path)
  }
  return roots
}

/**
 * 扫描已知垃圾目录。返回的树只包含这些目录，用来生成清理建议；
 * 和整盘扫描的树分开，避免重复计算，也不会把系统盘全量拖进来。
 */
export async function scanJunk(
  onProgress?: (progress: {
    files: number
    dirs: number
    bytes: number
    currentPath: string
    elapsedMs: number
  }) => void,
  shouldStop?: () => boolean
): Promise<JunkScanResult> {
  const roots = await discoverJunkRoots()
  if (roots.length === 0) return { ok: false, message: '没有找到可以扫描的临时/缓存目录' }
  const result = await scanPaths(roots, onProgress, { shouldStop })
  // 顶层节点改名：避免把整个 %TEMP% 目录当成一个"缓存目录"整包选中
  // （里面通常有正在使用的文件，整目录删会失败；改名后清理规则会细到里面的文件/子缓存目录）
  const root = {
    ...result.root,
    name: '系统缓存与临时文件',
    children: (result.root.children ?? []).map((child) => ({
      ...child,
      name: `${child.name}（扫描内容）`
    }))
  }
  return { ok: true, result: { ...result, root }, roots }
}
