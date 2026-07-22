# Server releases

发布产物是服务器 Docker 镜像和源码部署目录，不提供桌面应用、便携包、托盘启动器或本机生图入口。

发布前必须通过 CI、Docker Compose smoke、真实 PostgreSQL 服务测试、备份恢复和发布核对矩阵。详见 [服务器运维说明](deploy/server/README.md)。

## v0.7.0 upstream integration

- 上游基线：`kadevin/ilab-conjure` `v0.7.0` / `1f0fd675`。
- 保留服务器认证、多用户隔离、PostgreSQL、Web/Worker 分离、额度、公平队列、共享资产和九典品牌工作区。
- 接入统一模型目录、Gemini/OpenAI 协议适配、数据库模型绑定和不可变任务生成快照。
- 不发布桌面应用、portable 包、自动更新器、Codex OAuth、本地 SQLite WebUI 或用户生图 CLI。
