# 服务器模式 Phase 1：用户体系与登录认证 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 WebUI 增加"服务器模式"：用户名+密码登录、会话管理、管理员账号管理 API、登录页，服务器模式下禁用 Codex 通道；单机模式行为完全不变。

**Architecture:** 新增 `UserStore`（SQLite 用户+会话表，scrypt 哈希），`create_app` 增加 `server_mode` 开关（参数或环境变量 `CONJURE_SERVER_MODE`），服务器模式下安装 HTTP 中间件认证门（未登录 API 返 401、页面 302 到 /login），并注册账号路由 `register_account_routes`。数据隔离（按用户分区）是 Phase 2，本阶段所有登录用户仍共享同一份数据——本阶段产物可测试可运行，但**不可交付部门使用**。

**Tech Stack:** Python 3.11+ / FastAPI / SQLite（stdlib `sqlite3`）/ stdlib `hashlib.scrypt` + `secrets`。**不新增任何第三方依赖。**

**参考文档:** 决策背景见 `CONTEXT.md`（词汇表）与 `docs/adr/0001-same-repo-dual-mode.md`。

## Global Constraints

- 不新增第三方依赖（密码哈希用 stdlib `hashlib.scrypt`，会话令牌用 `secrets`）。
- 单机模式（`server_mode=False`，默认）行为零变化；每个任务完成后现有全量测试必须仍通过。
- 会话 cookie 名 `conjure_session`，HttpOnly、SameSite=Lax、有效期 30 天。
- 密码最短 8 字符；修改/重置密码后该用户所有既有会话失效。
- 用户名规则：`^[A-Za-z0-9_.-]{2,32}$`。
- 角色只有 `user` 和 `admin` 两种。
- 服务器模式下 Codex 通道不可用（启动强制 auth source 为 `api`，切换接口拒绝 `codex`）。
- 测试命令：`python -m pytest tests/<file> -v`；提交信息用祈使句英文，末尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: UserStore（用户与会话存储）

**Files:**
- Create: `codex_image/webui/user_store.py`
- Test: `tests/test_webui_user_store.py`

**Interfaces:**
- Consumes: 无（仅 stdlib）。
- Produces（后续任务依赖的精确签名）:
  - `UserRecord`（frozen dataclass）: `username: str`, `role: str`, `disabled: bool`, `must_change_password: bool`, `created_at: int`；属性 `is_admin -> bool`。
  - `UserStore(db_path: Path | str)`
  - `create_user(username, password, *, role="user", must_change_password=True) -> UserRecord`（重名/非法输入抛 `UserStoreError`）
  - `authenticate(username, password) -> UserRecord | None`（未知/停用/密码错返回 None）
  - `get(username) -> UserRecord | None`；`list_users() -> list[UserRecord]`
  - `change_password(username, old_password, new_password) -> bool`（旧密码错返回 False；成功后 must_change_password 清零并吊销全部会话）
  - `reset_password(username, new_password, *, must_change=True) -> None`（吊销全部会话）
  - `set_disabled(username, disabled: bool) -> None`（停用时吊销全部会话）
  - `create_session(username, *, ttl_seconds=SESSION_TTL_SECONDS) -> str`（返回令牌明文；库中存 sha256）
  - `resolve_session(token) -> UserRecord | None`（过期/停用/未知返回 None）
  - `revoke_session(token) -> None`；`revoke_user_sessions(username) -> None`
  - 常量：`SESSION_TTL_SECONDS = 30*24*3600`，`MIN_PASSWORD_LENGTH = 8`
  - 异常：`class UserStoreError(RuntimeError)`

- [ ] **Step 1: 写失败测试**

`tests/test_webui_user_store.py`：

```python
from __future__ import annotations

import pytest

from codex_image.webui.user_store import (
    MIN_PASSWORD_LENGTH,
    UserStore,
    UserStoreError,
)


@pytest.fixture()
def store(tmp_path):
    return UserStore(tmp_path / "users.db")


def test_create_and_authenticate(store):
    record = store.create_user("alice", "password123", role="admin", must_change_password=False)
    assert record.username == "alice"
    assert record.is_admin
    assert not record.must_change_password
    hit = store.authenticate("alice", "password123")
    assert hit is not None and hit.username == "alice"


def test_authenticate_rejects_wrong_password(store):
    store.create_user("alice", "password123")
    assert store.authenticate("alice", "wrong-password") is None
    assert store.authenticate("nobody", "password123") is None


def test_duplicate_username_rejected(store):
    store.create_user("alice", "password123")
    with pytest.raises(UserStoreError):
        store.create_user("alice", "password456")


def test_invalid_username_and_short_password_rejected(store):
    with pytest.raises(UserStoreError):
        store.create_user("a", "password123")  # too short username
    with pytest.raises(UserStoreError):
        store.create_user("bad name", "password123")  # space not allowed
    with pytest.raises(UserStoreError):
        store.create_user("alice", "x" * (MIN_PASSWORD_LENGTH - 1))


def test_disabled_user_cannot_authenticate_or_resolve(store):
    store.create_user("alice", "password123")
    token = store.create_session("alice")
    store.set_disabled("alice", True)
    assert store.authenticate("alice", "password123") is None
    assert store.resolve_session(token) is None
    store.set_disabled("alice", False)
    assert store.authenticate("alice", "password123") is not None


def test_change_password_requires_old_and_revokes_sessions(store):
    store.create_user("alice", "password123", must_change_password=True)
    token = store.create_session("alice")
    assert store.change_password("alice", "wrong", "newpassword1") is False
    assert store.change_password("alice", "password123", "newpassword1") is True
    assert store.resolve_session(token) is None  # old session revoked
    hit = store.authenticate("alice", "newpassword1")
    assert hit is not None and hit.must_change_password is False


def test_reset_password_sets_must_change_and_revokes(store):
    store.create_user("alice", "password123", must_change_password=False)
    token = store.create_session("alice")
    store.reset_password("alice", "resetpass99")
    assert store.resolve_session(token) is None
    hit = store.authenticate("alice", "resetpass99")
    assert hit is not None and hit.must_change_password is True


def test_session_roundtrip_expiry_and_revoke(store):
    store.create_user("alice", "password123")
    token = store.create_session("alice")
    assert store.resolve_session(token).username == "alice"
    assert store.resolve_session("not-a-token") is None
    store.revoke_session(token)
    assert store.resolve_session(token) is None
    expired = store.create_session("alice", ttl_seconds=-1)
    assert store.resolve_session(expired) is None


def test_list_users(store):
    store.create_user("alice", "password123")
    store.create_user("bob", "password123")
    names = [u.username for u in store.list_users()]
    assert names == sorted(names)
    assert set(names) == {"alice", "bob"}
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_webui_user_store.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'codex_image.webui.user_store'`

