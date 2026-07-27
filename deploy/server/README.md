# 服务器部署文档

`jd-image-web-ui` 只以服务器形态提供服务：管理员在服务器上运行 Web、Worker、
PostgreSQL 和 Nginx，用户通过浏览器登录使用。

## 文档入口

- 正式生产环境：使用版本化离线发布包，数据库和图片资源保存到指定宿主机目录。
  请按 [生产环境部署与运维手册](PRODUCTION_DEPLOY.md) 操作。
- 开发和 Compose 验收：可以从源码构建并使用 Docker 命名卷，按本文后续章节操作。
- 产品边界和开发验证：见仓库根目录的 [README](../../README.md) 和
  [CONTEXT](../../CONTEXT.md)。

生产环境不要执行源码 Compose 启动命令。生产发布包已经包含应用、PostgreSQL 和
Nginx 的 `linux/amd64` 镜像，不需要访问 Docker Hub 或私有镜像仓库。

## 生产部署速查

在构建机的干净 Git 工作区生成发布包：

```sh
./scripts/build-release.sh --version v1.0.0
```

将 `dist/jd-image-web-ui-v1.0.0-linux-amd64.tar.gz` 传到生产服务器并解压，然后
安装到指定目录：

```sh
sudo ./deploy.sh install \
  --root /data/jd-image-web-ui \
  --http-port 8787 \
  --admin-username admin
```

升级时必须复用相同的根目录：

```sh
sudo ./deploy.sh upgrade --root /data/jd-image-web-ui
```

日常仅更新程序代码时，在干净的 Git 工作区生成小型程序更新包：

```sh
./scripts/build-update-package.sh --version v1.0.1
```

传到生产服务器并解压后执行：

```sh
sudo ./deploy.sh update --root /data/jd-image-web-ui
```

`update` 不构建、加载或拉取镜像，只重建 Web 和 Worker 容器来挂载新程序包；
PostgreSQL、Nginx、数据库和资源目录不参与更新。若服务依赖有变化，脚本会拒绝
程序更新，应改用完整发布包的 `upgrade`。

完整的环境检查、传输校验、目录说明、验收、日常运维和受限网络排障均以
[生产环境部署与运维手册](PRODUCTION_DEPLOY.md) 为准。

## 源码直接启动

以下方式只用于开发和 Compose 验收。它会从源码构建应用并使用 Docker 命名卷，
不是正式生产交付方式。

1. 安装 Docker Compose v2，在仓库根目录创建 `.env`。
2. 复制 `.env.example` 为 `.env`，设置 `JD_IMAGE_POSTGRES_PASSWORD`。
3. 用 `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='` 生成
   `JD_IMAGE_MASTER_KEY`。
4. 可选设置 `JD_IMAGE_HTTP_PORT`；默认端口为 `8787`。
5. 启动服务并创建初始管理员。

```sh
docker compose -f compose.server.yml up -d --build
docker compose -f compose.server.yml exec web \
  python -m codex_image.server.ops bootstrap-admin --username admin
```

临时密码只显示一次，首次登录必须修改。访问
`http://<服务器地址>:${JD_IMAGE_HTTP_PORT:-8787}`，并确认 `/health/ready`
返回成功。

如果 PostgreSQL 密码含 `@`、`:`、`/`、`#` 等 URL 保留字符，请设置经过
RFC 3986 URL 编码的 `JD_IMAGE_DATABASE_URL`。

### 使用外部 PostgreSQL

将 `JD_IMAGE_DATABASE_URL` 设置为外部 PostgreSQL 连接串，并叠加覆盖文件：

```sh
docker compose \
  -f compose.server.yml \
  -f compose.server.external-postgres.yml \
  up -d --build
```

外部数据库不需要把 `5432` 暴露给浏览器；Web 和 Worker 只通过连接串访问它。

### 源码环境运维

```sh
docker compose -f compose.server.yml ps
docker compose -f compose.server.yml logs --tail=200 web worker proxy
docker compose -f compose.server.yml stop
docker compose -f compose.server.yml start
docker compose -f compose.server.yml exec -T web \
  python -m codex_image.server.ops reconcile-storage --json
```

如果 Ready 为 `503`，依次检查 PostgreSQL、Worker 和宿主机数据目录的状态及日志。
生产发布包的命令和目录结构不要与这里的源码环境命令混用。
