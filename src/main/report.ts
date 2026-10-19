// 导出报告：CSV 生成（纯函数，可单测）+ 保存对话框
// 小白视角：导出的表要能被 Excel 双击打开、中文不乱码、公式不执行

import { dialog, type BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { dirname } from 'path'
import type { ExportPayload } from '../shared/types'

/** 单元格转 CSV：转义引号/逗号/换行，并挡住公式注入（= + - @ 开头） */
export function csvCell(value: string): string {
  let text = value ?? ''
  // Excel 会把 =SUM(1) / +1 / -1 / @x 当公式执行——前面加个单引号变纯文本
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

/** 生成 CSV 文本（带 UTF-8 BOM，Excel 打开中文不乱码） */
export function buildCsv(payload: ExportPayload): string {
  const lines = [payload.header, ...payload.rows].map((row) => row.map(csvCell).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

/** 弹保存对话框并写文件；返回最终路径（取消返回 null） */
export async function exportReport(
  window: BrowserWindow | null,
  payload: ExportPayload
): Promise<string | null> {
  const safeName = payload.fileName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'DiskLens-报告'
  const options = {
    title: '导出扫描报告',
    defaultPath: `${safeName}.csv`,
    filters: [{ name: 'CSV 表格', extensions: ['csv'] }]
  }
  const result = window
    ? await dialog.showSaveDialog(window, options)
    : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null

  const csv = buildCsv(payload)
  await fs.mkdir(dirname(result.filePath), { recursive: true })
  await fs.writeFile(result.filePath, csv, 'utf8')
  return result.filePath
}
