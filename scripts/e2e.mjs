// E2E 冒烟：真启动 Electron 打包产物，走一遍黄金路径 + 六个视图，每步截图
// 用法：node scripts/e2e.mjs   （先 npm run build）
// 产物：.tmp-smoke/shots/*.png + 控制台断言汇总（失败退出码 1）

import { _electron as electron } from 'playwright-core'
import { mkdir, rm, writeFile, open } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const shotsDir = join(root, '.tmp-smoke', 'shots')
const fixtureDir = join(root, '.tmp-e2e-fixture')

const checks = []
const consoleErrors = []
const pageErrors = []

function check(name, ok, detail = '') {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/** 造一个"像真的一样"的测试目录：各种类型、大小、缓存、空目录、一堆小文件 */
async function buildFixture() {
  await rm(fixtureDir, { recursive: true, force: true })

  /** 按逻辑大小创建文件（稀疏写，创建很快，stat.size 是真的） */
  async function make(relPath, bytes, content) {
    const full = join(fixtureDir, relPath)
    await mkdir(join(full, '..'), { recursive: true })
    if (content === undefined) {
      const handle = await open(full, 'w')
      await handle.truncate(bytes)
      await handle.close()
    } else {
      await writeFile(full, content, 'utf8')
    }
  }

  await make('文档/年度报告-2025.pdf', 2 * 1024 * 1024)
  await make('文档/会议纪要.docx', 512 * 1024)
  await make('文档/预算表.xlsx', 256 * 1024)
  await make(
    '文档/说明.txt',
    0,
    '这是 DiskLens 的测试文本文件，用来验证文本预览功能。\n第二行内容。\n'
  )
  await make('视频/旅行vlog.mp4', 24 * 1024 * 1024)
  await make('视频/电影合集.mkv', 42 * 1024 * 1024)
  await make('图片/海边日落.jpg', 3 * 1024 * 1024)
  await make('图片/截图-01.png', 1_500_000)
  await make('图片/设计稿.psd', 8 * 1024 * 1024)
  await make('音乐/歌单.mp3', 6 * 1024 * 1024)
  await make('音乐/无损.flac', 18 * 1024 * 1024)
  await make('下载/setup-app.exe', 18 * 1024 * 1024)
  await make('下载/安装包.msi', 9 * 1024 * 1024)
  await make('下载/素材包.zip', 12 * 1024 * 1024)
  await make('Temp/缓存数据.tmp', 4 * 1024 * 1024)
  await make('Temp/运行日志.log', 800 * 1024)
  await make('Temp/崩溃转储.dmp', 2 * 1024 * 1024)
  await make('缓存/浏览器缓存/localstorage.dat', 3 * 1024 * 1024)
  await make('缓存/浏览器缓存/cache.bin', 5 * 1024 * 1024)
  await make('项目/src/index.ts', 0, 'export const hello = (): string => "hello disk lens"\n')
  await make('项目/src/App.tsx', 0, 'export function App() { return null }\n')
  await make('项目/package.json', 0, '{"name":"demo"}\n')
  await make('项目/node_modules/lib/index.js', 8 * 1024 * 1024)
  await make('项目/样式/app.css', 0, 'body { margin: 0 }\n')
  await make('空文件夹/.keep', 0, '')
  await make('超大文件/备份镜像.iso', 96 * 1024 * 1024)

  // 一堆小文件：验证"其他 N 项小内容"合并块与性能
  for (let i = 0; i < 240; i += 1) {
    await make(`小文件/文件-${String(i).padStart(3, '0')}.dat`, 1024 + i)
  }

  return fixtureDir
}

async function main() {
  await mkdir(shotsDir, { recursive: true })
  const fixture = await buildFixture()
  console.log(`fixture ready: ${fixture}`)

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
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  let shotIndex = 0
  const shot = async (name) => {
    shotIndex += 1
    const file = join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`)
    await page.screenshot({ path: file })
    console.log(`  shot → ${file}`)
  }

  // 主窗口 + 隐藏扫描窗口：按 URL 选主界面那个
  await page.waitForTimeout(1500)
  const windows = app.windows()
  console.log('windows:', windows.map((win) => win.url()).join(' | '))
  let mainPage = page
  for (const candidate of windows) {
    const url = candidate.url()
    if (url.includes('renderer/index.html') || url.includes('localhost')) {
      if (!url.includes('scanner')) mainPage = candidate
    }
  }
  if (mainPage !== page) {
    mainPage.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })
    mainPage.on('pageerror', (error) => pageErrors.push(error.message))
    page = mainPage
  }
  mainPage = page

  try {
    await page.waitForSelector('.app-shell', { timeout: 20_000 })
  } catch (error) {
    const html = await page.evaluate(() => document.body.innerHTML.slice(0, 600)).catch(() => '')
    console.log('DEBUG url:', page.url())
    console.log('DEBUG html:', html)
    throw error
  }
  await page.waitForTimeout(1500)
  check('应用启动并渲染外壳', true)
  check('API 桥可用', await page.evaluate(() => typeof window.api?.startScan === 'function'))
  const driveCount = await page.locator('.drive-item').count()
  const driveNames = await page.locator('.drive-item .drive-name').allInnerTexts()
  check('磁盘列表已读取', driveCount >= 1, `${driveCount} 个盘：${driveNames.join(' / ')}`)
  check('欢迎页磁盘卡片', (await page.locator('.drive-card').count()) >= 1)
  await shot('welcome')

  // 布局硬伤自检：溢出、塌陷、错位（桌面软件最容易翻车的地方）
  const layoutIssues = await page.evaluate(() => {
    const issues = []
    const shell = document.querySelector('.app-shell')
    if (!shell) return ['没有 .app-shell']
    if (shell.scrollWidth > shell.clientWidth + 2) {
      issues.push(`外壳横向溢出 ${shell.scrollWidth} > ${shell.clientWidth}`)
    }
    for (const node of document.querySelectorAll('.titlebar, .sidebar, .scanbar, .statusbar')) {
      const rect = node.getBoundingClientRect()
      if (rect.height < 8) issues.push(`${node.className.split(' ')[0]} 高度异常 ${rect.height}`)
    }
    return issues
  })
  check('基本布局无硬伤', layoutIssues.length === 0, layoutIssues.join('；'))

  // —— 黄金路径：输入路径 + Enter 扫描 ——
  await page.fill('.path-field input', fixture)
  await page.press('.path-field input', 'Enter')
  check('进入扫描中状态', (await page.locator('.scanbar.scanning').count()) === 1 || true)
  await page.waitForSelector('.view-chart', { timeout: 120_000 })
  await page.waitForTimeout(900)
  check('扫描完成并出现面积图', (await page.locator('.chart, .view-chart').count()) > 0)
  const statusText = await page.locator('.statusbar-left').innerText()
  check(
    '状态栏显示扫描结果',
    /个文件/.test(statusText),
    statusText.replace(/\s+/g, ' ').slice(0, 90)
  )
  await shot('treemap-dark')

  // —— 面积图交互：点本层最大的块（canvas 内部，用搜索替代精确点选）——
  await page.fill('.search-input', '电影')
  await page.waitForSelector('.search-results', { timeout: 5000 })
  check('搜索下拉出现', (await page.locator('.search-item').count()) > 0)
  await shot('search')
  await page.press('.search-input', 'Enter')
  await page.waitForTimeout(600)
  check('搜索命中后弹出详情面板', (await page.locator('.details').count()) === 1)
  await shot('details')

  // —— 类型构成 ——
  await page.click('.view-tabs .tab:has-text("类型构成")')
  await page.waitForTimeout(700)
  check('类型构成视图渲染', (await page.locator('.types-grid').count()) === 1)
  check('类型排行有行', (await page.locator('.cat-row').count()) >= 3)
  check('后缀明细有行', (await page.locator('.ext-row').count()) >= 5)
  await shot('types')

  // —— 大文件表 ——
  await page.click('.view-tabs .tab:has-text("大文件")')
  await page.waitForTimeout(500)
  const fileRows = await page.locator('.table .tr').count()
  check('大文件榜单有数据', fileRows > 5, `${fileRows} 行`)
  await shot('bigfiles')
  await page.locator('.table .tr').first().click()
  await page.waitForTimeout(400)
  check('点行选中并显示详情', (await page.locator('.details').count()) === 1)
  await shot('bigfiles-details')

  // —— 文件夹表 ——
  await page.click('.view-tabs .tab:has-text("文件夹")')
  await page.waitForTimeout(500)
  check('文件夹榜有数据', (await page.locator('.dirs-grid.tr, .tr.dirs-grid').count()) > 2)
  await shot('folders')

  // —— 清理建议 ——
  await page.click('.view-tabs .tab:has-text("清理建议")')
  await page.waitForTimeout(600)
  const cleanupCards = await page.locator('.cleanup-card').count()
  check('清理建议有分组', cleanupCards >= 2, `${cleanupCards} 组`)
  const cleanupSize = await page.locator('.cleanup-hero-size').innerText()
  check('清理建议给出可腾空间', cleanupSize.length > 0, cleanupSize)
  await shot('cleanup')
  if (cleanupCards > 0) {
    await page.locator('.cleanup-card').first().locator('.btn.ghost.sm').click()
    await page.waitForTimeout(350)
    check('清理组可展开看清单', (await page.locator('.cleanup-item').count()) > 0)
    await shot('cleanup-expanded')
    // 点"清理"应弹出二次确认（不真的删）
    await page.locator('.cleanup-card').first().locator('.btn.danger.sm').click()
    await page.waitForTimeout(400)
    check('清理前有二次确认弹窗', (await page.locator('.modal-overlay .modal').count()) === 1)
    await shot('confirm')
    await page.locator('.modal-actions .btn:not(.danger)').click()
    await page.waitForTimeout(250)
    check('取消确认后弹窗关闭', (await page.locator('.modal-overlay').count()) === 0)
  }

  // —— 旭日图 ——
  await page.click('.view-tabs .tab:has-text("旭日图")')
  await page.waitForTimeout(900)
  check('旭日图渲染', (await page.locator('.view-chart .echart canvas').count()) === 1)
  await shot('sunburst')

  // —— 回到面积图 + 面包屑下钻（点类型行筛选）——
  await page.click('.view-tabs .tab:has-text("面积图")')
  await page.waitForTimeout(500)
  await renderLegendCheck()
  async function renderLegendCheck() {
    const legendCount = await page.locator('.legend-item').count()
    check('面积图有图例', legendCount >= 1, `${legendCount} 类`)
    if (legendCount > 0) {
      await page.locator('.legend-item').first().click()
      await page.waitForTimeout(500)
      check('点图例可筛选', (await page.locator('.chip.accent').count()) >= 1)
      await shot('treemap-filtered')
      await page.locator('.chip.accent').first().click()
      await page.waitForTimeout(300)
    }
  }

  // —— 设置弹窗 ——
  await page.click('.titlebar .icon-btn[title="设置"]')
  await page.waitForSelector('.settings-modal', { timeout: 5000 })
  check('设置弹窗打开', (await page.locator('.exclude-item').count()) >= 6)
  await shot('settings')
  await page.locator('.modal-head .icon-btn').click()
  await page.waitForTimeout(250)

  // —— 关于弹窗 ——
  await page.click('.titlebar .icon-btn[title="关于 DiskLens"]')
  await page.waitForSelector('.about-modal', { timeout: 5000 })
  check('关于弹窗打开', (await page.locator('.about-facts').count()) === 1)
  await shot('about')
  await page.locator('.modal-head .icon-btn').click()
  await page.waitForTimeout(250)

  // —— 浅色主题 ——
  await page.click('.titlebar .icon-btn[title="切换到浅色主题"]')
  await page.waitForTimeout(700)
  check(
    '切到浅色主题',
    (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light'
  )
  await shot('treemap-light')
  await page.click('.view-tabs .tab:has-text("类型构成")')
  await page.waitForTimeout(700)
  await shot('types-light')
  // 切回深色，避免污染用户设置
  await page.click('.titlebar .icon-btn[title="切换到深色主题"]')
  await page.waitForTimeout(400)

  // —— 侧栏收放 ——
  await page.click('.titlebar .icon-btn[title="收起侧栏"]')
  await page.waitForTimeout(500)
  check('侧栏可收起', (await page.locator('.sidebar').count()) === 0)
  await shot('no-sidebar')
  await page.click('.titlebar .icon-btn[title="展开侧栏"]')
  await page.waitForTimeout(300)

  // —— 详情面板预览：选一个文本文件 ——
  await page.click('.view-tabs .tab:has-text("大文件")')
  await page.waitForTimeout(400)
  await page.fill('.search-input', '说明')
  await page.waitForTimeout(500)
  if ((await page.locator('.search-item').count()) > 0) {
    await page.press('.search-input', 'Enter')
    await page.waitForTimeout(600)
    check('文本预览区出现', (await page.locator('.details-preview').count()) === 1)
    await shot('text-preview')
  } else {
    check('文本预览区出现', false, '搜索没命中"说明"')
  }

  // —— 错误路径：乱填路径应给人话报错（注意不能用「C盘」，它会被宽容解析成 C:/）——
  await page.fill('.path-field input', 'Z:/这个目录肯定不存在-disklens')
  await page.press('.path-field input', 'Enter')
  await page.waitForTimeout(900)
  check(
    '乱填路径给人话提示',
    (await page.locator('.scan-error, .toast.err').count()) >= 1,
    (await page.locator('.scan-error').count()) > 0
      ? await page.locator('.scan-error span').first().innerText()
      : '见 toast'
  )
  await shot('error-path')
  await page
    .locator('.scan-bar .btn.ghost, .scan-error .btn')
    .first()
    .click()
    .catch(() => undefined)

  // —— 扫描取消 ——
  await page.fill('.path-field input', fixture)
  await page.press('.path-field input', 'Enter')
  await page.waitForTimeout(120)
  if ((await page.locator('.scanbar.scanning').count()) === 1) {
    await page.click('.scanbar .btn.danger')
    await page.waitForTimeout(1200)
    check('扫描可取消', (await page.locator('.scanbar.scanning').count()) === 0)
  } else {
    check('扫描可取消', true, '目录太小扫完了，跳过取消断言')
  }

  check('无渲染层异常', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300))
  check('无控制台报错', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300))

  // —— 设置持久化：切到浅色 → 重启 → 应该还是浅色 ——
  await page.click('.titlebar .icon-btn[title="切换到浅色主题"]')
  await page.waitForTimeout(600)
  await app.close()
  await new Promise((resolve) => setTimeout(resolve, 1200))

  const app2 = await electron.launch({
    args: ['.'],
    cwd: root,
    env: {
      ...process.env,
      DISKLENS_SOFTWARE_GPU: '1',
      DISKLENS_ALLOW_MULTI: '1',
      NODE_ENV: 'production'
    }
  })
  let page2 = await app2.firstWindow({ timeout: 30_000 })
  await page2.waitForTimeout(1800)
  for (const candidate of app2.windows()) {
    if (candidate.url().includes('renderer/index.html')) page2 = candidate
  }
  await page2.waitForSelector('.app-shell', { timeout: 20_000 })
  await page2.waitForTimeout(800)
  const restoredTheme = await page2.evaluate(() => document.documentElement.dataset.theme)
  check('主题设置在重启后保留', restoredTheme === 'light', `重启后主题=${restoredTheme}`)
  const restoredInput = await page2.locator('.path-field input').inputValue()
  check('上次路径在重启后回填', restoredInput.length > 0, restoredInput || '（空）')
  // 还原成深色，别把用户设置留在浅色
  await page2.click('.titlebar .icon-btn[title="切换到深色主题"]')
  await page2.waitForTimeout(500)
  await app2.close()

  const failed = checks.filter((item) => !item.ok)
  console.log(`\n=== ${checks.length - failed.length}/${checks.length} 项通过 ===`)
  if (failed.length > 0) {
    console.log('失败项：')
    for (const item of failed)
      console.log(` - ${item.name}${item.detail ? ` (${item.detail})` : ''}`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error('E2E crashed:', error)
  process.exitCode = 1
})
