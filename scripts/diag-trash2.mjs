// 诊断：打开回收站视图时的渲染层异常，抓完整堆栈
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

  page.on('pageerror', (error) => {
    console.log('=== pageerror ===')
    console.log(error.message)
    console.log(error.stack?.slice(0, 1500))
  })
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('[console.error]', message.text().slice(0, 400))
  })

  // 先扫一个目录，让界面进入"有结果"状态
  await page.fill('.path-field input', root)
  await page.press('.path-field input', 'Enter')
  await page.waitForSelector('.view-chart', { timeout: 180_000 })
  await page.waitForTimeout(1200)

  await page.click('.view-tabs .tab:has-text("回收站")')
  await page.waitForTimeout(6000)

  const rows = await page.locator('.trash-grid.tr').count()
  console.log('回收站行数:', rows)
  await page.screenshot({
    path: 'C:/Users/31411/WorkBuddy/DiskLens/.tmp-smoke/shots/trash-debug.png'
  })
  await app.close()
}

main().catch((error) => {
  console.error('诊断失败:', error)
  process.exitCode = 1
})
