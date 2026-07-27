# 生产环境部署与运维手册

本文是 `jd-image-web-ui` 生产发布包的主操作手册，适用于 Ubuntu 20.04
及以上版本的 Intel/AMD 64 位服务器。生产环境使用 Docker Compose 部署，
PostgreSQL 数据、图片资源和配置全部保存在指定的宿主机目录中。

首次安装和完整运行时升级包已包含应用、PostgreSQL 和 Nginx 的 `linux/amd64`
镜像。日常代码更新使用单独的程序更新包，不包含也不重新创建任何镜像。生产服务器
只需预装 Docker Engine 与 Docker Compose v2，部署过程中不访问 Docker Hub，
也不需要私有镜像仓库。

## 1. 部署结果

部署完成后，服务器上运行四个容器：

- `postgres`：保存业务数据库；
- `web`：提供 Web API 和页面；
- `worker`：处理图片生成任务；
- `proxy`：通过 Nginx 对外提供 HTTP 访问。

只有 Nginx 暴露宿主机端口，默认监听 `0.0.0.0:8787`。数据库、Web 和 Worker
不直接对外开放端口。

本文统一使用下面的示例值：

```text
发布版本：v1.0.0
安装目录：/data/jd-image-web-ui
访问端口：8787
管理员名：admin
```

实际部署时可以替换版本、安装目录、端口和管理员名。安装目录必须是绝对路径，
且不能包含空格或特殊字符。

## 2. 部署前检查

### 2.1 构建机

构建首次安装或完整升级包时，构建机需要：

- 可正常运行 Docker Engine 和 Docker Buildx；
- 可访问构建脚本中锁定的 Docker Hub 基础镜像；
- Git 工作区没有未提交或未暂存的修改；
- 有足够空间保存应用镜像、基础镜像和最终压缩包。

检查命令：

```sh
git status --short
docker info
docker buildx version
```

`git status --short` 必须没有输出。发布包会记录当前 Git 提交，构建脚本因此拒绝
从脏工作区生成不可追溯的生产包。

只生成程序更新包时不需要 Docker 或 Buildx，但仍要求干净的 Git 工作区，并需要
`git`、`tar` 和 `sha256sum`。

### 2.2 生产服务器

生产服务器需要：

- Ubuntu 20.04 或更高版本；
- `x86_64` 架构；
- root 权限或可用的 `sudo`；
- Docker Engine；
- Docker Compose v2；
- `openssl`、`tar`、`sed` 和 `install`；
- 指定安装目录所在磁盘有足够空间；
- 计划使用的 HTTP 端口未被占用。

检查命令：

```sh
uname -m
. /etc/os-release && printf '%s %s\n' "$ID" "$VERSION_ID"
sudo docker info
sudo docker compose version
openssl version
df -h /data
sudo ss -lntp | grep ':8787 ' || true
```

预期架构为 `x86_64`，Compose 主版本为 `2`。如果生产服务器尚未安装 Docker，
由运维人员通过 `https://download.docker.com/linux/ubuntu` 官方软件源安装。
该地址只提供 Docker 软件包，不提供容器镜像。

## 3. 在构建机生成发布包

### 3.1 首次安装或完整升级包

进入仓库根目录，从干净的 Git 工作区构建：

```sh
./scripts/build-release.sh --version v1.0.0
```

成功后生成：

```text
dist/jd-image-web-ui-v1.0.0-linux-amd64.tar.gz
```

发布包包含：

```text
jd-image-web-ui-v1.0.0-linux-amd64/
├── app-image.tar          # 应用镜像
├── base-images.tar        # PostgreSQL 和 Nginx 镜像
├── compose.production.yml
├── deploy.sh
├── manifest.txt           # 版本、Git 提交、平台和镜像来源
├── nginx.conf
├── README.md              # 本手册
└── release.env            # 发布版本及镜像标签
```

建议在传输前生成校验文件：

```sh
cd dist
sha256sum jd-image-web-ui-v1.0.0-linux-amd64.tar.gz \
  > jd-image-web-ui-v1.0.0-linux-amd64.tar.gz.sha256
```

如果出现下面的错误：

```text
Error: Git worktree is not clean; commit or stash all changes before building a release
```

先运行 `git status --short` 查看修改，确认后提交或暂存，再重新构建。不要为了绕过
检查而删除不明确的本地修改。

### 3.2 日常程序更新包

服务端依赖没有变化时，使用程序更新包：

```sh
./scripts/build-update-package.sh --version v1.1.0
```

成功后生成：

```text
dist/jd-image-web-ui-v1.1.0-program-update.tar.gz
```

程序更新包只包含：

