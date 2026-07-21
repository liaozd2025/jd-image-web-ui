# 图库管理 Tab 原型（可丢弃）

设计问题：主页如何区分“个人管理库 / 团队管理库”，进入后又如何在同一个图库管理容器里通过“个人 / 团队”Tab 切换。

运行：

```bash
python3 codex_image/webui/prototype-gallery-library-tabs/serve.py
```

打开 <http://127.0.0.1:4319/?variant=A>。底部切换条或键盘左右方向键可切换 A、B、C 三个方案；点击任一管理库入口，可验证默认打开对应 Tab。

此目录不接真实接口，不持久化数据，不是生产实现。