- [ ] **Step 3: 实现 user_store.py**

`codex_image/webui/user_store.py`：

```python
from __future__ import annotations

import hashlib
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

SESSION_TTL_SECONDS = 30 * 24 * 3600
MIN_PASSWORD_LENGTH = 8

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{2,32}$")
_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1


class UserStoreError(RuntimeError):
    pass


@dataclass(frozen=True)
class UserRecord:
    username: str
    role: str
    disabled: bool
    must_change_password: bool
    created_at: int

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"


class UserStore:
    def __init__(self, db_path: Path | str) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._db() as conn:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS users ("
                " username TEXT PRIMARY KEY,"
                " password_hash TEXT NOT NULL,"
                " role TEXT NOT NULL DEFAULT 'user',"
                " disabled INTEGER NOT NULL DEFAULT 0,"
                " must_change_password INTEGER NOT NULL DEFAULT 1,"
                " created_at INTEGER NOT NULL)"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS sessions ("
                " token_hash TEXT PRIMARY KEY,"
                " username TEXT NOT NULL,"
                " expires_at INTEGER NOT NULL)"
            )

    @contextmanager
    def _db(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    # ---- password hashing ----

    @staticmethod
    def _hash_password(password: str) -> str:
        salt = secrets.token_bytes(16)
        digest = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P
        )
        return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"

    @staticmethod
    def _verify_password(password: str, encoded: str) -> bool:
        try:
            scheme, n, r, p, salt_hex, digest_hex = encoded.split("$")
            if scheme != "scrypt":
                return False
            digest = hashlib.scrypt(
                password.encode("utf-8"),
                salt=bytes.fromhex(salt_hex),
                n=int(n),
                r=int(r),
                p=int(p),
            )
            return secrets.compare_digest(digest.hex(), digest_hex)
        except (ValueError, TypeError):
            return False

    # ---- validation ----

    @staticmethod
    def _validate_username(username: str) -> str:
        clean = str(username or "").strip()
        if not _USERNAME_RE.match(clean):
            raise UserStoreError(
                "username must be 2-32 characters of letters, digits, '_', '.', '-'"
            )
        return clean

    @staticmethod
    def _validate_password(password: str) -> None:
        if len(str(password or "")) < MIN_PASSWORD_LENGTH:
            raise UserStoreError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")

    # ---- users ----

    def create_user(
        self,
        username: str,
        password: str,
        *,
        role: str = "user",
        must_change_password: bool = True,
    ) -> UserRecord:
        clean = self._validate_username(username)
        if role not in {"user", "admin"}:
            raise UserStoreError("role must be user or admin")
        self._validate_password(password)
        created_at = int(time.time())
        try:
            with self._db() as conn:
                conn.execute(
                    "INSERT INTO users (username, password_hash, role, disabled,"
                    " must_change_password, created_at) VALUES (?, ?, ?, 0, ?, ?)",
                    (clean, self._hash_password(password), role, int(must_change_password), created_at),
                )
        except sqlite3.IntegrityError as exc:
            raise UserStoreError(f"username '{clean}' already exists") from exc
        return UserRecord(clean, role, False, bool(must_change_password), created_at)

    @staticmethod
    def _record_from_row(row: sqlite3.Row) -> UserRecord:
        return UserRecord(
            username=str(row["username"]),
            role=str(row["role"]),
            disabled=bool(row["disabled"]),
            must_change_password=bool(row["must_change_password"]),
            created_at=int(row["created_at"]),
        )

    def get(self, username: str) -> UserRecord | None:
        with self._db() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE username = ?", (str(username or "").strip(),)
            ).fetchone()
        return self._record_from_row(row) if row else None

    def list_users(self) -> list[UserRecord]:
        with self._db() as conn:
            rows = conn.execute("SELECT * FROM users ORDER BY username").fetchall()
        return [self._record_from_row(row) for row in rows]

    def authenticate(self, username: str, password: str) -> UserRecord | None:
        clean = str(username or "").strip()
        with self._db() as conn:
            row = conn.execute("SELECT * FROM users WHERE username = ?", (clean,)).fetchone()
        if row is None or bool(row["disabled"]):
            return None
        if not self._verify_password(password, str(row["password_hash"])):
            return None
        return self._record_from_row(row)

    def change_password(self, username: str, old_password: str, new_password: str) -> bool:
        if self.authenticate(username, old_password) is None:
            return False
        self._validate_password(new_password)
        with self._db() as conn:
            conn.execute(
                "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE username = ?",
                (self._hash_password(new_password), str(username or "").strip()),
            )
        self.revoke_user_sessions(username)
        return True

    def reset_password(self, username: str, new_password: str, *, must_change: bool = True) -> None:
        if self.get(username) is None:
            raise UserStoreError(f"unknown user '{username}'")
        self._validate_password(new_password)
        with self._db() as conn:
            conn.execute(
                "UPDATE users SET password_hash = ?, must_change_password = ? WHERE username = ?",
                (self._hash_password(new_password), int(must_change), str(username or "").strip()),
            )
        self.revoke_user_sessions(username)

    def set_disabled(self, username: str, disabled: bool) -> None:
        if self.get(username) is None:
            raise UserStoreError(f"unknown user '{username}'")
        with self._db() as conn:
            conn.execute(
                "UPDATE users SET disabled = ? WHERE username = ?",
                (int(disabled), str(username or "").strip()),
            )
        if disabled:
            self.revoke_user_sessions(username)

    # ---- sessions ----

    @staticmethod
    def _token_hash(token: str) -> str:
        return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()

    def create_session(self, username: str, *, ttl_seconds: int = SESSION_TTL_SECONDS) -> str:
        token = secrets.token_urlsafe(32)
        now = int(time.time())
        with self._db() as conn:
            conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now,))
            conn.execute(
                "INSERT INTO sessions (token_hash, username, expires_at) VALUES (?, ?, ?)",
                (self._token_hash(token), str(username or "").strip(), now + int(ttl_seconds)),
            )
        return token

    def resolve_session(self, token: str) -> UserRecord | None:
        with self._db() as conn:
            row = conn.execute(
                "SELECT u.* FROM sessions s JOIN users u ON u.username = s.username"
                " WHERE s.token_hash = ? AND s.expires_at >= ?",
                (self._token_hash(token), int(time.time())),
            ).fetchone()
        if row is None or bool(row["disabled"]):
            return None
        return self._record_from_row(row)

    def revoke_session(self, token: str) -> None:
        with self._db() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (self._token_hash(token),))

    def revoke_user_sessions(self, username: str) -> None:
        with self._db() as conn:
            conn.execute("DELETE FROM sessions WHERE username = ?", (str(username or "").strip(),))
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_webui_user_store.py -v`
Expected: 9 项全部 PASS

