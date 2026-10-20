// 批量移到回收站：一次授权 + 分批 SHFileOperation
//
// 为什么不用 shell.trashItem 逐个删：
//   清理临时文件时动辄上万项，一个文件一次系统调用/一次 UAC 会慢到无法接受。
// 做法：
//   把路径写进 job.json，PowerShell 帮手用 SHFileOperation（FOF_ALLOWUNDO）按批移动，
//   每批 300 个；普通权限直接跑，系统目录才用 Start-Process -Verb RunAs 授权一次。
// 安全：
//   - 只允许移到回收站（FOF_ALLOWUNDO），没有永久删除标志
//   - 一次授权只覆盖这一批，不常驻、不监听管道
//   - 移动后逐项 Test-Path 确认结果，失败原因写回报告

import { app, shell } from 'electron'
import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { CleanupOutcome } from '../shared/types'

const TIMEOUT_MS = 20 * 60 * 1000
const CHUNK_SIZE = 300

const CLEAN_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$jobPath = $args[0]
$outPath = $args[1]
$progressPath = $args[2]

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct SHFILEOPSTRUCT {
  public IntPtr hwnd;
  public uint wFunc;
  public string pFrom;
  public string pTo;
  public ushort fFlags;
  public bool fAnyOperationsAborted;
  public IntPtr hNameMappings;
  public string lpszProgressTitle;
}
public static class DiskLensShell {
  [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
  public static extern int SHFileOperation(ref SHFILEOPSTRUCT op);
  public static int RecycleMany(string[] paths) {
    if (paths == null || paths.Length == 0) return 0;
    SHFILEOPSTRUCT op = new SHFILEOPSTRUCT();
    op.wFunc = 3; // FO_DELETE
    // 每个路径以 \0 结尾；末尾再加一个 \0，加上 marshaler 的结尾就是双 null
    op.pFrom = string.Join("\0", paths) + "\0";
    // ALLOWUNDO(回收站) | NOCONFIRMATION | SILENT | NOERRORUI | NOCONFIRMMKDIR
    op.fFlags = 0x0040 | 0x0010 | 0x0004 | 0x0400 | 0x0200;
    return SHFileOperation(ref op);
  }
}
"@

function Write-Utf8([string]$path, [string]$text) {
  [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
}

$job = Get-Content -LiteralPath $jobPath -Raw -Encoding UTF8 | ConvertFrom-Json
$paths = @($job.paths)
$total = $paths.Count
$results = New-Object System.Collections.ArrayList
$chunkSize = ${CHUNK_SIZE}

for ($i = 0; $i -lt $total; $i += $chunkSize) {
  $end = [Math]::Min($i + $chunkSize - 1, $total - 1)
  $slice = @($paths[$i..$end])
  $rc = 0
  try {
    $rc = [DiskLensShell]::RecycleMany([string[]]$slice)
  } catch {
    $rc = -1
  }
  Start-Sleep -Milliseconds 30
  foreach ($p in $slice) {
    $current = [string]$p
    $ok = -not (Test-Path -LiteralPath $current)
    $message = ''
    if (-not $ok) {
      if ($rc -ne 0) { $message = "系统返回代码 $rc（可能被占用、只读或需要更高权限）" }
      else { $message = '文件仍存在（可能被占用或权限不足）' }
    }
    [void]$results.Add([pscustomobject]@{ path = $current; ok = $ok; message = $message })
  }
  $progress = [pscustomobject]@{ done = ($end + 1); total = $total; current = [string]$slice[-1] }
  Write-Utf8 $progressPath ($progress | ConvertTo-Json -Compress)
}

Write-Utf8 $outPath ($results | ConvertTo-Json -Depth 4 -Compress)
`

export interface TrashBatchResult {
  outcomes: CleanupOutcome[]
  cancelled: boolean
  message?: string
}

function runPowerShell(
  args: string[],
  timeout = TIMEOUT_MS
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      args,
      { timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        resolve({ code: error ? 1 : 0, stderr: String(stderr ?? '') })
      }
    )
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fallbackTrash(
  paths: string[],
  onProgress?: (done: number, total: number, current: string) => void
): Promise<CleanupOutcome[]> {
  const outcomes: CleanupOutcome[] = []
  for (let index = 0; index < paths.length; index += 1) {
    try {
      await shell.trashItem(paths[index])
      outcomes.push({ path: paths[index], ok: true })
    } catch (error) {
      outcomes.push({
        path: paths[index],
        ok: false,
        message: error instanceof Error ? error.message : String(error)
      })
    }
    onProgress?.(index + 1, paths.length, paths[index])
  }
  return outcomes
}

/**
 * 把一批路径移到回收站。
 * @param elevated 是否请求一次管理员授权（Windows）
 */
export async function trashBatch(
  paths: string[],
  elevated: boolean,
  onProgress?: (done: number, total: number, current: string) => void
): Promise<TrashBatchResult> {
  const cleanPaths = [...new Set(paths.filter((path) => typeof path === 'string' && path.trim()))]
  if (cleanPaths.length === 0) return { outcomes: [], cancelled: false }

  if (process.platform !== 'win32') {
    return { outcomes: await fallbackTrash(cleanPaths, onProgress), cancelled: false }
  }

  const dir = await fs.mkdtemp(join(app.getPath('temp'), 'disklens-clean-'))
  const jobPath = join(dir, 'job.json')
  const outPath = join(dir, 'out.json')
  const progressPath = join(dir, 'progress.json')
  const scriptPath = join(dir, 'clean.ps1')
  const id = randomUUID()

  try {
    await fs.writeFile(jobPath, JSON.stringify({ id, paths: cleanPaths }), 'utf8')
    await fs.writeFile(scriptPath, `\uFEFF${CLEAN_SCRIPT}`, 'utf8')

    let lastProgress = ''
    let polling = true
    const poll = (async () => {
      while (polling) {
        await sleep(200)
        try {
          const text = await fs.readFile(progressPath, 'utf8')
          if (text && text !== lastProgress) {
            lastProgress = text
            const data = JSON.parse(text) as { done?: number; total?: number; current?: string }
            onProgress?.(
              Number(data.done ?? 0),
              Number(data.total ?? cleanPaths.length),
              String(data.current ?? '')
            )
          }
        } catch {
          // 帮手还没开始写进度
        }
      }
    })()

    let runResult: { code: number; stderr: string }
    if (elevated) {
      const quote = (value: string): string => value.replace(/'/g, "''")
      const command =
        `$ErrorActionPreference='Stop'; ` +
        `Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -WindowStyle Hidden ` +
        `-ArgumentList @('-NoProfile','-STA','-ExecutionPolicy','Bypass','-File','${quote(scriptPath)}',` +
        `'${quote(jobPath)}','${quote(outPath)}','${quote(progressPath)}')`
      runResult = await runPowerShell(['-NoProfile', '-NonInteractive', '-Command', command])
    } else {
      runResult = await runPowerShell([
        '-NoProfile',
        '-STA',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        jobPath,
        outPath,
        progressPath
      ])
    }

    polling = false
    await poll

    let raw: string | null = null
    try {
      raw = await fs.readFile(outPath, 'utf8')
    } catch {
      raw = null
    }
    if (!raw) {
      const cancelled = elevated && /cancel|canceled|cancelled|取消/i.test(runResult.stderr)
      return {
        outcomes: cleanPaths.map((path) => ({
          path,
          ok: false,
          message: cancelled ? '已取消管理员授权' : '清理帮手没有返回结果'
        })),
        cancelled,
        message: runResult.stderr.trim() || undefined
      }
    }

    const parsed = JSON.parse(raw) as Array<{ path?: string; ok?: boolean; message?: string }>
    const list = Array.isArray(parsed) ? parsed : [parsed]
    const outcomes: CleanupOutcome[] = cleanPaths.map((path) => {
      const item = list.find((entry) => entry.path === path)
      return {
        path,
        ok: item?.ok === true,
        message: item?.message || undefined
      }
    })
    onProgress?.(cleanPaths.length, cleanPaths.length, '')
    return { outcomes, cancelled: false }
  } catch (error) {
    return {
      outcomes: cleanPaths.map((path) => ({
        path,
        ok: false,
        message: '清理启动失败'
      })),
      cancelled: false,
      message: error instanceof Error ? error.message : String(error)
    }
  } finally {
    await sleep(120)
    await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** 兼容旧名字：一次管理员授权清理 */
export async function elevatedTrash(
  paths: string[],
  onProgress?: (done: number, total: number, current: string) => void
): Promise<TrashBatchResult> {
  return trashBatch(paths, true, onProgress)
}
