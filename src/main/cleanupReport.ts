// 清理报告：每次清理后生成一份自包含 HTML（双击就能在浏览器里看）
// 内容：清理前后各盘可用空间、释放了多少、按类别统计、逐条明细、失败原因
// 文件放在 userData/reports/，弹窗里可以直接打开或定位

import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type {
  CleanupOutcome,
  CleanupReport,
  CleanupReportGroup,
  CleanupTarget,
  DriveInfo
} from '../shared/types'
import { formatBytes, formatCount, formatPercent, formatTime } from '../shared/format'
import { extInfo } from '../shared/extCategories'
import { riskOf } from '../shared/risk'

export interface BuildCleanupReportInput {
  targets: CleanupTarget[]
  outcomes: CleanupOutcome[]
  beforeDrives: DriveInfo[]
  afterDrives: DriveInfo[]
  scope: string
  mode: 'normal' | 'elevated'
  startedAt: number
  durationMs: number
  /** 彻底删除时实际释放的字节数（不再按目标大小估算） */
  freedBytesOverride?: number
  purged?: boolean
  purgedBytes?: number
  purgedCount?: number
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function stampForFile(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/** 生成报告对象（不落盘，便于测试/预览） */
export function buildCleanupReport(input: BuildCleanupReportInput): CleanupReport {
  const createdAt = Date.now()
  const outcomeByPath = new Map(input.outcomes.map((item) => [item.path, item]))
  const reportPath = join(
    app.getPath('userData'),
    'reports',
    `DiskLens-清理报告-${stampForFile(new Date(createdAt))}.html`
  )

  const groupMap = new Map<string, CleanupReportGroup>()
  for (const target of input.targets) {
    const title =
      target.groupTitle?.trim() ||
      (target.type === 'dir' ? '文件夹' : extInfo(target.name).label || '其他文件')
    const id = title
    const row = groupMap.get(id) ?? { id, title, count: 0, size: 0, successCount: 0 }
    row.count++
    row.size += target.size
    if (outcomeByPath.get(target.path)?.ok) row.successCount++
    groupMap.set(id, row)
  }

  const successCount = input.outcomes.filter((item) => item.ok).length
  return {
    id: `cleanup-${createdAt}`,
    createdAt,
    scope: input.scope,
    mode: input.mode,
    targets: input.targets,
    outcomes: input.outcomes,
    beforeDrives: input.beforeDrives,
    afterDrives: input.afterDrives,
    groups: [...groupMap.values()].sort((a, b) => b.size - a.size),
    totalBytes: input.targets.reduce((sum, item) => sum + item.size, 0),
    freedBytes:
      input.freedBytesOverride ??
      input.targets.reduce(
        (sum, item) => (outcomeByPath.get(item.path)?.ok ? sum + item.size : sum),
        0
      ),
    itemCount: input.targets.length,
    successCount,
    failedCount: input.targets.length - successCount,
    durationMs: input.durationMs,
    purged: input.purged,
    purgedBytes: input.purgedBytes,
    purgedCount: input.purgedCount,
    reportPath
  }
}

/** 清理报告 HTML（自包含，不依赖网络） */
export function renderCleanupReportHtml(report: CleanupReport): string {
  const beforeByPath = new Map(report.beforeDrives.map((drive) => [drive.path, drive]))
  const diskRows = report.afterDrives
    .map((after) => {
      const before = beforeByPath.get(after.path)
      const beforeFree = before?.freeBytes ?? 0
      const delta = after.freeBytes - beforeFree
      const deltaText = delta >= 0 ? `+${formatBytes(delta)}` : `-${formatBytes(-delta)}`
      return `<tr>
        <td><b>${escapeHtml(after.label)}</b> ${escapeHtml(after.volumeName || '')}</td>
        <td class="num">${formatBytes(beforeFree)}</td>
        <td class="num">${formatBytes(after.freeBytes)}</td>
        <td class="num ${delta >= 0 ? 'up' : 'down'}">${deltaText}</td>
        <td class="num">${formatPercent(after.freeBytes, after.totalBytes)}%</td>
      </tr>`
    })
    .join('')

  const groupRows = report.groups
    .map(
      (group) => `<tr>
        <td>${escapeHtml(group.title)}</td>
        <td class="num">${formatCount(group.count)}</td>
        <td class="num">${formatBytes(group.size)}</td>
        <td class="num">${formatCount(group.successCount)}</td>
        <td class="num">${formatPercent(group.size, report.totalBytes)}%</td>
      </tr>`
    )
    .join('')

  const outcomeByPath = new Map(report.outcomes.map((item) => [item.path, item]))
  const detailLimit = 5000
  const detailRows = report.targets
    .slice(0, detailLimit)
    .map((target) => {
      const outcome = outcomeByPath.get(target.path)
      const risk = riskOf({
        name: target.name,
        path: target.path,
        size: target.size,
        type: target.type,
        mtime: target.mtime
      })
      return `<tr>
        <td class="file">
          <div>${escapeHtml(target.name)}</div>
          <div class="path">${escapeHtml(target.path)}</div>
        </td>
        <td class="num">${formatBytes(target.size)}</td>
        <td>${escapeHtml(target.groupTitle || risk.label)}</td>
        <td>${outcome?.ok ? '<span class="ok">已移到回收站</span>' : `<span class="fail">失败：${escapeHtml(outcome?.message || '未知原因')}</span>`}</td>
      </tr>`
    })
    .join('')

  const modeText = report.mode === 'elevated' ? '管理员授权（一次授权，整批执行）' : '普通权限'
  const allOk = report.failedCount === 0
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>DiskLens 清理报告 · ${formatTime(report.createdAt)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f3f6fb; color: #1c2433; font: 14px/1.65 "Microsoft YaHei UI", "Microsoft YaHei", system-ui, sans-serif; }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 28px 22px 60px; }
  header { display: flex; align-items: center; gap: 14px; padding-bottom: 18px; border-bottom: 1px solid #dbe3ef; }
  .logo { width: 42px; height: 42px; border-radius: 12px; background: linear-gradient(135deg, #5b8def, #7c5cff); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 18px; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color: #66738a; font-size: 12.5px; margin-top: 3px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 20px 0; }
  .card { background: #fff; border: 1px solid #e0e7f2; border-radius: 14px; padding: 14px 16px; box-shadow: 0 1px 3px rgba(20, 35, 60, .04); }
  .card .label { color: #66738a; font-size: 12px; }
  .card .value { font-size: 25px; font-weight: 750; margin-top: 2px; letter-spacing: -.4px; }
  .card .hint { color: #8a96aa; font-size: 11.5px; margin-top: 4px; }
  .card.good .value { color: #12833f; }
  .card.warn .value { color: #b45309; }
  h2 { font-size: 15px; margin: 26px 0 10px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e0e7f2; border-radius: 12px; overflow: hidden; }
  th, td { padding: 9px 12px; border-bottom: 1px solid #edf1f7; text-align: left; vertical-align: top; }
  th { background: #f7f9fd; color: #66738a; font-size: 11px; letter-spacing: .4px; text-transform: uppercase; }
  tr:last-child td { border-bottom: 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .up { color: #12833f; font-weight: 700; }
  .down { color: #b91c1c; font-weight: 700; }
  .ok { color: #12833f; font-weight: 650; }
  .fail { color: #b91c1c; }
  .file div:first-child { font-weight: 650; }
  .path { color: #8a96aa; font-size: 10.5px; word-break: break-all; }
  .notice { margin: 18px 0 0; padding: 12px 14px; border-radius: 12px; background: #eff5ff; border: 1px solid #d6e4ff; color: #31527f; font-size: 12.5px; }
  .notice.warn { background: #fff7e8; border-color: #f6dfb2; color: #8a5a00; }
  footer { margin-top: 26px; color: #8a96aa; font-size: 11.5px; line-height: 1.8; }
  @media print { body { background: #fff; } .card, table { box-shadow: none; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo">DL</div>
    <div>
      <h1>DiskLens 清理报告</h1>
      <div class="sub">生成时间：${formatTime(report.createdAt)} · 范围：${escapeHtml(report.scope)} · 方式：${modeText}</div>
    </div>
  </header>

  <div class="cards">
    <div class="card good">
      <div class="label">${report.purged ? '实际释放空间' : '已清理（移入回收站）'}</div>
      <div class="value">${formatBytes(report.freedBytes)}</div>
      <div class="hint">${
        report.purged
          ? `已彻底删除 ${formatCount(report.purgedCount ?? report.successCount)} 项`
          : `成功移到回收站 ${formatCount(report.successCount)} 项`
      }</div>
    </div>
    <div class="card">
      <div class="label">清理项数</div>
      <div class="value">${formatCount(report.itemCount)}</div>
      <div class="hint">失败 ${formatCount(report.failedCount)} 项</div>
    </div>
    <div class="card">
      <div class="label">用时</div>
      <div class="value">${(report.durationMs / 1000).toFixed(1)} 秒</div>
      <div class="hint">开始于 ${formatTime(report.createdAt - report.durationMs)}</div>
    </div>
    <div class="card ${allOk ? '' : 'warn'}">
      <div class="label">结果</div>
      <div class="value">${allOk ? '全部成功' : '部分失败'}</div>
      <div class="hint">${
        report.mode === 'elevated' ? '本次使用一次管理员授权' : '普通权限，无需授权'
      }</div>
    </div>
  </div>

  <div class="notice ${report.purged ? 'warn' : ''}">
    ${
      report.purged
        ? '本次清理项已经从系统回收站彻底删除，<b>无法恢复</b>；所以磁盘可用空间已经真正增加。'
        : '所有成功删除的项目都进了 <b>系统回收站</b>，可以在回收站里还原；清空回收站之后才会真正释放磁盘空间。'
    }
  </div>
  ${allOk ? '' : `<div class="notice warn">有 ${formatCount(report.failedCount)} 项没删掉，通常是文件正在被使用、权限不足或路径已经不存在。明细见下表。</div>`}

  <h2>清理前后磁盘空间</h2>
  <table>
    <thead><tr><th>磁盘</th><th class="num">清理前可用</th><th class="num">清理后可用</th><th class="num">变化</th><th class="num">当前可用率</th></tr></thead>
    <tbody>${diskRows || '<tr><td colspan="5">没有读取到磁盘信息</td></tr>'}</tbody>
  </table>

  <h2>按类别汇总</h2>
  <table>
    <thead><tr><th>类别</th><th class="num">项数</th><th class="num">大小</th><th class="num">成功</th><th class="num">占比</th></tr></thead>
    <tbody>${groupRows || '<tr><td colspan="5">没有清理项</td></tr>'}</tbody>
  </table>

  <h2>逐条明细${report.targets.length > detailLimit ? `（只列前 ${detailLimit} 项）` : ''}</h2>
  <table>
    <thead><tr><th>文件 / 文件夹</th><th class="num">大小</th><th>来源</th><th>结果</th></tr></thead>
    <tbody>${detailRows || '<tr><td colspan="4">没有清理项</td></tr>'}</tbody>
  </table>

  <footer>
    DiskLens 只做“移到回收站”，不提供永久删除。清理建议只覆盖临时文件、缓存、日志、空文件夹等；
    重要的个人文件请自行备份。报告文件位置：${escapeHtml(report.reportPath)}
  </footer>
</div>
</body>
</html>`
}

/** 把报告写成 HTML 文件，返回最终路径 */
export async function writeCleanupReport(report: CleanupReport): Promise<string> {
  await fs.mkdir(join(app.getPath('userData'), 'reports'), { recursive: true })
  await fs.writeFile(report.reportPath, renderCleanupReportHtml(report), 'utf8')
  return report.reportPath
}
