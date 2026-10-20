// 压缩包内容查看：目前内置 ZIP 中央目录解析（不依赖外部 7-Zip）
// RAR/7Z 不强行解析：用系统默认程序打开更可靠，避免"解析一半"的误导。

import { promises as fs } from 'fs'
import type { ArchiveEntry, ArchiveInspection } from '../shared/types'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const MAX_ENTRIES = 3000

function decodeName(buffer: Buffer, utf8: boolean): string {
  try {
    if (utf8) return buffer.toString('utf8')
    // 老 ZIP 常用本地编码；Node 的 TextDecoder 在 Windows 上通常支持 gbk
    return new TextDecoder('gbk').decode(buffer)
  } catch {
    return buffer.toString('utf8')
  }
}

/**
 * 读取 ZIP 中央目录，列出条目。
 * 只读、不执行、不解压；损坏的 ZIP 返回 error，不抛给渲染层。
 */
export async function inspectZip(path: string): Promise<ArchiveInspection> {
  const empty: ArchiveInspection = {
    path,
    entries: [],
    totalSize: 0,
    unpackedBytes: 0,
    truncated: false
  }
  try {
    const stat = await fs.stat(path)
    if (!stat.isFile()) return { ...empty, error: '这不是一个文件' }
    const handle = await fs.open(path, 'r')
    try {
      const tailSize = Math.min(stat.size, 65_557)
      const tail = Buffer.alloc(tailSize)
      await handle.read(tail, 0, tailSize, stat.size - tailSize)
      let eocd = -1
      for (let i = tail.length - 22; i >= 0; i -= 1) {
        if (tail.readUInt32LE(i) === EOCD_SIGNATURE) {
          eocd = i
          break
        }
      }
      if (eocd < 0) return { ...empty, error: '不是有效的 ZIP 文件（找不到目录结尾）' }

      const entryCount = tail.readUInt16LE(eocd + 10)
      const centralSize = tail.readUInt32LE(eocd + 12)
      const centralOffset = tail.readUInt32LE(eocd + 16)
      if (entryCount === 0xffff || centralSize === 0xffffffff) {
        return { ...empty, error: '这个 ZIP 用了 ZIP64 格式，暂时不支持查看内容' }
      }
      if (centralOffset + centralSize > stat.size) {
        return { ...empty, error: 'ZIP 目录位置不合法，文件可能已损坏' }
      }

      const central = Buffer.alloc(centralSize)
      await handle.read(central, 0, centralSize, centralOffset)
      const entries: ArchiveEntry[] = []
      let offset = 0
      let unpackedBytes = 0
      while (
        offset + 46 <= central.length &&
        central.readUInt32LE(offset) === CENTRAL_SIGNATURE &&
        entries.length < MAX_ENTRIES
      ) {
        const flags = central.readUInt16LE(offset + 8)
        const compressedSize = central.readUInt32LE(offset + 20)
        const size = central.readUInt32LE(offset + 24)
        const nameLength = central.readUInt16LE(offset + 28)
        const extraLength = central.readUInt16LE(offset + 30)
        const commentLength = central.readUInt16LE(offset + 32)
        const nameBuffer = central.subarray(offset + 46, offset + 46 + nameLength)
        const name = decodeName(nameBuffer, (flags & 0x0800) !== 0).replace(/\\/g, '/')
        const isDir = name.endsWith('/')
        entries.push({ name, size, compressedSize, isDir })
        if (!isDir) unpackedBytes += size
        offset += 46 + nameLength + extraLength + commentLength
      }
      return {
        path,
        entries,
        totalSize: stat.size,
        unpackedBytes,
        truncated: entryCount > entries.length || entries.length >= MAX_ENTRIES
      }
    } finally {
      await handle.close()
    }
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
