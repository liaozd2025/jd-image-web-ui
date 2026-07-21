# Worktree 前端依赖复用

本项目的前端工具链使用根目录的 `package.json` 和 `package-lock.json`。新功能使用
Git worktree 时，不在每个 worktree 安装一份物理 `node_modules`，而是按依赖指纹复用
共享目录。

## 使用方式

在仓库根目录创建新功能 worktree：

```bash
git fetch origin main
git worktree add -b feat/<功能名> .worktrees/<功能名> origin/main
cd .worktrees/<功能名>
npm run worktree:deps
```

然后正常运行前端检查：

```bash
npm run check:webui
```

查看当前 worktree 的依赖状态：

```bash
npm run worktree:deps:status
```

## 工作规则

- 共享目录默认位于 macOS 的 `~/Library/Caches/ilab-gpt-conjure/deps/`。
- 依赖指纹包含 `package.json`、`package-lock.json`、Node 版本、npm 版本、平台和 CPU 架构。
- 相同指纹的多个 worktree 指向同一个物理 `node_modules`。
- 修改依赖并更新 lockfile 后会生成新的共享目录，不会污染旧 worktree。
- 主 checkout 的真实 `node_modules` 不会被工具替换。
- 如果 worktree 中已经存在真实 `node_modules`，工具会停止并提示人工处理，不会自动删除。
- 不要在已链接的 `node_modules` 上直接执行 `npm install`。依赖变更时先执行
  `npm install --package-lock-only` 更新 lockfile，再运行 `npm run worktree:deps`。

`.worktrees/` 已加入 `.gitignore`。worktree 的服务端口、数据库、临时目录和生成产物仍需
保持独立，依赖共享不等于运行时数据共享。
