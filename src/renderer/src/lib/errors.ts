// 系统错误 → 人话提示（纯函数，可单测）
// 回收站/定位失败时，Node/Electron 抛的是机器话，小白看了只会更慌。
// 注意：这里的错误码全部来自真机复现（.tmp-smoke/repro-trash.js），不是猜的——
// Electron 的 shell.trashItem 对"文件不存在"报的是 Failed to parse path，
// 对沙箱/占用/不支持回收站的位置报 Operation was aborted，ENOENT 那套是 Node fs 的。

/** 把 error 翻成小白能懂的话；action 如「移到回收站」「定位」 */
export function friendlyError(action: string, error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  if (/Failed to parse path/i.test(raw)) {
    return `${action}失败：文件路径读不出来（文件刚才被移走或删掉了？）`
  }
  if (/Operation was aborted/i.test(raw)) {
    return `${action}失败：系统取消了这次操作（文件可能正被占用，或所在位置不支持回收站，比如 U 盘/网络盘）`
  }
  if (/ENOENT|no such file/i.test(raw)) {
    return `${action}失败：文件已经不见了（可能刚被移走或删掉）`
  }
  if (/EACCES|EPERM|permission denied|Access is denied/i.test(raw)) {
    return `${action}失败：没有权限。试试右键 DiskLens →「以管理员身份运行」`
  }
  if (/EBUSY|is being used|in use/i.test(raw)) {
    return `${action}失败：文件正被别的程序占着，先关掉那个程序再试`
  }
  if (/ENOSPC/i.test(raw)) {
    return `${action}失败：磁盘空间不足`
  }
  if (/EROFS|read-only/i.test(raw)) {
    return `${action}失败：这个位置是只读的（光盘/只读 U 盘），删不了东西`
  }
  if (/路径是空的/.test(raw)) {
    return `${action}失败：没有选中任何文件，先点一个色块或列表里的条目`
  }
  return `${action}失败：${raw}`
}
