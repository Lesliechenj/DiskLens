// 磁盘枚举：盘符 + 容量 + 卷标（首页磁盘列表的数据源）
// 分两步走：statfs 先给出"能用"的列表（毫秒级），卷标再后台补（PowerShell 要几百毫秒到几秒）
// 这样打开应用第一屏就有东西看，卷标稍后自己填上

import { promises as fs } from 'fs'
import { execFile } from 'child_process'
import type { DriveInfo } from '../shared/types'

/** 一次 PowerShell 查询的超时：别为了个卷标把首页卡住 */
const VOLUME_QUERY_TIMEOUT_MS = 4000
/** 卷标缓存时间：窗口拖一拖不该反复去问 WMI */
const VOLUME_CACHE_MS = 30_000

interface VolumeMeta {
  volumeName: string
  removable: boolean
  totalBytes: number
  freeBytes: number
}

let volumeCache: { at: number; data: Map<string, VolumeMeta> } | null = null
let volumeInFlight: Promise<Map<string, VolumeMeta>> | null = null

/** 取 Windows 卷信息（卷标/介质类型）；任何失败都返回空表，不影响主流程 */
async function queryWindowsVolumes(): Promise<Map<string, VolumeMeta>> {
  const result = new Map<string, VolumeMeta>()
  if (process.platform !== 'win32') return result
  if (volumeCache && Date.now() - volumeCache.at < VOLUME_CACHE_MS) return volumeCache.data
  if (volumeInFlight) return volumeInFlight

  const script =
    '[Console]::OutputEncoding=[Text.Encoding]::UTF8;' +
    'Get-CimInstance Win32_LogicalDisk | ' +
    'Select-Object DeviceID,VolumeName,DriveType,Size,FreeSpace | ' +
    'ConvertTo-Json -Compress'

  volumeInFlight = (async () => {
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', script],
          { timeout: VOLUME_QUERY_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024 },
          (error, out) => (error ? reject(error) : resolve(out))
        )
      })
      const parsed = JSON.parse(stdout) as
        | {
            DeviceID?: string
            VolumeName?: string
            DriveType?: number
            Size?: number
            FreeSpace?: number
          }
        | Array<{
            DeviceID?: string
            VolumeName?: string
            DriveType?: number
            Size?: number
            FreeSpace?: number
          }>
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of list) {
        if (!item?.DeviceID) continue
        result.set(item.DeviceID.toUpperCase(), {
          volumeName: (item.VolumeName ?? '').trim(),
          // DriveType: 2 = 可移动，3 = 本地固定，4 = 网络，5 = 光驱
          removable: item.DriveType === 2 || item.DriveType === 4,
          totalBytes: typeof item.Size === 'number' ? item.Size : 0,
          freeBytes: typeof item.FreeSpace === 'number' ? item.FreeSpace : 0
        })
      }
      volumeCache = { at: Date.now(), data: result }
    } catch {
      // 老系统 / 精简系统没有 PowerShell / WMI：静默降级，卷标留空
      volumeCache = { at: Date.now(), data: result }
    } finally {
      volumeInFlight = null
    }
    return result
  })()

  return volumeInFlight
}

/** statfs 取容量，失败返回 null（光驱无盘、网络盘掉线等） */
async function statCapacity(
  path: string
): Promise<{ totalBytes: number; freeBytes: number } | null> {
  try {
    const stat = await fs.statfs(path)
    const totalBytes = stat.bsize * stat.blocks
    const freeBytes = stat.bsize * stat.bavail
    if (!Number.isFinite(totalBytes) || totalBytes <= 0) return null
    return { totalBytes, freeBytes }
  } catch {
    return null
  }
}

/** 盘符列表（Windows 探 A–Z；其它平台看常见挂载点） */
function candidatePaths(): string[] {
  if (process.platform === 'win32') {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => `${letter}:\\`)
  }
  return process.platform === 'darwin'
    ? ['/', '/Volumes']
    : ['/', '/home', '/mnt', '/media', '/var']
}

/**
 * 快速枚举：只问 statfs（毫秒级），卷标留空。
 * 首次打开应用时先用它把磁盘列出来，别让用户对着空白等 WMI。
 */
export async function listDrives(): Promise<DriveInfo[]> {
  const paths = candidatePaths()
  const probes = await Promise.all(
    paths.map(async (path) => ({ path, capacity: await statCapacity(path) }))
  )
  const drives: DriveInfo[] = []
  for (const { path, capacity } of probes) {
    if (!capacity) continue
    const label = /^[a-zA-Z]:\\$/.test(path) ? path.slice(0, 2) : path
    drives.push({
      path,
      label,
      volumeName: '',
      totalBytes: capacity.totalBytes,
      freeBytes: capacity.freeBytes,
      usedBytes: Math.max(0, capacity.totalBytes - capacity.freeBytes),
      removable: false
    })
  }
  return drives.sort((a, b) => a.label.localeCompare(b.label))
}

/** 补齐卷标/介质类型（Windows 走 WMI，失败就原样返回） */
export async function enrichDrives(drives: DriveInfo[]): Promise<DriveInfo[]> {
  if (process.platform !== 'win32' || drives.length === 0) return drives
  const volumes = await queryWindowsVolumes()
  if (volumes.size === 0) return drives
  return drives.map((drive) => {
    const meta = volumes.get(drive.label.toUpperCase())
    if (!meta) return drive
    const totalBytes = drive.totalBytes > 0 ? drive.totalBytes : meta.totalBytes
    const freeBytes = drive.totalBytes > 0 ? drive.freeBytes : meta.freeBytes
    return {
      ...drive,
      volumeName: meta.volumeName,
      removable: meta.removable,
      totalBytes,
      freeBytes,
      usedBytes: Math.max(0, totalBytes - freeBytes)
    }
  })
}
