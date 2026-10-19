// 诊断：文件夹页滚轮 + 界面里残留的 emoji 到底在哪
import { _electron as electron } from 'playwright-core'
import { join } from 'node:path'

const root = process.cwd()
const fixture = join(root, '.tmp-e2e-fixture')

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

  await page.fill('.path-field input', fixture)
  await page.press('.path-field input', 'Enter')
  await page.waitForSelector('.view-chart', { timeout: 120_000 })
  await page.waitForTimeout(1200)

  await page.click('.view-tabs .tab:has-text("文件夹")')
  await page.waitForTimeout(700)

  const geom = await page.evaluate(() => {
    const scroll = document.querySelector('.view-scroll')
    const rows = document.querySelectorAll('.dirs-grid')
    return {
      scrollHeight: scroll?.scrollHeight,
      clientHeight: scroll?.clientHeight,
      overflowY: scroll ? getComputedStyle(scroll).overflowY : null,
      rows: rows.length,
      canvasRect: (() => {
        const rect = document.querySelector('.canvas')?.getBoundingClientRect()
        return rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null
      })()
    }
  })
  console.log('文件夹页几何:', JSON.stringify(geom))

  const box = await page.locator('.canvas').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7)
  await page.mouse.wheel(0, 800)
  await page.waitForTimeout(600)
  const afterWheel = await page.evaluate(() => ({
    scrollTop: document.querySelector('.view-scroll')?.scrollTop ?? -1,
    activeEl: document.activeElement?.className ?? '',
    hovered: document.querySelectorAll(':hover').length
  }))
  console.log('滚轮后:', JSON.stringify(afterWheel))

  // 扫 emoji：逐个元素找
  const emojiHits = await page.evaluate(() => {
    const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u
    const hits = []
    for (const node of document.querySelectorAll('*')) {
      for (const child of node.childNodes) {
        if (child.nodeType === 3 && re.test(child.nodeValue ?? '')) {
          hits.push({
            tag: node.tagName,
            cls: node.className?.toString().slice(0, 40),
            text: (child.nodeValue ?? '').trim().slice(0, 60)
          })
        }
        if (child.nodeType === 8) {
          // 注释不算
        }
      }
    }
    return hits
  })
  console.log('emoji 命中:', JSON.stringify(emojiHits, null, 1).slice(0, 2000))

  await app.close()
}

main().catch((error) => {
  console.error('诊断失败:', error)
  process.exitCode = 1
})
