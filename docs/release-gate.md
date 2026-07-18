# 服务器版发布门

发布只接受服务器浏览器产品，任意失败项都阻止发布，不以“已知缺口”带病发布。

| 范围 | 自动证据 | 发布要求 |
| --- | --- | --- |
| 身份、双用户隔离、管理员边界 | `tests.test_server_auth`、`tests.test_server_user_lifecycle`、`tests.test_server_admin_views` | 真实 PostgreSQL 全部通过 |
| 个人/共享资产、版本、回收站、额度 | `tests.test_server_assets`、`tests.test_server_shared_assets` | 访问权限和文件校验全部通过 |
| 供应商、部门额度、密钥保密 | `tests.test_server_providers`、`tests.test_server_department_providers` | 响应、日志、审计无明文密钥 |
| 公平队列、并发、尝试、取消、重试 | `tests.test_server_scheduler`、`tests.test_server_tasks` | 任务不可重复执行，最终状态和额度一致 |
| 备份、恢复、核对、清理 | `tests.test_server_maintenance`、`jd-image-ops reconcile-storage/backup/restore` | 维护锁生效，清理必须显式确认 |
| Docker 内网部署 | `tests.test_server_health`、`tests.test_server_compose_smoke` | 只有反向代理暴露 HTTP，重启后数据持久 |
| 本机产品面清除 | `scripts/release_gate.py --static-only` | 不存在桌面、便携、托盘、OAuth 或用户生图 CLI 入口 |

本地执行：

```sh
.venv/bin/python scripts/release_gate.py --static-only
.venv/bin/python -m unittest discover -s tests -v
```
