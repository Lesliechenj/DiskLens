# 参与 DiskLens 开发

感谢愿意帮忙！这个项目目标是**给电脑小白用的磁盘清理工具**，所有决策都围绕"小白能不能看懂、敢不敢点"。

## 提交前 checklist

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 无新增告警
- [ ] `npm run build` 通过
- [ ] 新增纯函数逻辑（数据转换/扫描/风险判定等）补冒烟测试：`npx esbuild <入口> --bundle --format=cjs --platform=node --outfile=.tmp-smoke/<名>.cjs` 后写 `.tmp-smoke/*.mjs` 断言（`.tmp-smoke/` 已 gitignore，仅本地验证用）
- [ ] UI 改动过一遍黄金路径：打开 → 选目录 → 扫描 → 出图 → 下钻/筛选/搜索 → 定位/回收站

## 提交规范

- 提交信息用中文，一个提交只做一件事
- 格式：`Wx：一句话概括` + 正文列改动点（参考 `git log`）

## 安全红线（不可协商）

1. **删除只能进回收站**（`shell.trashItem`），禁止添加任何直接删除 API
2. **删前必须二次确认**
3. 扫描无权限目录：跳过 + 记录，不弹窗不打断

## 架构约定

- 扫描逻辑只在扫描进程的 preload 里（页面脚本没有 Node 权限，别挪）
- 图表数据转换放纯函数层（`components/*Data.ts`），React 只负责渲染
- 主进程默认 `app.disableHardwareAcceleration()`，勿删（老旧机器保命）

## Issue

- 报 Bug：附系统版本、DiskLens 版本、复现步骤、截图
- 提需求：说清楚"小白场景"——谁、在什么情况下、想干什么