- [ ] **Step 5: Commit**

```bash
git add codex_image/webui/user_store.py tests/test_webui_user_store.py
git commit -m "Add UserStore with scrypt passwords and server-side sessions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: server_mode 开关与认证门中间件

**Files:**
- Create: `codex_image/webui/auth_gate.py`
- Modify: `codex_image/webui/context.py`（WebUIContext 尾部加两个带默认值字段）
- Modify: `codex_image/webui/app.py:188`（create_app 签名与装配）
- Test: `tests/test_webui_auth_gate.py`

**Interfaces:**
- Consumes: Task 1 的 `UserStore`、`UserRecord`。
- Produces:
  - `auth_gate.SESSION_COOKIE = "conjure_session"`
  - `auth_gate.install_auth_gate(app: FastAPI, user_store: UserStore) -> None`（认证通过时设 `request.state.user: UserRecord`）
  - `create_app(..., server_mode: bool | None = None)`；`None` 时读环境变量 `CONJURE_SERVER_MODE`（`1/true/yes/on` 为真）
  - `WebUIContext.server_mode: bool = False`；`WebUIContext.user_store: Any = None`
  - 公开路径（无需登录）：`/login`、`/api/auth/login`、`/api/health`、前缀 `/static/`

- [ ] **Step 1: 写失败测试**

`tests/test_webui_auth_gate.py`：

```python
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from codex_image.webui.app import create_app
from codex_image.webui.user_store import UserStore


def make_app(tmp_path, *, server_mode: bool):
    return create_app(
        output_root=tmp_path / "output",
        webui_settings_path=tmp_path / "webui-settings.json",
        auth_settings_path=tmp_path / "auth-settings.json",
        api_settings_path=tmp_path / "api-settings.json",
        color_settings_path=tmp_path / "color-settings.json",
        prompt_snippets_path=tmp_path / "prompt-snippets.json",
        prompt_templates_path=tmp_path / "prompt-templates.json",
        client_factory=lambda: None,
        auth_checker=lambda: True,
        auto_start_queue=False,
        server_mode=server_mode,
    )


def user_db_path(tmp_path):
    return tmp_path / "output" / "webui-source-data" / "users.db"


def test_local_mode_has_no_gate(tmp_path):
    client = TestClient(make_app(tmp_path, server_mode=False))
    assert client.get("/api/app-version").status_code == 200


def test_server_mode_blocks_api_without_session(tmp_path):
    client = TestClient(make_app(tmp_path, server_mode=True))
    assert client.get("/api/app-version").status_code == 401


def test_server_mode_redirects_pages_to_login(tmp_path):
    client = TestClient(make_app(tmp_path, server_mode=True))
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/login"


def test_server_mode_health_is_public(tmp_path):
    client = TestClient(make_app(tmp_path, server_mode=True))
    assert client.get("/api/health").status_code == 200


def test_server_mode_valid_session_passes(tmp_path):
    app = make_app(tmp_path, server_mode=True)
    store = UserStore(user_db_path(tmp_path))
    store.create_user("alice", "password123", must_change_password=False)
    token = store.create_session("alice")
    client = TestClient(app)
    client.cookies.set("conjure_session", token)
    assert client.get("/api/app-version").status_code == 200


def test_env_var_enables_server_mode(tmp_path, monkeypatch):
    monkeypatch.setenv("CONJURE_SERVER_MODE", "1")
    client = TestClient(make_app(tmp_path, server_mode=None))
    assert client.get("/api/app-version").status_code == 401
