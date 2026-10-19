// 诊断：大文件/文件夹页面的滚轮为什么滚不动
// 用法：node scripts/diag-scroll.mjs（先 npm run build）

import { _electron as electron } from 'playwright-core'
import { join } from 'node:path'

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

  // 扫项目自己的 node_modules：文件量大、层级深，正好当真实样本
  const target = join(root, 'node_modules')
  await page.fill('.path-field input', target)
  await page.press('.path-field input', 'Enter')
  await page.waitForSelector('.view-chart', { timeout: 180_000 })
  await page.waitForTimeout(1500)

  for (const tab of ['大文件', '文件夹']) {
    await page.click(`.view-tabs .tab:has-text("${tab}")`)
    await page.waitForTimeout(800)

    const before = await page.evaluate(() => {
      const scroll = document.querySelector('.view-scroll')
      const canvas = document.querySelector('.canvas')
      const table = document.querySelector('.table')
      return {
        viewScroll: scroll
          ? {
              scrollTop: scroll.scrollTop,
              scrollHeight: scroll.scrollHeight,
              clientHeight: scroll.clientHeight,
              overflowY: getComputedStyle(scroll).overflowY
            }
          : null,
        canvas: canvas
          ? { h: canvas.clientHeight, overflow: getComputedStyle(canvas).overflow }
          : null,
        table: table
          ? {
              scrollTop: table.scrollTop,
              scrollHeight: table.scrollHeight,
              clientHeight: table.clientHeight,
              overflowX: getComputedStyle(table).overflowX,
              overflowY: getComputedStyle(table).overflowY
            }
          : null,
        rows: document.querySelectorAll('.table .tr').length
      }
    })

    const box = await page.locator('.canvas').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(500)

    const after = await page.evaluate(() => {
      const scroll = document.querySelector('.view-scroll')
      const table = document.querySelector('.table')
      return {
        viewScrollTop: scroll?.scrollTop ?? -1,
        tableScrollTop: table?.scrollTop ?? -1,
        windowScroll: window.scrollY
      }
    })

    console.log(`\n=== ${tab} ===`)
    console.log('挂载前:', JSON.stringify(before))
    console.log('滚轮后:', JSON.stringify(after))
    console.log(
      `结论: 外层容器可滚=${before.viewScroll && before.viewScroll.scrollHeight > before.viewScroll.clientHeight}，滚轮生效=${after.viewScrollTop > 0 || after.tableScrollTop > 0}`
    )
  }

  await app.close()
}

main().catch((error) => {
  console.error('诊断失败:', error)
  process.exitCode = 1
})