```text
jd-image-web-ui-v1.1.0-program-update/
├── app-package.tar.gz     # Python 服务代码、SQL 迁移和 Web 静态资源
├── compose.update.yml     # Web/Worker 只读程序挂载
├── deploy.sh
├── manifest.txt           # Git 提交、程序包和依赖校验值
├── README.md
├── requirements-server.txt
└── update.env
```

该构建脚本不会执行任何 Docker 命令，也不会生成 `app-image.tar` 或
`base-images.tar`。

## 4. 将发布包传到生产服务器

可以使用 `scp`、SFTP 或受控的离线介质传输。以下示例把文件放到生产服务器的
`/tmp/jd-image-release`：

```sh
ssh deploy@<服务器IP> 'mkdir -p /tmp/jd-image-release'
scp dist/jd-image-web-ui-v1.0.0-linux-amd64.tar.gz \
  dist/jd-image-web-ui-v1.0.0-linux-amd64.tar.gz.sha256 \
  deploy@<服务器IP>:/tmp/jd-image-release/
```

在生产服务器上校验：

```sh
cd /tmp/jd-image-release
sha256sum -c jd-image-web-ui-v1.0.0-linux-amd64.tar.gz.sha256
```

校验结果必须为 `OK`。

## 5. 安装到指定目录

在生产服务器上解压发布包：

```sh
cd /tmp/jd-image-release
tar -xzf jd-image-web-ui-v1.0.0-linux-amd64.tar.gz
cd jd-image-web-ui-v1.0.0-linux-amd64
```

安装到 `/data/jd-image-web-ui`：

```sh
sudo ./deploy.sh install \
  --root /data/jd-image-web-ui \
  --http-port 8787 \
  --admin-username admin
```

脚本会依次完成：

1. 检查 Ubuntu 版本、CPU 架构、Docker 和 Compose；
2. 从 `app-image.tar` 导入应用镜像；
3. 从 `base-images.tar` 导入 PostgreSQL 和 Nginx 镜像；
4. 创建宿主机持久化目录；
5. 自动生成 PostgreSQL 密码和应用主密钥；
6. 启动 PostgreSQL、Web、Worker 和 Nginx；
7. 等待 `/health/ready` 就绪；
8. 创建初始管理员；
9. 在终端显示一次管理员临时密码。

安装成功时终端会显示：

```text
[jd-image] Installation complete. The proxy is listening on 0.0.0.0:8787.
```

请立即安全保存临时密码。临时密码只显示一次，管理员首次登录后必须修改密码。

如果交互式安装时省略 `--admin-username`，脚本会提示输入管理员名；通过自动化
工具或非交互终端执行时必须显式传入该参数。

### 5.1 默认目录安装

不传 `--root` 时，默认安装到 `/srv/jd-image-web-ui`：

```sh
sudo ./deploy.sh install --admin-username admin
```

### 5.2 安装参数约束

- `--root`：专用的绝对目录，不能是 `/` 或 `/srv`；
- `--http-port`：`1` 到 `65535`，只允许在首次安装时设置；
- `--admin-username`：2 到 64 位，只能包含字母、数字、点、下划线和连字符；
- 已完成安装后不能再次用 `install` 部署新版本；日常代码更新使用 `update`，
  运行时依赖或镜像变化才使用 `upgrade`。

## 6. 宿主机持久化目录

安装完成后的目录结构：

```text
/data/jd-image-web-ui/
├── postgres/              # PostgreSQL 数据文件
├── data/                  # 图片、缩略图、任务输入和输出
├── backups/               # 运维 CLI 预留目录，本版本不配置自动备份
├── config/
│   ├── .env               # 数据库密码、主密钥、端口和目录配置
│   └── .installed         # 安装完成标记
├── releases/
│   ├── v1.0.0/            # 首次安装的 Compose、Nginx 和发布信息
│   └── v1.1.0/            # 程序包、只读挂载配置和发布信息
└── current -> releases/v1.1.0
```

`postgres/`、`data/` 和 `backups/` 都通过 bind mount 挂入容器，不是 Docker
命名卷。因此停止或删除容器不会删除这些宿主机文件。

必须长期保留整个安装根目录，尤其不要删除或替换：

- `postgres/`：删除会丢失数据库；
- `data/`：删除会丢失图片和任务文件；
- `config/.env`：其中的 `JD_IMAGE_MASTER_KEY` 用于解密已有供应商凭据。

`config/.env` 权限为 `0600`。排查问题时不要把该文件内容粘贴到聊天、工单或日志中。

## 7. 验收部署

### 7.1 检查容器

在生产服务器上定义一个仅对当前终端有效的辅助函数：

