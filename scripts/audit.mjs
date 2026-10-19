// 布局与内容审计：把每个视图的可见文案、关键尺寸、图表像素统计都导出来
// 用途：没有眼睛也能确认"UI 真的长对了"——文字截断/元素重叠/图表空白都能被量出来
// 用法：node scripts/audit.mjs（先 npm run build）

import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const outDir = join(root, '.tmp-smoke', 'audit')
const fixture = join(root, '.tmp-e2e-fixture')

const report = []
function log(...args) {
  const line = args.join(' ')
  report.push(line)
  console.log(line)
}

/** 页面内审计：尺寸、重叠、截断、图表像素 */
async function auditPage(page, label) {
  const data = await page.evaluate(() => {
    const rectOf = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height)
      }
    }

    const canvasStats = (() => {
      const canvas = document.querySelector('.view-chart-body canvas')
      if (!canvas) return null
      const ctx = canvas.getContext('2d')
      const { width, height } = canvas
      const step = 61
      const pixels = ctx.getImageData(0, 0, width, height).data
      const colors = new Map()
      let opaque = 0
      let sampled = 0
      for (let i = 0; i < pixels.length; i += 4 * step) {
        sampled += 1
        const alpha = pixels[i + 3]
        if (alpha > 12) {
          opaque += 1
          const key = `${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`
          colors.set(key, (colors.get(key) ?? 0) + 1)
        }
      }
      const top = [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      return { width, height, sampled, opaque, uniqueColors: colors.size, top }
    })()

    // 文字截断：这些选择器本来就允许省略号，只统计"没有省略号却溢出"的情况
    const clipped = []
    for (const node of document.querySelectorAll(
      '.view-bar-stat, .view-bar-hint, .statusbar-left, .statusbar-right, .card-head h3, .cleanup-title h3, .cleanup-title p, .scanbar .progress-stats, .welcome-head h1, .welcome-sub'
    )) {
      if (node.scrollWidth > node.clientWidth + 2 && node.clientWidth > 0) {
        clipped.push(
          `${node.className.split(' ')[0]}: ${node.scrollWidth}>${node.clientWidth} 「${node.textContent.slice(0, 40)}」`
        )
      }
    }

    // 重叠检测：同一行里的关键块不能互相压住
    // （详情面板在窄窗口是"抽屉"，本来就该浮在画布上方，不算重叠）
    const detailsIsOverlay = (() => {
      const node = document.querySelector('.details')
      return node ? getComputedStyle(node).position === 'absolute' : false
    })()
    const overlaps = []
    const pairs = [
      ['.titlebar-left', '.titlebar-right'],
      ['.scanbar-row .path-field', '.scanbar-row .btn'],
      ...(detailsIsOverlay ? [] : [['.canvas', '.details']]),
      ['.view-tabs', '.filter-bar']
    ]
    for (const [a, b] of pairs) {
      const ra = rectOf(a)
      const rb = rectOf(b)
      if (!ra || !rb) continue
      const overlapX = ra.x < rb.x + rb.w && rb.x < ra.x + ra.w
      const overlapY = ra.y < rb.y + rb.h && rb.y < ra.y + ra.h
      if (overlapX && overlapY) overlaps.push(`${a} ∩ ${b}`)
    }

    // 字体过小
    const tinyText = []
    for (const node of document.querySelectorAll('button, span, p, h1, h2, h3, h4, b, dd, dt')) {
      const size = parseFloat(getComputedStyle(node).fontSize)
      if (node.textContent.trim() && size < 10)
        tinyText.push(`${node.className || node.tagName}:${size}`)
    }

    const textOf = (selector) => {
      const node = document.querySelector(selector)
      return node ? node.innerText.replace(/\s+/g, ' ').trim() : ''
    }

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      rects: {
        shell: rectOf('.app-shell'),
        titlebar: rectOf('.titlebar'),
        sidebar: rectOf('.sidebar'),
        scanbar: rectOf('.scanbar'),
        toolbar: rectOf('.toolbar'),
        canvas: rectOf('.canvas'),
        viewBody: rectOf('.view-chart-body'),
        details: rectOf('.details'),
        statusbar: rectOf('.statusbar'),
        lastTitleButton: (() => {
          const buttons = document.querySelectorAll('.titlebar-right .icon-btn')
          const last = buttons[buttons.length - 1]
          if (!last) return null
          const r = last.getBoundingClientRect()
          return { right: Math.round(r.right) }
        })()
      },
      canvasStats,
      clipped,
      overlaps,
      tinyText: tinyText.slice(0, 8),
      text: {
        titlebar: textOf('.titlebar'),
        breadcrumb: textOf('.breadcrumb'),
        tabs: textOf('.view-tabs'),
        filters: textOf('.filter-bar'),
        viewBar: textOf('.view-bar'),
        sidebarTop: textOf('.side-section'),
        statusbar: textOf('.statusbar'),
        details: textOf('.details')?.slice(0, 200)
      }
    }
  })

  log(`\n## ${label} 视口 ${data.viewport.w}x${data.viewport.h}`)
  log('尺寸:', JSON.stringify(data.rects))
  if (data.canvasStats) {
    const s = data.canvasStats
    log(
      `图表画布 ${s.width}x${s.height} · 采样 ${s.sampled} 点 · 有内容 ${((s.opaque / s.sampled) * 100).toFixed(1)}% · 颜色数 ${s.uniqueColors}`
    )
    log('主色:', JSON.stringify(s.top))
  } else {
    log('图表画布: 无（该视图不是图表视图）')
  }
  if (data.clipped.length) log('⚠️ 文字溢出:', data.clipped.join(' | '))
  if (data.overlaps.length) log('⚠️ 元素重叠:', data.overlaps.join(' | '))
  if (data.tinyText.length) log('⚠️ 过小字号:', data.tinyText.join(' | '))
  log('文案:', JSON.stringify(data.text))
  return data
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const app = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      DISKLENS_SOFTWARE_GPU: '1',
      DISKLENS_ALLOW_MULTI: '1',
      NODE_ENV: 'production'
    }
  })

  let page = await app.firstWindow({ timeout: 30_000 })
  await page.waitForTimeout(1800)
  for (const candidate of app.windows()) {
    if (candidate.url().includes('renderer/index.html')) page = candidate
  }
  await page.waitForSelector('.app-shell', { timeout: 20_000 })
  await page.waitForTimeout(1200)

  await auditPage(page, '欢迎页')
  await page.screenshot({ path: join(outDir, 'a1-welcome.png') })

  // 扫测试目录
  await page.fill('.path-field input', fixture)
  await page.press('.path-field input', 'Enter')
  await page.waitForSelector('.view-chart', { timeout: 120_000 })
  await page.waitForTimeout(1200)
  await auditPage(page, '面积图（根层）')
  await page.screenshot({ path: join(outDir, 'a2-treemap-root.png') })

  // 下钻一层：点最大的块（用大文件表进入目录更稳）
  await page.click('.view-tabs .tab:has-text("文件夹")')
  await page.waitForTimeout(500)
  await page.locator('.tr.dirs-grid').first().click()
  await page.waitForTimeout(300)
  await page
    .locator('.details-actions .btn:has-text("进入")')
    .click()
    .catch(() => undefined)
  await page.waitForTimeout(800)
  await page.click('.view-tabs .tab:has-text("面积图")')
  await page.waitForTimeout(900)
  await auditPage(page, '面积图（下钻一层）')
  await page.screenshot({ path: join(outDir, 'a3-treemap-drill.png') })

  for (const [tab, label] of [
    ['旭日图', '旭日图'],
    ['类型构成', '类型构成'],
    ['大文件', '大文件'],
    ['文件夹', '文件夹'],
    ['清理建议', '清理建议']
  ]) {
    await page.click(`.view-tabs .tab:has-text("${tab}")`)
    await page.waitForTimeout(900)
    await auditPage(page, label)
    await page.screenshot({ path: join(outDir, `a4-${encodeURIComponent(tab)}.png`) })
  }

  // 选中一行 → 详情面板
  await page.click('.view-tabs .tab:has-text("大文件")')
  await page.waitForTimeout(400)
  await page.locator('.table .tr').first().click()
  await page.waitForTimeout(600)
  await auditPage(page, '大文件 + 详情面板')
  await page.screenshot({ path: join(outDir, 'a5-details.png') })

  // 窄窗口：最小尺寸下还得好用
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) => item.isVisible())
    win?.setSize(1000, 640)
  })
  await page.waitForTimeout(900)
  await auditPage(page, '最小窗口 1000x640')
  await page.screenshot({ path: join(outDir, 'a6-narrow.png') })

  // 大窗口
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) => item.isVisible())
    win?.setSize(1680, 1000)
  })
  await page.waitForTimeout(900)
  await auditPage(page, '大窗口 1680x1000')
  await page.screenshot({ path: join(outDir, 'a7-wide.png') })

  // 恢复默认尺寸
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) => item.isVisible())
    win?.setSize(1280, 820)
  })

  await app.close()
  console.log('\n审计完成，截图在 .tmp-smoke/audit/')
}

main().catch((error) => {
  console.error('audit crashed:', error)
  process.exitCode = 1
})
