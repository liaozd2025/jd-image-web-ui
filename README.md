# jd-image-web-ui

服务器部署版图片生成 Web 应用。产品只有一种交付形态：管理员在服务器上运行 Web、Worker 和 PostgreSQL，用户通过内网 HTTP 浏览器登录使用。

## 快速部署

```sh
cp .env.example .env  # 或手动设置下列变量
export JD_IMAGE_POSTGRES_PASSWORD='change-me'
export JD_IMAGE_MASTER_KEY="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
docker compose -f compose.server.yml up -d --build
docker compose -f compose.server.yml exec web \
  python -m codex_image.server.ops bootstrap-admin --username admin
```

浏览器访问 `http://服务器地址:8787`。数据库、Web 和 Worker 不直接向用户端暴露端口；只有 Nginx 反向代理提供内网 HTTP 入口。

外部 PostgreSQL 使用 `JD_IMAGE_DATABASE_URL` 和 `compose.server.external-postgres.yml` 覆盖文件，详见 [服务器运维说明](deploy/server/README.md)。

## 产品边界

- 用户只能使用浏览器用户名密码登录，账号由管理员创建。
- 个人供应商和部门供应商都从管理员维护的目录中选择；API Key 只在服务器端加密保存。
- 任务、图片、个人资产和共享资产存储在 PostgreSQL 与持久文件卷中，并按用户隔离。
- 运维 CLI 只负责初始化账号、备份恢复、维护锁、存储核对和到期回收，不执行用户生图，也不提供 OAuth。
- 共享资产首期无需审核；管理员查看用户内容使用专用只读入口并写入审计记录。

## 运维命令

```sh
python -m codex_image.server.ops bootstrap-admin --username admin
python -m codex_image.server.ops reconcile-storage --json
python -m codex_image.server.ops backup --output /srv/jd-image-backups/某次备份
python -m codex_image.server.ops restore --backup /srv/jd-image-backups/某次备份 --confirm
python -m codex_image.server.ops purge-trash --confirm
```

备份和恢复会自动启用维护锁；存储核对默认只报告，物理清理必须显式确认。

## 本地开发验证

```sh
.venv/bin/python -m unittest discover -s tests -v
```

服务器部署约束见 [CONTEXT.md](CONTEXT.md)、[贡献说明](CONTRIBUTING.md) 和 [服务器运维说明](deploy/server/README.md)。
