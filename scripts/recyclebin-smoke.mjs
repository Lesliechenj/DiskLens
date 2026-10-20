// 回收站 $I 解析的单元冒烟：构造 v1/v2 两种二进制格式喂进去，再用真实回收站兜一遍
// 用法：node scripts/recyclebin-smoke.mjs
// （脚本会自己把 src/main/recycleBin.ts 用 tsc 编到 .tmp-smoke/rb 再跑，不用手动准备）

import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const outDir = join(root, '.tmp-smoke', 'rb')

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })
execFileSync(
  process.execPath,
  [
    join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(root, 'src', 'main', 'recycleBin.ts'),
    '--outDir',
    outDir,
    '--module',
    'commonjs',
    '--target',
    'es2022',
    '--esModuleInterop',
    '--skipLibCheck'
  ],
  { stdio: 'inherit' }
)

const { parseTrashInfo, listTrash } = await import(
  pathToFileURL(join(outDir, 'main', 'recycleBin.ts.js')).href
).catch(() => import(pathToFileURL(join(outDir, 'main', 'recycleBin.js')).href))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/** FILETIME：从 1601-01-01 起的 100ns 数 */
function toFiletime(ms) {
  return (BigInt(ms) + 11644473600000n) * 10000n
}

function buildV2(originalPath, size, deletedMs) {
  const head = Buffer.alloc(28)
  head.writeBigUInt64LE(2n, 0)
  head.writeBigUInt64LE(BigInt(size), 8)
  head.writeBigUInt64LE(toFiletime(deletedMs), 16)
  head.writeUInt32LE(originalPath.length, 24)
  return Buffer.concat([head, Buffer.from(originalPath, 'utf16le')])
}

function buildV1(originalPath, size, deletedMs) {
  const pathBuf = Buffer.alloc(520)
  Buffer.from(originalPath, 'utf16le').copy(pathBuf, 0)
  const head = Buffer.alloc(24)
  head.writeBigUInt64LE(1n, 0)
  head.writeBigUInt64LE(BigInt(size), 8)
  head.writeBigUInt64LE(toFiletime(deletedMs), 16)
  return Buffer.concat([head, pathBuf])
}

const deletedAt = Date.UTC(2026, 0, 2, 3, 4, 5)

const v2 = parseTrashInfo(buildV2('C:\\Users\\me\\季度报告.docx', 12345, deletedAt))
check(
  'v2 版本解析出原始路径',
  v2?.originalPath === 'C:\\Users\\me\\季度报告.docx',
  v2?.originalPath
)
check('v2 版本解析出大小', v2?.size === 12345, String(v2?.size))
check(
  'v2 版本解析出删除时间',
  Math.abs((v2?.deletedAt ?? 0) - deletedAt) < 1000,
  new Date(v2?.deletedAt ?? 0).toISOString()
)

const v1 = parseTrashInfo(buildV1('D:\\video\\movie.mp4', 987654321, deletedAt))
check('v1 版本解析出原始路径', v1?.originalPath === 'D:\\video\\movie.mp4', v1?.originalPath)
check('v1 版本解析出大小', v1?.size === 987654321, String(v1?.size))

check('未知版本返回 null', parseTrashInfo(Buffer.from([9, 0, 0, 0, 0, 0, 0, 0])) === null)
check('太短的 buffer 返回 null', parseTrashInfo(Buffer.alloc(10)) === null)
check('空路径返回 null', parseTrashInfo(buildV2('', 1, deletedAt)) === null)

// 真实回收站：本机有什么就列什么（不做硬断言，只验证结构）
const listing = await listTrash(['C:\\', 'D:\\', 'E:\\'])
console.log(
  `\n本机回收站：${listing.totalCount} 条记录，合计 ${(listing.totalSize / 1024 / 1024).toFixed(1)} MB` +
    (listing.errors.length ? `，${listing.errors.length} 个目录读不到` : '')
)
for (const entry of listing.entries.slice(0, 3)) {
  console.log(
    `  · ${entry.name} ← ${entry.originalPath}（${new Date(entry.deletedAt).toISOString()}）`
  )
}
check(
  '真实回收站列表结构完整',
  Array.isArray(listing.entries) &&
    typeof listing.totalSize === 'number' &&
    listing.entries.every((entry) => typeof entry.originalPath === 'string'),
  `${listing.entries.length} 条`
)

const failed = results.filter((item) => !item.ok)
console.log(`\n=== ${results.length - failed.length}/${results.length} 项通过 ===`)
if (failed.length > 0) process.exitCode = 1
