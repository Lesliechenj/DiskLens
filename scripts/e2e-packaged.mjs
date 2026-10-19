// 打包产物冒烟：直接启动 dist/win-unpacked/disklens.exe（app.isPackaged = true）
// 验证打包后的路径/资源/扫描进程/标题栏都正常，并截图
// 用法：node scripts/e2e-packaged.mjs（先 npm run build:win 或 build:unpack）

import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const exe = join(root, 'dist', 'win-unpacked', 'disklens.exe')
const outDir = join(root, '.tmp-smoke', 'packaged')
const fixture = join(root, '.tmp-e2e-fixture')

/** 挑出主窗口（隐藏的扫描窗口也可能先被 Playwright 看到） */
async function pickMainWindow(app) {
  for (let i = 0; i < 40; i += 1) {
    for (const candidate of app.windows()) {
      const url = candidate.url()
      if (url.includes('renderer/index.html') && !url.includes('scanner')) return candidate
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const app = await electron.launch({
    executablePath: exe,
    args: [],
    env: {
      ...process.env,
      DISKLENS_SOFTWARE_GPU: '1',
      DISKLENS_ALLOW_MULTI: '1'
    }
  })

  const page = await pickMainWindow(app)
  if (!page) {
    console.error('没等到主窗口')
    await app.close()
    process.exitCode = 1
    return
  }

  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.waitForSelector('.app-shell', { timeout: 30_000 })
  await page.waitForTimeout(1500)

  const info = await app.evaluate(async ({ app: electronApp }) => ({
    isPackaged: electronApp.isPackaged,
    version: electronApp.getVersion(),
    userData: electronApp.getPath('userData')
  }))
  console.log('打包信息:', JSON.stringify(info))

  const driveCount = await page.locator('.drive-item').count()
  console.log(`窗口标题: ${await page.title()} · 磁盘数: ${driveCount}`)
  await page.screenshot({ path: join(outDir, 'packaged-welcome.png') })

  const apiOk = await page.evaluate(() => typeof window.api?.startScan === 'function')
  console.log('API 桥:', apiOk ? 'OK' : 'FAIL')

  // 打包后最容易翻车的地方：扫描进程的隐藏窗口（多入口 HTML 在 asar 里的路径）
  await page.fill('.path-field input', fixture)
  await page.press('.path-field input', 'Enter')
  await page.waitForSelector('.view-chart', { timeout: 120_000 })
  await page.waitForTimeout(1200)
  const status = await page.locator('.statusbar-left').innerText()
  const scanned = /个文件/.test(status)
  console.log(
    '扫描（打包模式）:',
    scanned ? 'OK' : 'FAIL',
    '|',
    status.replace(/\s+/g, ' ').slice(0, 90)
  )
  await page.screenshot({ path: join(outDir, 'packaged-treemap.png') })

  await page.click('.view-tabs .tab:has-text("清理建议")')
  await page.waitForTimeout(900)
  const cleanup = await page.locator('.cleanup-card').count()
  console.log('清理建议（打包模式）:', cleanup >= 1 ? `OK（${cleanup} 组）` : 'FAIL')
  await page.screenshot({ path: join(outDir, 'packaged-cleanup.png') })

  await app.close()

  const ok = info.isPackaged && apiOk && scanned && cleanup >= 1 && errors.length === 0
  console.log('渲染层错误:', errors.length, '| 结论:', ok ? '打包产物冒烟通过' : '有问题')
  if (!ok) process.exitCode = 1
}

main().catch((error) => {
  console.error('打包冒烟失败:', error)
  process.exitCode = 1
})
