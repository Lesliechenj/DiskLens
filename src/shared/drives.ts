// 磁盘分区信息（首页磁盘列表）：盘符 + 占用条 + 总量/可用
// 需求文档决策 1：首页是磁盘列表页，点盘直接进图表——小白第一眼就该看到「哪个盘满了」

import type { DriveInfo } from './types'

/** 把盘符根路径转成中文名，如 "C:\\" → "C 盘" */
export function driveTitle(drive: DriveInfo): string {
  if (/^[a-zA-Z]:/.test(drive.path)) return `${drive.label.replace(':', '')} 盘`
  return drive.label || drive.path
}

/** 已用比例（0–1），容量未知时按 0 处理 */
export function driveUsageRatio(drive: DriveInfo): number {
  if (!drive.totalBytes || drive.totalBytes <= 0) return 0
  return Math.min(1, Math.max(0, drive.usedBytes / drive.totalBytes))
}

/** 占用状态分级：给占用条配色用（>90% 危险红、>75% 警告橙、其余正常蓝） */
export function driveUsageLevel(drive: DriveInfo): 'normal' | 'warn' | 'danger' {
  const ratio = driveUsageRatio(drive)
  if (ratio >= 0.9) return 'danger'
  if (ratio >= 0.75) return 'warn'
  return 'normal'
}