```

注意：`webui-source-data` 是 `create_app` 在自定义 `output_root` 下的 source_data 子目录名。写测试前先确认常量 `DEFAULT_WEBUI_SOURCE_DATA_SUBDIR` 的实际值（`grep -n "DEFAULT_WEBUI_SOURCE_DATA_SUBDIR" codex_image/webui/app.py`），若不是 `webui-source-data` 则按实际值修改 `user_db_path`。

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_webui_auth_gate.py -v`
Expected: FAIL — `create_app() got an unexpected keyword argument 'server_mode'`

- [ ] **Step 3: 实现 auth_gate.py**

`codex_image/webui/auth_gate.py`：

```python
from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse

from codex_image.webui.user_store import UserStore

SESSION_COOKIE = "conjure_session"

_PUBLIC_EXACT = {"/login", "/api/auth/login", "/api/health"}
_PUBLIC_PREFIXES = ("/static/",)


def install_auth_gate(app: FastAPI, user_store: UserStore) -> None:
    @app.middleware("http")
    async def _auth_gate(request: Request, call_next):
        path = request.url.path
        if path in _PUBLIC_EXACT or path.startswith(_PUBLIC_PREFIXES):
            return await call_next(request)
        token = request.cookies.get(SESSION_COOKIE, "")
        user = user_store.resolve_session(token) if token else None
        if user is None:
            if path.startswith("/api/"):
                return JSONResponse({"detail": "authentication required"}, status_code=401)
            return RedirectResponse("/login", status_code=302)
        request.state.user = user
        return await call_next(request)
```

- [ ] **Step 4: 修改 context.py**

在 `WebUIContext` dataclass 的**最后一个字段之后**（保持所有已有字段不动）追加：

```python
    server_mode: bool = False
    user_store: Any = None
```

（`Any` 已在该文件 import；用 `Any` 避免 context→user_store 的编译期依赖。）

- [ ] **Step 5: 修改 app.py**

5a. 文件顶部 import 区（`from .queue import ...` 附近）追加：

```python
import os

from .auth_gate import install_auth_gate
from .user_store import UserStore
```

（若 `import os` 已存在则跳过。）

5b. 模块级新增（`create_app` 定义之前）：

```python
def _env_server_mode() -> bool:
    return os.environ.get("CONJURE_SERVER_MODE", "").strip().lower() in {"1", "true", "yes", "on"}
```

5c. `create_app` 签名（app.py:188）在 `auto_retry: bool = False,` 之后加：

```python
    server_mode: bool | None = None,
) -> FastAPI:
```

5d. 函数体内，`auth_settings = AuthSettings(Path(auth_settings_path))` 一行**之后**插入：

```python
    resolved_server_mode = _env_server_mode() if server_mode is None else bool(server_mode)
    user_store = UserStore(source_data_path / "users.db") if resolved_server_mode else None
    if resolved_server_mode:
        auth_settings.write_source("api")
```

5e. `ctx = WebUIContext(` 的字段列表末尾（`auto_start_queue=auto_start_queue,` 之后）加：

```python
        server_mode=resolved_server_mode,
        user_store=user_store,
```

5f. `register_webui_routes(app, ctx)`（app.py:374 附近）**之后**插入：

```python
    if resolved_server_mode:
        install_auth_gate(app, user_store)
```

- [ ] **Step 6: 运行确认通过**

Run: `python -m pytest tests/test_webui_auth_gate.py -v`
Expected: 6 项全部 PASS

- [ ] **Step 7: 跑全量回归**

Run: `python -m pytest tests/ -x -q`
Expected: 全部 PASS（单机模式零变化）

- [ ] **Step 8: Commit**

```bash
git add codex_image/webui/auth_gate.py codex_image/webui/context.py codex_image/webui/app.py tests/test_webui_auth_gate.py
git commit -m "Add server mode flag and session auth gate middleware

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 认证与账号管理 API

**Files:**
- Create: `codex_image/webui/routes/accounts.py`
- Modify: `codex_image/webui/app.py`（服务器模式下注册账号路由）
- Test: `tests/test_webui_accounts_api.py`

**Interfaces:**
- Consumes: Task 1 `UserStore`/`UserStoreError`/`MIN_PASSWORD_LENGTH`/`SESSION_TTL_SECONDS`；Task 2 `SESSION_COOKIE`、`request.state.user`。
- Produces（Phase 3 管理页与前端将调用）:
  - `POST /api/auth/login` `{username, password}` → 200 `{username, role, must_change_password}` + 设 cookie；错误 401
  - `POST /api/auth/logout` → 200 `{ok: true}` + 清 cookie
  - `GET /api/auth/me` → `{username, role, must_change_password}`
  - `POST /api/auth/password` `{old_password, new_password}` → 200 `{ok: true}` + 新 cookie；旧密码错 400
  - `GET /api/admin/users` → `{users: [{username, role, disabled, must_change_password, created_at}]}`（仅 admin）
  - `POST /api/admin/users` `{username, password, role?}` → 200 用户对象（仅 admin；错误 400）
  - `POST /api/admin/users/{username}/reset-password` `{password}` → `{ok: true}`（仅 admin）
  - `POST /api/admin/users/{username}/disabled` `{disabled: bool}` → `{ok: true}`（仅 admin；不能停用自己，400）
  - `register_account_routes(app: FastAPI, ctx: WebUIContext) -> None`

- [ ] **Step 1: 写失败测试**

`tests/test_webui_accounts_api.py`（复用 Task 2 测试文件里的 `make_app`/`user_db_path`，抽到本文件顶部重复定义即可，保持测试文件自包含）：

```python
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from codex_image.webui.app import create_app
from codex_image.webui.user_store import UserStore