```sh
export JD_IMAGE_ROOT=/data/jd-image-web-ui

jd_compose() {
  local -a compose_files=(
    --file "$JD_IMAGE_ROOT/current/compose.production.yml"
  )
  if [[ -f "$JD_IMAGE_ROOT/current/compose.update.yml" ]]; then
    compose_files+=(--file "$JD_IMAGE_ROOT/current/compose.update.yml")
  fi
  sudo docker compose \
    --project-name jd-image-web-ui \
    --env-file "$JD_IMAGE_ROOT/config/.env" \
    --env-file "$JD_IMAGE_ROOT/current/release.env" \
    "${compose_files[@]}" \
    "$@"
}
```

检查状态：

```sh
jd_compose ps
```

`postgres`、`web`、`worker` 和 `proxy` 应处于运行状态，配置了健康检查的服务应显示
`healthy`。

### 7.2 检查健康接口

```sh
curl -fsS http://127.0.0.1:8787/health/ready
```

命令应成功退出。部署脚本已经执行同一就绪检查；这里用于人工复核。

### 7.3 浏览器登录

在能够访问服务器的客户端浏览器打开：

```text
http://<服务器IP>:8787
```

使用安装时创建的管理员和终端显示的临时密码登录，按提示修改密码。不要在浏览器中
使用 `0.0.0.0`，它只是服务器监听地址。

### 7.4 检查持久化

```sh
sudo readlink /data/jd-image-web-ui/current
sudo du -sh \
  /data/jd-image-web-ui/postgres \
  /data/jd-image-web-ui/data
sudo stat -c '%a %U:%G %n' /data/jd-image-web-ui/config/.env
```

`current` 应指向当前版本，`.env` 权限应为 `600`。

## 8. 日常启停和日志

先按第 7.1 节定义 `JD_IMAGE_ROOT` 和 `jd_compose`，再执行：

```sh
# 查看状态
jd_compose ps

# 查看最近 200 行日志
jd_compose logs --tail=200 postgres web worker proxy

# 持续查看日志
jd_compose logs --follow web worker proxy

# 重启应用服务
jd_compose restart web worker proxy

# 停止全部服务
jd_compose stop

# 启动全部服务
jd_compose start
```

存储一致性检查只报告问题，不删除文件：

```sh
jd_compose exec -T web \
  python -m codex_image.server.ops reconcile-storage --json
```

本版本的生产部署范围不包括自动备份和异机灾备。

## 9. 更新与升级

### 9.1 日常程序更新

在构建机按第 3.2 节生成程序更新包，生成并传输校验文件：

```sh
cd dist
sha256sum jd-image-web-ui-v1.1.0-program-update.tar.gz \
  > jd-image-web-ui-v1.1.0-program-update.tar.gz.sha256
scp jd-image-web-ui-v1.1.0-program-update.tar.gz \
  jd-image-web-ui-v1.1.0-program-update.tar.gz.sha256 \
  deploy@<服务器IP>:/tmp/jd-image-release/
```

在生产服务器校验、解压并进入更新包目录：

```sh
cd /tmp/jd-image-release
sha256sum -c jd-image-web-ui-v1.1.0-program-update.tar.gz.sha256
tar -xzf jd-image-web-ui-v1.1.0-program-update.tar.gz
cd jd-image-web-ui-v1.1.0-program-update
```

执行程序更新时必须传入首次安装使用的同一个根目录：

```sh
sudo ./deploy.sh update --root /data/jd-image-web-ui
```

`update` 会：

- 校验程序包、Git 提交和服务依赖清单；
- 复用当前应用、PostgreSQL 和 Nginx 镜像，不执行镜像构建、加载或拉取；
- 只重建 Web 和 Worker 容器，将新程序目录只读挂载到 `/app/codex_image`；
- 保持 PostgreSQL 和 Nginx 容器运行；
- 保留 `postgres/`、`data/`、`backups/`、`config/.env` 和全部账号；
- 就绪检查成功后更新 `current`，失败时恢复上一版本 Web/Worker。

Web 和 Worker 切换时会有短暂服务中断。应用启动时仍会执行带数据库 advisory lock
的增量迁移，但不会清空、重建或重新初始化数据库。数据库迁移是前向操作，程序自动
回退不代表数据库 schema 回退。

如果 `requirements-server.txt` 与当前应用镜像不同，脚本会在重建 Web/Worker
之前停止，并提示使用完整升级包。不要修改更新包中的依赖校验值来绕过检查。

### 9.2 完整运行时升级

只有 Python 服务依赖、基础镜像或生产 Compose 拓扑变化时，才按第 3.1 节构建完整
发布包。传到生产服务器并解压后执行：

```sh
cd /tmp/jd-image-release/jd-image-web-ui-v1.1.0-linux-amd64
sudo ./deploy.sh upgrade --root /data/jd-image-web-ui
```

