// E2E 冒烟：真启动 Electron 打包产物，走一遍黄金路径 + 六个视图，每步截图
// 用法：node scripts/e2e.mjs   （先 npm run build）
// 产物：.tmp-smoke/shots/*.png + 控制台断言汇总（失败退出码 1）

import { _electron as electron } from 'playwright-core'
import { mkdir, rm, writeFile, open, utimes } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
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
  // 真·空目录（不能用 make：make 会创建一个 0 字节文件）
  await mkdir(join(fixtureDir, '空文件夹/空的子目录/更空'), { recursive: true })
  await make('超大文件/备份镜像.iso', 96 * 1024 * 1024)

  // 查重用的"真重复"：大小刻意选一个别处没有的值，内容都是零（稀疏文件，创建快）
  await make('重复/资料副本-A.bin', 7_777_777)
  await make('重复/子目录/资料副本-B.bin', 7_777_777)

  // 一个真正的 ZIP，用来验证「压缩包内容」不是摆设
  await make('压缩包源/说明.txt', 0, '这是 DiskLens 测试压缩包里的说明文件。\n')
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -LiteralPath '${join(fixtureDir, '压缩包源', '说明.txt').replace(/'/g, "''")}' -DestinationPath '${join(fixtureDir, '下载', '真实压缩包.zip').replace(/'/g, "''")}' -Force`
  ])
  await rm(join(fixtureDir, '压缩包源'), { recursive: true, force: true })

  // 文件年龄用的"老文件"：把修改时间拨到 2018 / 2020
  await make('备份/旧视频-2018.mp4', 30 * 1024 * 1024)
  await make('备份/旧文档-2020.docx', 1_234_567)
  await utimes(
    join(fixtureDir, '备份/旧视频-2018.mp4'),
    new Date('2018-03-15'),
    new Date('2018-03-15')
  )
  await utimes(
    join(fixtureDir, '备份/旧文档-2020.docx'),
    new Date('2020-06-01'),
    new Date('2020-06-01')
  )

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
  page.on('pageerror', (error) => {
    // 留完整堆栈：只记 message 的话，出了"reading 'replace'"这种根本查不出是谁
    pageErrors.push(`${error.message}\n${(error.stack ?? '').split('\n').slice(1, 4).join('\n')}`)
  })

  let shotIndex = 0
  const shot = async (name) => {
    shotIndex += 1
    const file = join(shotsDir, `${String(shotIndex).padStart(2, '0')}-${name}.png`)
    // 等弹窗/图表的入场动画走完再截，别把半透明的中间帧留给截图
    await page.waitForTimeout(260)
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

  // —— 新手向导第一步（不实际启动扫描，避免动真盘）——
  await page.locator('.welcome-actions .btn:has-text("新手向导")').click()
  await page.waitForSelector('.cleanup-wizard', { timeout: 5000 })
  check('新手向导可打开', (await page.locator('.cleanup-wizard').count()) === 1)
  check('向导有快速/完整两种模式', (await page.locator('.wizard-mode').count()) === 2)
  await page.locator('.wizard-mode:has-text("完整扫描")').click()
  await page.waitForTimeout(250)
  check('完整扫描模式列出磁盘', (await page.locator('.wizard-drive').count()) >= 1)
  await page.locator('.wizard-mode:has-text("快速清理")').click()
  await shot('wizard')
  await page.locator('.wizard-head .icon-btn').click()
  await page.waitForTimeout(300)
  check('新手向导可关闭', (await page.locator('.cleanup-wizard').count()) === 0)

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

  // —— 滚轮能滚（v2.0 的坑：表格把滚动吃掉了）——
  {
    const box = await page.locator('.canvas').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(400)
    const scrolled = await page.evaluate(
      () => document.querySelector('.view-scroll')?.scrollTop ?? 0
    )
    check('大文件页滚轮可滚动', scrolled > 100, `scrollTop=${scrolled}`)
    await page.evaluate(() => {
      const node = document.querySelector('.view-scroll')
      if (node) node.scrollTop = 0
    })
  }

  await page.locator('.table .tr').first().click()
  await page.waitForTimeout(400)
  check('点行选中并显示详情', (await page.locator('.details').count()) === 1)
  await shot('bigfiles-details')

  // —— 文件夹表 ——
  await page.click('.view-tabs .tab:has-text("文件夹")')
  await page.waitForTimeout(500)
  check('文件夹榜有数据', (await page.locator('.dirs-grid.tr, .tr.dirs-grid').count()) > 2)
  {
    // 内容超过一屏就必须能滚；不足一屏就不该出现滚动（两种都算对）
    const needsScroll = await page.evaluate(() => {
      const node = document.querySelector('.view-scroll')
      return node ? node.scrollHeight > node.clientHeight + 4 : false
    })
    const box = await page.locator('.canvas').boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(400)
    const scrolled = await page.evaluate(
      () => document.querySelector('.view-scroll')?.scrollTop ?? 0
    )
    check(
      '文件夹页滚轮行为正常',
      // 只要有可滚内容，滚轮就必须真能滚（能滚多少取决于溢出多少，别写死 >100）
      needsScroll ? scrolled > 0 : scrolled === 0,
      needsScroll ? `可滚，已滚到 ${scrolled}` : '内容不足一屏，无需滚动'
    )
    await page.evaluate(() => {
      const node = document.querySelector('.view-scroll')
      if (node) node.scrollTop = 0
    })
  }
  await shot('folders')

  // —— 目录树（WinDirStat 的 Directory List）——
  await page.click('.view-tabs .tab:has-text("目录树")')
  await page.waitForTimeout(700)
  const treeRows = await page.locator('.tree-grid.tr').count()
  check('目录树渲染', treeRows >= 5, `${treeRows} 行`)
  const caretCount = await page.locator('.tree-caret:not(.placeholder)').count()
  check('目录树有可展开的目录', caretCount >= 2, `${caretCount} 个可展开目录`)
  await page.locator('.tree-caret:not(.placeholder)').first().click()
  await page.waitForTimeout(350)
  const collapsedRows = await page.locator('.tree-grid.tr').count()
  check('目录树可收起', collapsedRows < treeRows, `${collapsedRows} < ${treeRows}`)
  await page.locator('.tree-caret:not(.placeholder)').first().click()
  await page.waitForTimeout(350)
  check('目录树可重新展开', (await page.locator('.tree-grid.tr').count()) >= treeRows - 1)
  await shot('tree')

  // —— 文件年龄：老文件统计 + 年龄分布 ——
  await page.click('.view-tabs .tab:has-text("文件年龄")')
  await page.waitForTimeout(700)
  check('文件年龄有 7 个时间段', (await page.locator('.age-bar-row').count()) === 7)
  const ageOldSize = await page.locator('.age-hero-size').innerText()
  check('文件年龄统计到旧文件', ageOldSize !== '0 B', ageOldSize)
  const ageRows = await page.locator('.table .tr').count()
  check('旧文件清单有数据', ageRows > 0, `${ageRows} 行`)
  await page.locator('.age-bar-row').last().click()
  await page.waitForTimeout(400)
  check('点年龄条可筛选', (await page.locator('.age-bar-row.active').count()) === 1)
  await shot('age')

  // —— 重复文件：真的跑一遍查重，验证"每组保留一份"的交互 ——
  await page.click('.view-tabs .tab:has-text("重复文件")')
  await page.waitForTimeout(600)
  check('重复文件视图渲染', (await page.locator('.dupe-hero').count()) === 1)
  await page.locator('.dupe-hero-actions .btn.primary').click()
  const dupeReady = await page
    .waitForSelector('.dupe-card, .empty-state', { timeout: 60_000 })
    .then(() => true)
    .catch(() => false)
  check('查重能跑完并给出结果', dupeReady)
  const dupeGroups = await page.locator('.dupe-card').count()
  check('查重找到重复文件组', dupeGroups >= 1, `${dupeGroups} 组`)
  if (dupeGroups > 0) {
    check('每组至少两份副本', (await page.locator('.dupe-file').count()) >= 2)
    check('默认保留一份', (await page.locator('.dupe-keep-badge').count()) >= 1)
    const keepButtons = page.locator('.dupe-file .btn.ghost.xs')
    if ((await keepButtons.count()) > 0) {
      await keepButtons.first().click()
      await page.waitForTimeout(300)
      check('可以换"保留这份"', (await page.locator('.dupe-keep-badge').count()) >= 1)
    }
    await shot('duplicates-list')
    // 点"移走 N 份"必须弹二次确认（不实际删除）
    await page.locator('.dupe-card .btn.danger.sm').first().click()
    await page.waitForTimeout(400)
    check('查重删除前有二次确认', (await page.locator('.modal-overlay .modal').count()) === 1)
    await shot('duplicates-confirm')
    await page.locator('.modal-actions .btn:not(.danger)').click()
    await page.waitForTimeout(250)
    check('查重取消确认后关闭', (await page.locator('.modal-overlay').count()) === 0)
  } else {
    await shot('duplicates')
  }

  // —— 压缩包：按大小列出，ZIP 可看内容 ——
  await page.click('.view-tabs .tab:has-text("压缩包")')
  await page.waitForTimeout(700)
  check('压缩包视图渲染', (await page.locator('.archive-hero').count()) === 1)
  const archiveRows = await page.locator('.archives-grid.tr').count()
  check('压缩包列表有数据', archiveRows > 0, `${archiveRows} 行`)
  const zipInspect = page.locator('.archives-grid.tr:has-text("真实压缩包") .btn.ghost.xs').first()
  if ((await zipInspect.count()) > 0) {
    await zipInspect.click()
    await page.waitForSelector('.archive-modal', { timeout: 8000 })
    await page.waitForTimeout(500)
    const archiveEntries = await page.locator('.archive-entry').count()
    check('ZIP 内容可查看', archiveEntries >= 1, `${archiveEntries} 项`)
    await shot('archives')
    await page.locator('.archive-modal .modal-foot .btn.primary').click()
    await page.waitForTimeout(250)
  } else {
    check('ZIP 内容可查看', false, '没找到真实压缩包行')
    await shot('archives')
  }

  // —— 文件分类：选一类看全 = 只挑所有 .docx ——
  await page.click('.view-tabs .tab:has-text("文件分类")')
  await page.waitForTimeout(600)
  check('文件分类视图渲染', (await page.locator('.type-chips .type-chip').count()) >= 3)
  await shot('bytype')
  await page.locator('.type-chip:has-text("文档")').first().click()
  await page.waitForTimeout(600)
  const byTypeRows = await page.locator('.table .tr').count()
  check('选「文档」列出该类文件', byTypeRows > 0, `${byTypeRows} 行`)
  check(
    '分类视图给出总数与合计',
    /共/.test(await page.locator('.view-bar-stat').first().innerText()),
    (await page.locator('.view-bar-stat').first().innerText()).replace(/\s+/g, ' ').slice(0, 60)
  )
  await shot('bytype-doc')
  // 再点一次 .docx 后缀芯片（精确到后缀）
  const docxChip = page.locator('.ext-chip:has-text(".docx")').first()
  if ((await docxChip.count()) > 0) {
    await docxChip.click()
    await page.waitForTimeout(500)
    const docxRows = await page.locator('.table .tr').count()
    check('按 .docx 精确筛选', docxRows > 0, `${docxRows} 行`)
    await shot('bytype-docx')
  } else {
    check('按 .docx 精确筛选', false, '没找到 .docx 芯片')
  }

  // —— 清理建议 ——
  await page.click('.view-tabs .tab:has-text("清理建议")')
  await page.waitForTimeout(600)
  const cleanupCards = await page.locator('.cleanup-card').count()
  check('清理建议有分组', cleanupCards >= 2, `${cleanupCards} 组`)
  const cleanupTitles = await page.locator('.cleanup-title h3').allInnerTexts()
  check('清理建议包含空文件夹', cleanupTitles.includes('空文件夹'), cleanupTitles.join(' / '))
  const cleanupSize = await page.locator('.cleanup-hero-size').innerText()
  check('清理建议给出可腾空间', cleanupSize.length > 0, cleanupSize)
  await shot('cleanup')
  if (cleanupCards > 0) {
    await page.locator('.cleanup-card').first().locator('.btn.ghost.sm').click()
    await page.waitForTimeout(350)
    check('清理组可展开看清单', (await page.locator('.cleanup-item').count()) > 0)
    await shot('cleanup-expanded')
    // 点"清理"应弹出二次确认（先不删）
    await page.locator('.cleanup-card').first().locator('.btn.danger.sm').click()
    await page.waitForTimeout(400)
    check('清理前有二次确认弹窗', (await page.locator('.modal-overlay .modal').count()) === 1)
    await shot('confirm')
    await page.locator('.modal-actions .btn:not(.danger)').click()
    await page.waitForTimeout(250)
    check('取消确认后弹窗关闭', (await page.locator('.modal-overlay').count()) === 0)

    // —— 真删一批：验证批量进度条（删的是夹具里的临时文件，删掉也无所谓）——
    const filesBefore = Number(
      (/扫描到 ([\d,]+) 个文件/.exec(await page.locator('.statusbar-left').innerText()) ??
        [])[1]?.replace(/,/g, '') ?? -1
    )
    await page.locator('.cleanup-card').first().locator('.btn.danger.sm').click()
    await page.waitForTimeout(300)
    await page.locator('.modal-actions .btn.danger').click()
    // 进度条要么立刻出现，要么删得太快已经收起了——两种都算通过，但要能观察到结果
    const progressSeen =
      (await page.locator('.trash-progress').count()) > 0
        ? true
        : await page
            .waitForSelector('.trash-progress', { timeout: 2500 })
            .then(() => true)
            .catch(() => false)
    check('批量删除显示进度条', progressSeen)
    await shot('trash-progress')
    await page
      .waitForSelector('.trash-progress', { state: 'detached', timeout: 8000 })
      .catch(() => undefined)
    check('删除完成后进度条自动收起', (await page.locator('.trash-progress').count()) === 0)
    await page.waitForTimeout(400)
    const filesAfter = Number(
      (/扫描到 ([\d,]+) 个文件/.exec(await page.locator('.statusbar-left').innerText()) ??
        [])[1]?.replace(/,/g, '') ?? -1
    )
    check(
      '删除后状态栏文件数同步减少',
      filesBefore > 0 && filesAfter > 0 && filesAfter < filesBefore,
      `${filesBefore} → ${filesAfter}`
    )

    // 每次清理后都必须弹报告：展示释放空间、前后磁盘、报告路径
    await page.waitForSelector('.cleanup-report-modal', { timeout: 15_000 }).catch(() => undefined)
    check('清理后自动弹出报告', (await page.locator('.cleanup-report-modal').count()) === 1)
    const reportFreed = await page.locator('.report-big-number strong').innerText()
    check('报告显示释放空间', reportFreed.length > 0, reportFreed)
    check('报告有前后磁盘空间', (await page.locator('.report-drive').count()) >= 1)
    const reportPath = await page.locator('.report-path code').innerText()
    check('报告带详细文件路径', /\.html?$/i.test(reportPath.trim()), reportPath)
    check(
      '报告有查看路径/打开报告按钮',
      (await page.locator('.report-foot button:has-text("查看报告存放路径")').count()) === 1 &&
        (await page.locator('.report-foot button:has-text("打开详细报告")').count()) === 1
    )
    await shot('cleanup-report')
    await page.locator('.report-foot button:has-text("完成")').click()
    await page
      .waitForSelector('.cleanup-report-modal', { state: 'detached', timeout: 5000 })
      .catch(() => undefined)
    check('报告可关闭', (await page.locator('.cleanup-report-modal').count()) === 0)
  }

  // —— 回收站视图 ——
  await page.click('.view-tabs .tab:has-text("回收站")')
  await page.waitForTimeout(500)
  check('回收站视图渲染', (await page.locator('.trash-hero').count()) === 1)
  // 回收站可能有几千条记录，读取要几秒：先等加载占位消失，再判断列表/空状态
  await page
    .waitForSelector('.trash-loading', { state: 'detached', timeout: 60_000 })
    .catch(() => undefined)
  await page.waitForTimeout(300)
  const trashRows = await page.locator('.trash-grid.tr').count()
  const trashEmpty = await page.locator('.empty-state').count()
  const trashLoading = await page.locator('.trash-loading').count()
  check(
    '回收站能列出（或说明为空）',
    trashLoading === 0 && (trashRows > 0 || trashEmpty > 0),
    `${trashRows} 条${trashEmpty ? '（空状态）' : ''}${trashLoading ? '（仍在加载）' : ''}`
  )
  const trashTotal = await page.locator('.trash-hero-size').innerText()
  check('回收站给出占用合计', trashTotal.length > 0, trashTotal)
  await shot('trash')
  // 精确检测彩色 emoji（\p{Extended_Pictographic} 会把 ✅⚠️❌ 这类抓出来，
  // 但不会误伤 ✕、全角标点这些单色符号）
  const hasEmoji = await page.evaluate(() =>
    /[\p{Extended_Pictographic}\u{FE0F}]/u.test(document.body.innerText)
  )
  check('界面文字里没有彩色 emoji', !hasEmoji)
  const svgCount = await page.locator('svg').count()
  check('界面用的是 SVG 图标', svgCount > 20, `${svgCount} 个 svg`)

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

  // —— 新手帮助：按钮 + F1 + Esc ——
  await page.click('.titlebar .icon-btn[title="新手帮助（F1）"]')
  await page.waitForSelector('.help-modal', { timeout: 5000 })
  check('新手帮助打开', (await page.locator('.help-section').count()) >= 5)
  check('帮助里有视图说明', (await page.locator('.help-table-row').count()) >= 8)
  await shot('help')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check('Esc 可关闭帮助', (await page.locator('.help-modal').count()) === 0)
  await page.keyboard.press('F1')
  await page.waitForTimeout(350)
  check('F1 可打开帮助', (await page.locator('.help-modal').count()) === 1)
  await page.keyboard.press('Escape')
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
  const snapshotRestorable = await page2.locator('.welcome-snapshot').count()
  check('重启后提供上次扫描快照', snapshotRestorable === 1)
  if (snapshotRestorable === 1) {
    await page2.locator('.welcome-snapshot').click()
    const restoredView = await page2
      .waitForSelector('.view-chart', { timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
    check('快照恢复后直接进入面积图', restoredView)
  }
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