def make_app(tmp_path, *, server_mode: bool = True):
    return create_app(
        output_root=tmp_path / "output",
        webui_settings_path=tmp_path / "webui-settings.json",
        auth_settings_path=tmp_path / "auth-settings.json",
        api_settings_path=tmp_path / "api-settings.json",
        color_settings_path=tmp_path / "color-settings.json",
        prompt_snippets_path=tmp_path / "prompt-snippets.json",
        prompt_templates_path=tmp_path / "prompt-templates.json",
        client_factory=lambda: None,
        auth_checker=lambda: True,
        auto_start_queue=False,
        server_mode=server_mode,
    )


@pytest.fixture()
def env(tmp_path):
    app = make_app(tmp_path)
    store = UserStore(tmp_path / "output" / "webui-source-data" / "users.db")
    store.create_user("admin", "adminpass1", role="admin", must_change_password=False)
    store.create_user("alice", "alicepass1", must_change_password=False)
    return TestClient(app), store


def login(client, username, password):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_login_success_sets_cookie_and_me(env):
    client, _ = env
    response = login(client, "alice", "alicepass1")
    assert response.status_code == 200
    assert response.json()["username"] == "alice"
    assert "conjure_session" in response.cookies
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["role"] == "user"


def test_login_wrong_password_401(env):
    client, _ = env
    assert login(client, "alice", "wrong-pass").status_code == 401


def test_logout_revokes_session(env):
    client, _ = env
    login(client, "alice", "alicepass1")
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_change_password_rotates_session(env):
    client, store = env
    login(client, "alice", "alicepass1")
    bad = client.post("/api/auth/password", json={"old_password": "nope", "new_password": "newpass123"})
    assert bad.status_code == 400
    good = client.post("/api/auth/password", json={"old_password": "alicepass1", "new_password": "newpass123"})
    assert good.status_code == 200
    assert client.get("/api/auth/me").status_code == 200  # new cookie works
    assert store.authenticate("alice", "newpass123") is not None


def test_admin_endpoints_require_admin(env):
    client, _ = env
    login(client, "alice", "alicepass1")
    assert client.get("/api/admin/users").status_code == 403
    assert client.post("/api/admin/users", json={"username": "bob", "password": "bobpass123"}).status_code == 403


def test_admin_creates_lists_resets_disables(env):
    client, store = env
    login(client, "admin", "adminpass1")
    created = client.post("/api/admin/users", json={"username": "bob", "password": "bobpass123"})
    assert created.status_code == 200
    assert created.json()["must_change_password"] is True
    names = [u["username"] for u in client.get("/api/admin/users").json()["users"]]
    assert "bob" in names
    assert client.post("/api/admin/users/bob/reset-password", json={"password": "bobreset99"}).status_code == 200
    assert store.authenticate("bob", "bobreset99").must_change_password is True
    assert client.post("/api/admin/users/bob/disabled", json={"disabled": True}).status_code == 200
    assert store.authenticate("bob", "bobreset99") is None
    assert client.post("/api/admin/users/admin/disabled", json={"disabled": True}).status_code == 400


def test_duplicate_user_400(env):
    client, _ = env
    login(client, "admin", "adminpass1")
    assert client.post("/api/admin/users", json={"username": "alice", "password": "whatever123"}).status_code == 400
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_webui_accounts_api.py -v`
Expected: FAIL — `/api/auth/login` 返回 404（路由不存在）

- [ ] **Step 3: 实现 routes/accounts.py**

```python
from __future__ import annotations

from typing import Any

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from codex_image.webui.auth_gate import SESSION_COOKIE
from codex_image.webui.context import WebUIContext
from codex_image.webui.user_store import (
    SESSION_TTL_SECONDS,
    UserRecord,
    UserStoreError,
)


def _user_payload(user: UserRecord) -> dict[str, Any]:
    return {
        "username": user.username,
        "role": user.role,
        "disabled": user.disabled,
        "must_change_password": user.must_change_password,
        "created_at": user.created_at,
    }


