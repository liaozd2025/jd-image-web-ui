# 生产部署包使用说明

本发布包面向 Ubuntu 20.04 或更高版本的 Intel/AMD 服务器。生产机必须预先安装
Docker Engine 和 Docker Compose v2。应用、PostgreSQL 与 Nginx 镜像都包含在
发布包内，安装和升级不访问 Docker Hub。

## 宿主机持久化目录

默认根目录为 `/srv/jd-image-web-ui`：

```text
/srv/jd-image-web-ui/
├── postgres/   # PostgreSQL 数据文件
├── data/       # 图片、缩略图、任务输入与输出
├── backups/    # 预留给运维 CLI，本脚本不配置自动备份
├── config/     # 密码、主密钥和安装标记
├── releases/   # 已部署版本的 Compose 与配置
└── current -> releases/<version>
```

`postgres/`、`data/` 和 `backups/` 都以 bind mount 挂入容器。执行 `docker compose
down` 或删除容器不会删除这些宿主机文件。不要手动更换或删除
`config/.env`，其中的 `JD_IMAGE_MASTER_KEY` 用于解密已有供应商凭据。

## 首次安装

```sh
tar -xzf jd-image-web-ui-<version>-linux-amd64.tar.gz
cd jd-image-web-ui-<version>-linux-amd64
sudo ./deploy.sh install
```

脚本会：

1. 检查 Ubuntu、amd64、Docker 与 Compose v2；
2. 导入随包交付的应用、PostgreSQL 与 Nginx 镜像；
3. 创建宿主机目录并生成数据库密码和主密钥；
4. 启动 PostgreSQL、Web、Worker 和 Nginx；
5. 等待 `/health/ready` 成功；
6. 创建初始管理员，并在终端显示一次临时密码。

非交互执行时必须提供管理员用户名：

```sh
sudo ./deploy.sh install --admin-username admin
```

默认监听 `0.0.0.0:8787`。可覆盖端口或持久化根目录：

```sh
sudo ./deploy.sh install \
  --root /srv/jd-image-web-ui \
  --http-port 8787 \
  --admin-username admin
```

## 升级

解压新版本发布包后执行：

```sh
cd jd-image-web-ui-<new-version>-linux-amd64
sudo ./deploy.sh upgrade
```

升级复用原数据库、资源目录和 `config/.env`，不会重新生成密钥，也不会删除旧版本
目录或旧应用镜像。应用启动时会自动执行数据库迁移；本版本不配置备份，也不承诺
数据库迁移后的自动回滚。升级失败时脚本保留数据、旧镜像、失败版本和容器日志。

## 查看状态

```sh
cd /srv/jd-image-web-ui/current
sudo docker compose \
  --project-name jd-image-web-ui \
  --env-file /srv/jd-image-web-ui/config/.env \
  --env-file release.env \
  -f compose.production.yml ps
```

本脚本不负责 Docker 安装、TLS、域名、主机防火墙、自动备份、异机灾备、容量规划
或旧 Docker 命名卷迁移。Docker Engine 如需安装，可由运维通过
`https://download.docker.com/linux/ubuntu` 的官方 APT/DEB 源完成；该地址只提供
Docker 软件包，不提供容器镜像。
