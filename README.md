# DiskLens

> 给电脑小白的磁盘空间可视化工具：**块越大 = 占地方越多**，一眼看懂，安全清理。

C 盘又飘红了？资源管理器翻半天找不到到底谁占了地方？DiskLens 扫一遍，用一张图告诉你答案。

[![CI](https://github.com/your-username/DiskLens/actions/workflows/build.yml/badge.svg)](../../actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/your-username/DiskLens)](../../releases)

<!-- 截图/GIF 占位：发布前补黄金路径演示（打开 → 选盘 → 出图 → 定位/回收站） -->

## ✨ 功能清单（V1.0）

| 功能 | 说明 |
| --- | --- |
| 🔍 选盘/选目录扫描 | 实时进度条，无权限目录自动跳过不打扰 |
| 🟦 Treemap 主视图 | 块面积 = 占用空间；悬浮看名称/大小/路径/修改时间；点击逐层下钻 |
| 🥧 饼图概览 | 哪类文件最占地方（视频？游戏？缓存？）一眼看清；点切片只看该类 |
| 🔎 筛选与搜索 | 按文件类型筛选 + 文件名模糊搜索，前端过滤不重扫 |
| 🗑️ 安全文件操作 | 点击定位到资源管理器；移到回收站；删除前二次确认 |
| 🛡️ 排除清单 | 系统目录/AppData 等默认勾选跳过，防误扫 |
| 🏷️ 风险分级标签 | ✅安全可删 / ⚠️谨慎 / ❌别动，直接标在文件上 |
| 📖 后缀名人话词典 | .pdf = PDF文档、.mp4 = 视频文件……说人话，不甩术语 |

## 🛡️ 安全承诺

- **只能进回收站**：删除操作只走系统回收站（可恢复），绝不直接抹除——主进程不提供任何直接删除 API
- **删前二次确认**：每次删除都有明确确认弹窗，并提示"仅供参考，重要文件自行备份"
- **不碰系统文件**：排除清单默认勾选，扫描时自动跳过系统关键目录；风险标签直接标在文件上

> ⚠️ DiskLens 仅供参考，清理前请自行确认重要文件已备份。

## 🚀 快速开始

### 下载使用

前往 [Releases](../../releases) 页面下载最新版安装包（Windows / macOS / Linux），双击安装即可。

### 开发运行

需要环境：Node.js 20+ 和 npm。

```bash
# 1. 克隆仓库
git clone https://github.com/<你的用户名>/DiskLens.git
cd DiskLens

# 2. 安装依赖
npm install

# 3. 启动开发模式（热更新）
npm run dev

# 4. 打包构建
npm run build          # 类型检查 + 编译
npm run build:win      # 打出 Windows 安装包
npm run build:mac      # 打出 macOS 安装包
npm run build:linux    # 打出 Linux 安装包
```

**中国大陆网络提示**：如果 `npm install` 下载 Electron 二进制失败，先设镜像再装：

```bash
npm config set registry https://registry.npmmirror.com
npm config set electron_mirror https://npmmirror.com/mirrors/electron/
npm install
```

## 🧱 技术栈

| 层 | 选型 | 干什么 |
| --- | --- | --- |
| 框架 | Electron | 跨平台桌面壳（窗口、回收站、定位资源管理器） |
| 界面 | React + TypeScript | 渲染层，组件化 UI |
| 图表 | ECharts（按需引入） | Treemap / 饼图，一份数据两种渲染 |
| 脚手架 | electron-vite | 与 Vite 一致的心智模型，开发热更新 |
| 状态管理 | Zustand | 轻量，渲染层状态 |

进程架构（餐厅比喻）：

```
┌─ 主进程 Main ──────── 大堂经理：窗口/回收站/定位资源管理器
├─ 扫描进程 Scanner ─── 后厨：独立窗口跑文件遍历，进度经 IPC 实时上报
└─ 渲染层 Renderer ───── 菜单屏：React + ECharts 双视图切换
```

**统一数据契约**：扫描产物 = 一棵 JSON 树，四个图表只是同一份数据的不同渲染——切换视图不重复扫盘，筛选 = 前端过滤这棵树。

## 🗺️ 路线图

- **V1.0**（当前）：扫描 + Treemap + 饼图 + 筛选搜索 + 安全清理 + 排除清单 + 风险分级 + 后缀词典
- **V1.x**：旭日图/柱状图、时间与大小区间筛选、目录级回收站、管理员重启引导
- **V2**：增量扫描/缓存、扫描结果持久化
- **V3+**：视反馈而定（重复文件检测暂不考虑，Czkawka 已经很专业）

## 🤝 贡献

欢迎 Issue 和 PR！请先读 [CONTRIBUTING.md](CONTRIBUTING.md)。提交信息用中文，一个 PR 只做一件事。

## 🙏 参考与致谢

站在巨人肩膀上，向这些项目致敬：

- [WinDirStat](https://windirstat.net/) —— Windows 磁盘分析鼻祖（本项目的功能参照）
- [Space Radar](https://github.com/zz85/space-radar) —— 验证了 Electron + D3 跨平台路线
- [SquirrelDisk](https://github.com/adileo/squirreldisk) —— Tauri 旭日图实现参考
- [Czkawka](https://github.com/qarmin/czkawka) —— 重复文件检测的护城河

## 📄 License

[MIT](LICENSE) © 2026 DiskLens Contributors

---

## English (short)

**DiskLens** is a free, open-source disk space visualizer for everyday Windows users: the bigger the block, the more space it takes. Scan a drive, see what's eating your disk in one picture, and clean up safely — deletions only ever go to the Recycle Bin, with confirmation. Built with Electron + React + ECharts. MIT licensed.