def register_account_routes(app: FastAPI, ctx: WebUIContext) -> None:
    store = ctx.user_store
    if store is None:
        raise RuntimeError("account routes require server mode with a user store")

    def _current_user(request: Request) -> UserRecord:
        user = getattr(request.state, "user", None)
        if user is None:
            raise HTTPException(status_code=401, detail="authentication required")
        return user

    def _require_admin(request: Request) -> UserRecord:
        user = _current_user(request)
        if not user.is_admin:
            raise HTTPException(status_code=403, detail="admin required")
        return user

    def _set_session_cookie(response: JSONResponse, token: str) -> None:
        response.set_cookie(
            SESSION_COOKIE,
            token,
            httponly=True,
            samesite="lax",
            max_age=SESSION_TTL_SECONDS,
            path="/",
        )

    @app.post("/api/auth/login")
    def auth_login(payload: dict[str, Any] = Body(...)) -> JSONResponse:
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "")
        user = store.authenticate(username, password)
        if user is None:
            raise HTTPException(status_code=401, detail="invalid username or password")
        token = store.create_session(user.username)
        response = JSONResponse(
            {
                "username": user.username,
                "role": user.role,
                "must_change_password": user.must_change_password,
            }
        )
        _set_session_cookie(response, token)
        return response

    @app.post("/api/auth/logout")
    def auth_logout(request: Request) -> JSONResponse:
        token = request.cookies.get(SESSION_COOKIE, "")
        if token:
            store.revoke_session(token)
        response = JSONResponse({"ok": True})
        response.delete_cookie(SESSION_COOKIE, path="/")
        return response

    @app.get("/api/auth/me")
    def auth_me(request: Request) -> dict[str, Any]:
        user = _current_user(request)
        return {
            "username": user.username,
            "role": user.role,
            "must_change_password": user.must_change_password,
        }

    @app.post("/api/auth/password")
    def auth_change_password(request: Request, payload: dict[str, Any] = Body(...)) -> JSONResponse:
        user = _current_user(request)
        old_password = str(payload.get("old_password") or "")
        new_password = str(payload.get("new_password") or "")
        try:
            changed = store.change_password(user.username, old_password, new_password)
        except UserStoreError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if not changed:
            raise HTTPException(status_code=400, detail="old password is incorrect")
        token = store.create_session(user.username)
        response = JSONResponse({"ok": True})
        _set_session_cookie(response, token)
        return response

    @app.get("/api/admin/users")
    def admin_list_users(request: Request) -> dict[str, Any]:
        _require_admin(request)
        return {"users": [_user_payload(user) for user in store.list_users()]}

    @app.post("/api/admin/users")
    def admin_create_user(request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        _require_admin(request)
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "")
        role = str(payload.get("role") or "user").strip() or "user"
        try:
            user = store.create_user(username, password, role=role, must_change_password=True)
        except UserStoreError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return _user_payload(user)

    @app.post("/api/admin/users/{username}/reset-password")
    def admin_reset_password(request: Request, username: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        _require_admin(request)
        try:
            store.reset_password(username, str(payload.get("password") or ""))
        except UserStoreError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True}

    @app.post("/api/admin/users/{username}/disabled")
    def admin_set_disabled(request: Request, username: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        admin = _require_admin(request)
        disabled = bool(payload.get("disabled"))
        if disabled and username.strip() == admin.username:
            raise HTTPException(status_code=400, detail="cannot disable your own account")
        try:
            store.set_disabled(username, disabled)
        except UserStoreError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"ok": True}
```

- [ ] **Step 4: 在 app.py 注册**

Task 2 Step 5f 插入的代码块改为：

```python
    if resolved_server_mode:
        from .routes.accounts import register_account_routes

        register_account_routes(app, ctx)
        install_auth_gate(app, user_store)
```

（延迟 import 避免模块加载环；`routes/__init__.py` 不需要改动。）

- [ ] **Step 5: 运行确认通过**

Run: `python -m pytest tests/test_webui_accounts_api.py tests/test_webui_auth_gate.py -v`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add codex_image/webui/routes/accounts.py codex_image/webui/app.py tests/test_webui_accounts_api.py
git commit -m "Add auth and admin account management API for server mode

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 服务器模式禁用 Codex 通道

**Files:**
- Modify: `codex_image/webui/routes/settings.py:273-278`（`PATCH /api/auth`）
- Test: `tests/test_webui_auth_gate.py`（追加两个用例）

**Interfaces:**
- Consumes: Task 2 的 `ctx.server_mode`；`create_app` 启动时已强制 `auth_settings.write_source("api")`（Task 2 Step 5d）。
- Produces: 服务器模式下 `PATCH /api/auth {"source": "codex"}` → 403。

- [ ] **Step 1: 追加失败测试**

在 `tests/test_webui_auth_gate.py` 末尾追加：

```python
def test_server_mode_rejects_codex_source(tmp_path):
    app = make_app(tmp_path, server_mode=True)
    store = UserStore(user_db_path(tmp_path))
    store.create_user("admin", "adminpass1", role="admin", must_change_password=False)
    token = store.create_session("admin")
    client = TestClient(app)
    client.cookies.set("conjure_session", token)
    assert client.patch("/api/auth", json={"source": "codex"}).status_code == 403
    assert client.patch("/api/auth", json={"source": "api"}).status_code == 200


def test_server_mode_forces_api_source_at_startup(tmp_path):
    import json

    (tmp_path / "auth-settings.json").write_text(json.dumps({"source": "codex"}), encoding="utf-8")
    make_app(tmp_path, server_mode=True)
    saved = json.loads((tmp_path / "auth-settings.json").read_text(encoding="utf-8"))
    assert saved["source"] == "api"
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_webui_auth_gate.py -v`
Expected: `test_server_mode_rejects_codex_source` FAIL（当前返回 200）

- [ ] **Step 3: 修改 settings.py**

`routes/settings.py` 的 `update_auth`（273 行附近），在 `if source not in AUTH_SOURCES:` 校验之后插入：

```python
        if getattr(ctx, "server_mode", False) and source == "codex":
            raise HTTPException(status_code=403, detail="codex auth is disabled in server mode")
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_webui_auth_gate.py -v`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add codex_image/webui/routes/settings.py tests/test_webui_auth_gate.py
git commit -m "Reject codex auth source in server mode

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 登录页与退出入口

**Files:**
- Create: `codex_image/webui/static/login.html`
- Modify: `codex_image/webui/routes/accounts.py`（追加 `GET /login`、`GET /logout`）
- Test: `tests/test_webui_login_page.py`

**Interfaces:**
- Consumes: Task 3 的 `/api/auth/login`、`/api/auth/password`；Task 2 的公开路径 `/login`。
- Produces: `GET /login` 返回登录页 HTML；`GET /logout` 吊销会话并 302 到 `/login`。

- [ ] **Step 1: 写失败测试**

`tests/test_webui_login_page.py`（`make_app`/`user_db_path` 与 Task 2 测试文件相同，自包含复制）：

```python
from __future__ import annotations

from fastapi.testclient import TestClient

