# 服务器部署运维说明

产品只以服务器部署形态提供服务：用户通过反向代理的内网 HTTP 地址登录浏览器，Web、Worker 和 PostgreSQL 不直接向用户端开放端口。

## 首次启动

1. 安装 Docker Compose v2，在部署目录创建 `.env`。
2. 复制 `.env.example` 为 `.env`，设置 `JD_IMAGE_POSTGRES_PASSWORD`，并用 `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='` 生成 `JD_IMAGE_MASTER_KEY`；可选设置 `JD_IMAGE_HTTP_PORT`。如果 PostgreSQL 密码含 `@`、`:`、`/`、`#` 等 URL 保留字符，请改为设置 RFC 3986 URL 编码后的 `JD_IMAGE_DATABASE_URL`。
3. 执行 `docker compose -f compose.server.yml up -d --build`。
4. 在 Web 容器中执行 `docker compose -f compose.server.yml exec web python -m codex_image.server.ops bootstrap-admin --username admin`，临时密码只显示一次，首次登录必须修改。
5. 访问 `http://服务器地址:${JD_IMAGE_HTTP_PORT:-8787}`，确认 `/health/ready` 为 200。

## 外部 PostgreSQL

将 `JD_IMAGE_DATABASE_URL` 设置为外部 PostgreSQL 连接串，并叠加外部覆盖文件：

```sh
docker compose -f compose.server.yml -f compose.server.external-postgres.yml up -d --build
```

外部数据库不需要把 5432 暴露给浏览器；Web 和 Worker 只通过连接串访问它。

## 日常运维

```sh
docker compose -f compose.server.yml ps
docker compose -f compose.server.yml logs --tail=200 web worker proxy
docker compose -f compose.server.yml stop
docker compose -f compose.server.yml start
docker compose -f compose.server.yml exec web python -m codex_image.server.ops reconcile-storage --json
```

备份和恢复会自动启用维护锁，期间拒绝新的写入：

```sh
docker compose -f compose.server.yml exec web python -m codex_image.server.ops backup --output /srv/jd-image-backups/$(date +%Y%m%d-%H%M%S)
docker compose -f compose.server.yml exec web python -m codex_image.server.ops restore --backup /srv/jd-image-backups/某次备份 --confirm
```

回收站内容默认保留 30 天。核对命令只报告问题；物理清理必须显式确认：

```sh
docker compose -f compose.server.yml exec web python -m codex_image.server.ops purge-trash --confirm
```

如果维护进程异常退出且遗失锁令牌，先确认没有备份、恢复或清理进程仍在运行，再执行 `maintenance-lock force-release --confirm` 解锁。

## 升级与回退

先完成备份，再拉取新版本并执行 `up -d --build`。升级后检查 `/health/ready`、登录、历史任务和资产下载。若升级验证失败，停止服务、恢复数据库与文件卷备份，再回到上一版本镜像；不要删除 PostgreSQL 数据卷或服务器数据卷。

常见故障定位：

- Web 健康但 Ready 为 503：先查看数据库和 Worker 两个组件的状态。
- Worker unavailable：检查 Worker 日志、`JD_IMAGE_DATA_ROOT` 挂载和数据库连接。
- file_volume unavailable：检查持久卷是否可写及容器用户权限。
- PostgreSQL unavailable：检查外部连接串、网络和数据库健康状态。
