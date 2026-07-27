# jd-image-web-ui

服务器部署版图片生成 Web 应用。产品只有一种交付形态：管理员在服务器上运行 Web、Worker 和 PostgreSQL，用户通过内网 HTTP 浏览器登录使用。

## 生产部署

正式生产环境使用版本化发布包，不在生产服务器编译源码，也不依赖私有镜像仓库。
在构建机的干净 Git 工作区执行：

```sh
./scripts/build-release.sh --version v1.0.0
```

生成的 `dist/jd-image-web-ui-v1.0.0-linux-amd64.tar.gz` 包含应用、PostgreSQL、
Nginx 的 `linux/amd64` 镜像和部署脚本。将发布包传到 Ubuntu 20.04 及以上的
Intel/AMD 64 位生产服务器，解压后安装到指定宿主机目录：

```sh
sudo ./deploy.sh install \
  --root /data/jd-image-web-ui \
  --http-port 8787 \
  --admin-username admin
```

数据库、图片资源、配置和版本文件都会保存到 `/data/jd-image-web-ui`。生产服务器
无需访问 Docker Hub；Docker Engine 如需安装，使用
`https://download.docker.com/linux/ubuntu` 官方软件源。

完整步骤见 [生产环境部署与运维手册](deploy/server/PRODUCTION_DEPLOY.md)。

### 日常程序更新

Python 服务依赖没有变化时，只生成和传输程序更新包，不需要重新构建或导入任何
Docker 镜像：

```sh
./scripts/build-update-package.sh --version v1.0.1
```

将生成的 `dist/jd-image-web-ui-v1.0.1-program-update.tar.gz` 传到生产服务器，
解压后执行：

```sh
sudo ./deploy.sh update --root /data/jd-image-web-ui
```

该命令复用当前应用、PostgreSQL 和 Nginx 镜像，只重建 Web、Worker 容器以挂载
新程序包；数据库、图片、配置以及 PostgreSQL/Nginx 容器保持不变。若
`requirements-server.txt` 发生变化，脚本会在更新前拒绝执行，此时应使用完整
发布包和 `deploy.sh upgrade`。

## 源码环境快速启动

以下方式用于开发和 Compose 验收，不是正式生产交付方式：

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
- 模型目录支持 GPT Image、Gemini 官方 `generateContent` 与兼容协议绑定；提交任务时由服务器按当前用户可见的供应商和模型重新校验参数。
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

## 上游基线

当前服务器版本已合并 `kadevin/ilab-conjure` 的 `v0.7.0`（`1f0fd675`）。合并仅接入适用于服务器产品的模型目录、参数解析和供应商协议能力；桌面启动器、portable 打包、自动更新、本地 SQLite WebUI、Codex OAuth 与用户生图 CLI 不属于本产品交付范围。

## 本地开发验证

```sh
.venv/bin/python -m unittest discover -s tests -v
```

服务器部署约束见 [CONTEXT.md](CONTEXT.md)、[贡献说明](CONTRIBUTING.md) 和 [服务器运维说明](deploy/server/README.md)。