`upgrade` 会导入完整发布包中的应用、PostgreSQL 和 Nginx 镜像，并启动整套
Compose 服务，但仍复用原数据库密码、主密钥、管理员账号以及所有宿主机持久化
目录。

`update` 和 `upgrade` 都不接受 `--http-port` 或 `--admin-username`。执行后重复
第 7 节的容器、健康接口、登录、历史任务和图片访问检查。升级失败时不要删除
数据库、资源目录、旧镜像或失败版本日志。

## 10. 受限网络说明

生产服务器不需要访问 `registry-1.docker.io`。执行首次安装或完整 `upgrade` 时，
部署日志应该包含：

```text
[jd-image] Loading application image ...
[jd-image] Loading bundled PostgreSQL and Nginx images...
```

执行日常 `update` 时不应出现上述两行，而应显示程序版本切换、Web/Worker 启动和
就绪检查；该路径使用 `--pull never`，不会加载或拉取镜像。

如果生产服务器出现：

```text
Get "https://registry-1.docker.io/v2/": Client.Timeout exceeded
```

说明当前流程仍在尝试从 Docker Hub 拉取镜像，常见原因是：

- 使用了旧版发布包；
- 发布包内缺少 `base-images.tar`；
- 在生产服务器执行了源码 Compose 流程；
- 手动运行了会触发拉取的 `docker compose pull` 或普通 `up`。

先检查发布包：

```sh
test -f app-image.tar
test -f base-images.tar
grep '^base_images_included=true$' manifest.txt
```

三个命令都应成功。完整生产部署必须通过随包提供的 `deploy.sh` 执行，该脚本使用
`docker load` 导入镜像，并以 `--pull never` 启动服务。程序更新包不包含这些
文件，应检查 `manifest.txt` 中的 `release_kind=program-update` 和
`images_included=false`。

`download.docker.com` 只能解决 Docker Engine 和 Compose 软件包的下载问题，
不能替代 Docker Hub 容器镜像仓库。

## 11. 常见故障

### Docker daemon is unavailable

确认 Docker 服务已启动，且使用 `sudo docker info` 可以连接：

```sh
sudo systemctl status docker
sudo systemctl start docker
sudo docker info
```

### 8787 端口已被占用

首次安装前检查端口占用：

```sh
sudo ss -lntp | grep ':8787 '
```

可以停止冲突服务，或首次安装时通过 `--http-port` 选择其他端口。完成安装后升级会
保留原端口。

### deployment did not become ready

脚本超时后会打印容器状态和最近日志。按第 7.1 节定义 `JD_IMAGE_ROOT` 和
`jd_compose` 后，也可以手动执行：

```sh
jd_compose ps
jd_compose logs --tail=200 postgres web worker proxy
```

首次安装在就绪前失败时，修复 Docker、端口、磁盘或网络问题后，可以用相同参数
重新运行 `install`；脚本会复用已生成的配置。程序更新失败时脚本会尝试恢复上一
版本 Web/Worker，并保持 `current` 不变。

### server dependencies changed

说明程序更新包中的 `requirements-server.txt` 与当前应用镜像不一致。程序包不能
安全地补充系统或 Python 依赖，因此脚本会在切换服务前停止。请构建完整发布包并
执行：

```sh
sudo ./deploy.sh upgrade --root /data/jd-image-web-ui
```

### Ready 返回 503

- `database unavailable`：检查 `postgres` 状态和日志；
- `worker unavailable`：检查 `worker` 状态和日志；
- `file_volume unavailable`：检查 `data/` 目录空间、所有者和写权限。

### 浏览器无法访问

先在服务器本机检查 `http://127.0.0.1:<端口>/health/ready`。如果本机正常而客户端
无法访问，检查服务器路由、安全组和主机防火墙。部署脚本只负责绑定
`0.0.0.0:<端口>`，不修改防火墙。

## 12. 范围与安全边界

部署脚本负责首次安装、完整镜像升级、纯程序包更新、容器启动、健康检查、宿主机
持久化和初始管理员创建。程序更新不会重建镜像，也不会操作 PostgreSQL/Nginx
容器。
以下事项不在本版本脚本范围内：

- Docker Engine 和 Compose 的安装；
- TLS 证书、HTTPS 和域名；
- 主机防火墙、安全组和网络路由；
- 自动备份、异机灾备和容量规划；
- 发布包签名；
- 旧 Docker 命名卷迁移；
- 数据库迁移后的自动回滚。

上线前至少确认：

- `config/.env` 仅 root 可读；
- 对外只开放实际需要的 HTTP 端口；
- 管理员已修改临时密码；
- `postgres/`、`data/` 和 `config/` 位于预期宿主机磁盘；
- 未通过工单、聊天或日志泄露 `.env` 内容；
- 没有手动删除宿主机持久化目录。
