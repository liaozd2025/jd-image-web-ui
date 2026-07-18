# Server releases

发布产物是服务器 Docker 镜像和源码部署目录，不提供桌面应用、便携包、托盘启动器或本机生图入口。

发布前必须通过 CI、Docker Compose smoke、真实 PostgreSQL 服务测试、备份恢复和发布核对矩阵。详见 [服务器运维说明](deploy/server/README.md)。
