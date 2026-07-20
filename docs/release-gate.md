# 服务器版发布门

发布只接受服务器浏览器产品，任意失败项都阻止发布，不以“已知缺口”带病发布。

| 范围 | 自动证据 | 发布要求 |
| --- | --- | --- |
| 身份、双用户隔离、管理员边界 | `tests.test_server_auth`、`tests.test_server_user_lifecycle`、`tests.test_server_admin_views` | 真实 PostgreSQL 全部通过 |
| 个人/共享资产、版本、回收站、额度 | `tests.test_server_assets`、`tests.test_server_shared_assets`、`tests.test_server_shared_gallery` | 个人额度保持生效；共享存储不设产品额度，磁盘失败不留半成品 |
| 管理员内容审阅 | `tests.test_server_admin_views`、`tests.test_webui_static_layout` | 三类列表服务端分页；缩略图受鉴权保护；分页与详情审阅分别审计 |
| 供应商、部门额度、密钥保密 | `tests.test_server_providers`、`tests.test_server_department_providers` | 响应、日志、审计无明文密钥 |
| 公平队列、并发、尝试、取消、重试 | `tests.test_server_scheduler`、`tests.test_server_tasks` | 任务不可重复执行，最终状态和额度一致 |
| 备份、恢复、核对、清理 | `tests.test_server_maintenance`、`jd-image-ops reconcile-storage/backup/restore` | 维护锁生效，清理必须显式确认 |
| Docker 内网部署 | `tests.test_server_health`、`tests.test_server_compose_smoke` | 只有反向代理暴露 HTTP，重启后数据持久 |
| 本机产品面清除 | `scripts/release_gate.py --static-only` | 不存在桌面、便携、托盘、OAuth 或用户生图 CLI 入口 |

本地执行：

```sh
.venv/bin/python scripts/release_gate.py --static-only
.venv/bin/python -m unittest discover -s tests -v
JD_IMAGE_RUN_BROWSER=1 .venv/bin/python -m unittest tests.test_server_browser_workspace
```

发布验收还必须覆盖（由上表的后端、静态与浏览器证据共同保证）：

- “共享资产与存储”不出现额度输入，显示已用空间和资产数量；共享资产卡片仍可使用、停用和恢复。
- “用户内容只读查看”的“生成内容 / 个人资产”均按每页 20 项请求服务端，卡片显示真实缩略图或安全摘要。
- 任务与资产预览不出现编辑、删除或下载按钮；关闭预览后用户、标签、筛选和页码不丢失。
- 管理员分页、详情和预览接口拒绝普通用户；缩略图请求不制造逐图审计事件。
- 桌面宽度和 390px 视口无水平滚动，图片按原比例完整显示。

关键只读接口：

- `GET /api/admin/shared-storage`：共享存储用量与资产数量，不提供写入额度。
- `GET /api/admin/shared-assets?page=1&page_size=20`：共享资产分页、搜索、分类、类型和状态筛选。
- `GET /api/admin/users/{user_id}/tasks?page=1&page_size=20`：用户生成任务分页、搜索和状态筛选。
- `GET /api/admin/users/{user_id}/assets?page=1&page_size=20`：用户个人资产分页、搜索、类型和删除状态筛选。
