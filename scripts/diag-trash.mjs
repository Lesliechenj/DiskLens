// 诊断回收站读取：直接问渲染层 window.api.listTrash()，看主进程返回了什么
import { _electron as electron } from 'playwright-core'

const root = process.cwd()

async function main() {
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: { ...process.env, DISKLENS_SOFTWARE_GPU: '1', DISKLENS_ALLOW_MULTI: '1' }
  })
  let page = await app.firstWindow({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  for (const candidate of app.windows()) {
    if (candidate.url().includes('renderer/index.html')) page = candidate
  }
  await page.waitForSelector('.app-shell', { timeout: 20_000 })

  const listing = await page.evaluate(() => window.api.listTrash())
  console.log('totalCount:', listing.totalCount)
  console.log('totalSize:', (listing.totalSize / 1024 / 1024).toFixed(1), 'MB')
  console.log('scannedDrives:', listing.scannedDrives)
  console.log('errors:', listing.errors)
  console.log('前 3 条:', JSON.stringify(listing.entries.slice(0, 3), null, 1))

  await app.close()
}

main().catch((error) => {
  console.error('诊断失败:', error)
  process.exitCode = 1
})