from codex_image.webui.app import create_app
from codex_image.webui.user_store import UserStore


def make_app(tmp_path, *, server_mode: bool = True):
    return create_app(
        output_root=tmp_path / "output",
        webui_settings_path=tmp_path / "webui-settings.json",
        auth_settings_path=tmp_path / "auth-settings.json",
        api_settings_path=tmp_path / "api-settings.json",
        color_settings_path=tmp_path / "color-settings.json",
        prompt_snippets_path=tmp_path / "prompt-snippets.json",
        prompt_templates_path=tmp_path / "prompt-templates.json",
        client_factory=lambda: None,
        auth_checker=lambda: True,
        auto_start_queue=False,
        server_mode=server_mode,
    )


def test_login_page_served_without_session(tmp_path):
    client = TestClient(make_app(tmp_path))
    response = client.get("/login")
    assert response.status_code == 200
    assert 'id="login-form"' in response.text


def test_logout_redirects_and_revokes(tmp_path):
    app = make_app(tmp_path)
    store = UserStore(tmp_path / "output" / "webui-source-data" / "users.db")
    store.create_user("alice", "alicepass1", must_change_password=False)
    client = TestClient(app)
    client.post("/api/auth/login", json={"username": "alice", "password": "alicepass1"})
    response = client.get("/logout", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"] == "/login"
    assert client.get("/api/auth/me").status_code == 401


def test_local_mode_has_no_login_page(tmp_path):
    client = TestClient(make_app(tmp_path, server_mode=False))
    assert client.get("/login").status_code == 404
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_webui_login_page.py -v`
Expected: 前两项 FAIL（404）

- [ ] **Step 3: 创建 login.html**

`codex_image/webui/static/login.html`（自包含，无外部依赖）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>登录 · iLab GPT Conjure</title>
<style>
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
         background: #0f172a; color: #e2e8f0; }
  .card { background: #1e293b; border-radius: 12px; padding: 32px; width: 320px;
          box-shadow: 0 8px 32px rgba(0,0,0,.4); }
  h1 { font-size: 18px; margin: 0 0 20px; text-align: center; }
  label { display: block; font-size: 13px; margin: 12px 0 4px; color: #94a3b8; }
  input { width: 100%; box-sizing: border-box; padding: 10px; border-radius: 8px;
          border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 14px; }
  button { width: 100%; margin-top: 20px; padding: 10px; border: 0; border-radius: 8px;
           background: #0ea5e9; color: #fff; font-size: 14px; cursor: pointer; }
  button:hover { background: #0284c7; }
  .error { color: #f87171; font-size: 13px; margin-top: 12px; min-height: 18px; text-align: center; }
  .hidden { display: none; }
</style>
</head>
<body>
<div class="card">
  <h1>iLab GPT Conjure</h1>
  <form id="login-form">
    <label for="username">用户名</label>
    <input id="username" name="username" autocomplete="username" required>
    <label for="password">密码</label>
    <input id="password" name="password" type="password" autocomplete="current-password" required>
    <button type="submit">登录</button>
    <div class="error" id="login-error"></div>
  </form>
  <form id="change-form" class="hidden">
    <p style="font-size:13px;color:#94a3b8">首次登录请设置新密码</p>
    <label for="new-password">新密码（至少 8 位）</label>
    <input id="new-password" type="password" autocomplete="new-password" minlength="8" required>
    <button type="submit">设置新密码并进入</button>
    <div class="error" id="change-error"></div>
  </form>
</div>
<script>
  const loginForm = document.getElementById("login-form");
  const changeForm = document.getElementById("change-form");
  let loginPassword = "";

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    document.getElementById("login-error").textContent = "";
    loginPassword = document.getElementById("password").value;
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: document.getElementById("username").value,
        password: loginPassword,
      }),
    });
    if (!response.ok) {
      document.getElementById("login-error").textContent = "用户名或密码错误";
      return;
    }
    const data = await response.json();
    if (data.must_change_password) {
      loginForm.classList.add("hidden");
      changeForm.classList.remove("hidden");
      return;
    }
    location.href = "/";
  });

  changeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    document.getElementById("change-error").textContent = "";
    const response = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        old_password: loginPassword,
        new_password: document.getElementById("new-password").value,
      }),
    });
    if (!response.ok) {
      document.getElementById("change-error").textContent = "修改失败，请检查新密码";
      return;
    }
    location.href = "/";
  });
</script>
</body>
</html>
```

- [ ] **Step 4: 在 accounts.py 追加页面路由**

`register_account_routes` 函数末尾追加（import 区加 `from pathlib import Path` 与 `from fastapi.responses import FileResponse, RedirectResponse`）：

```python
    login_page_path = Path(__file__).parent.parent / "static" / "login.html"

    @app.get("/login")
    def login_page() -> FileResponse:
        return FileResponse(login_page_path, media_type="text/html")

    @app.get("/logout")
    def logout_page(request: Request) -> RedirectResponse:
        token = request.cookies.get(SESSION_COOKIE, "")
        if token:
            store.revoke_session(token)
        response = RedirectResponse("/login", status_code=302)
        response.delete_cookie(SESSION_COOKIE, path="/")
        return response
```

- [ ] **Step 5: 运行确认通过 + 全量回归**

Run: `python -m pytest tests/test_webui_login_page.py -v && python -m pytest tests/ -q`
Expected: 全部 PASS。若 `tests/test_webui_static_build.py` 因静态文件清单校验失败，把 `login.html` 加入该测试的清单列表后重跑。

- [ ] **Step 6: Commit**

```bash
git add codex_image/webui/static/login.html codex_image/webui/routes/accounts.py tests/test_webui_login_page.py
git commit -m "Add login page and logout route for server mode

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 管理员引导 CLI 与文档

**Files:**
- Create: `codex_image/webui/user_admin.py`
- Modify: `README.md`（新增"服务器模式（实验性）"小节）
- Test: `tests/test_webui_user_admin_cli.py`

**Interfaces:**
- Consumes: Task 1 `UserStore`。
- Produces: `python -m codex_image.webui.user_admin --db <path> create-admin --username X --password Y`；`reset-password` 子命令；`main(argv) -> int`（0 成功 / 1 失败）。

- [ ] **Step 1: 写失败测试**

`tests/test_webui_user_admin_cli.py`：

```python
from __future__ import annotations

from codex_image.webui.user_admin import main
from codex_image.webui.user_store import UserStore


def test_create_admin_and_reset(tmp_path, capsys):
    db = tmp_path / "users.db"
    assert main(["--db", str(db), "create-admin", "--username", "boss", "--password", "bosspass99"]) == 0
    store = UserStore(db)
    user = store.authenticate("boss", "bosspass99")
    assert user is not None and user.is_admin and not user.must_change_password

    assert main(["--db", str(db), "reset-password", "--username", "boss", "--password", "newpass123"]) == 0
    assert store.authenticate("boss", "newpass123").must_change_password is True


def test_duplicate_admin_fails(tmp_path):
    db = tmp_path / "users.db"
    argv = ["--db", str(db), "create-admin", "--username", "boss", "--password", "bosspass99"]
    assert main(argv) == 0
    assert main(argv) == 1
```

- [ ] **Step 2: 运行确认失败**

Run: `python -m pytest tests/test_webui_user_admin_cli.py -v`
Expected: FAIL — `ModuleNotFoundError`

- [ ] **Step 3: 实现 user_admin.py**

```python
from __future__ import annotations

import argparse
import getpass
from pathlib import Path

from codex_image.webui.user_store import UserStore, UserStoreError


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Manage server-mode user accounts.")
    parser.add_argument("--db", required=True, help="Path to users.db under the source data root")
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create-admin", help="Create an administrator account")
    create.add_argument("--username", required=True)
    create.add_argument("--password", default="", help="Omit to be prompted interactively")

    reset = sub.add_parser("reset-password", help="Reset a user's password")
    reset.add_argument("--username", required=True)
    reset.add_argument("--password", default="", help="Omit to be prompted interactively")

    args = parser.parse_args(argv)
    store = UserStore(Path(args.db))
    password = args.password or getpass.getpass("Password: ")
    try:
        if args.command == "create-admin":
            store.create_user(args.username, password, role="admin", must_change_password=False)
            print(f"admin '{args.username}' created")
        else:
            store.reset_password(args.username, password)
            print(f"password reset for '{args.username}' (must change at next login)")
    except UserStoreError as exc:
        print(f"error: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: 运行确认通过**

Run: `python -m pytest tests/test_webui_user_admin_cli.py -v`
Expected: 2 项 PASS

- [ ] **Step 5: README 增补**

`README.md` 的"认证模式"章节之后新增：

```markdown
### 实验性：服务器多用户模式

设置环境变量 `CONJURE_SERVER_MODE=1` 启动后，WebUI 要求用户名密码登录，
Codex 通道自动禁用（仅 OpenAI 兼容 API）。首个管理员账号用 CLI 创建：

​```bash
python -m codex_image.webui.user_admin --db output/webui-source-data/users.db \
  create-admin --username admin
CONJURE_SERVER_MODE=1 python -m uvicorn codex_image.webui.app:app --host 0.0.0.0 --port 8787
​```

管理员在登录后可通过 `/api/admin/users` 接口创建用户（管理页面开发中）。
当前阶段各用户仍共享同一份数据，按用户隔离在后续版本提供；生产部署
请等待数据分区功能完成。
```

（注意去掉代码块前的零宽字符 `​`——此处仅为嵌套转义。）

- [ ] **Step 6: 全量回归 + Commit**

Run: `python -m pytest tests/ -q`
Expected: 全部 PASS

```bash
git add codex_image/webui/user_admin.py tests/test_webui_user_admin_cli.py README.md
git commit -m "Add admin bootstrap CLI and server mode docs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review 结论

- **Spec 覆盖**：登录 ✓（Task 2/3/5）、用户改密 ✓（Task 3/5）、管理员建号/重置/停用 ✓（Task 3/6）、服务器模式禁用 Codex ✓（Task 4）、单机模式零变化 ✓（每任务回归）。数据按用户分区、共享资产、部门供应商、用量归因、Docker Compose 均为后续 Phase 2-4 规划，不在本计划内。
- **占位符扫描**：无 TBD/TODO；所有步骤含完整代码。两处条件性指令（source-data 子目录常量核对、static_build 清单）给出了精确的检查命令与处置动作。
- **类型一致性**：`SESSION_COOKIE`、`UserRecord` 字段、路由路径与响应结构在 Task 1/2/3/5 间已核对一致；`create_session(username, *, ttl_seconds)` 签名在测试与实现中一致。

## 后续阶段（各自独立成计划）

- **Phase 2**：数据按用户分区（`data/users/<用户>/` 布局、按用户实例化存储上下文、队列任务归属用户）。
- **Phase 3**：共享资产（共享图库/模板/片段）、部门供应商（Key 隐藏、全局并发、按用户用量归因）、管理页 UI（账号管理 + 用量汇总）、SPA 前端集成（401 跳转、退出按钮）。
- **Phase 4**：Docker Compose 部署（Dockerfile、compose、数据卷、可选 Caddy HTTPS）、API Key 静态加密。
