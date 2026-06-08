from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from .auth import AuthState, decode_jwt_claims

DEFAULT_COCKPIT_HOME = Path.home() / ".antigravity_cockpit"
CODEX_ACCOUNTS_INDEX = "codex_accounts.json"
CODEX_ACCOUNTS_DIR = "codex_accounts"


class CockpitAuthProvider:
    """Read Codex OAuth access tokens from Cockpit Tools' account store.

    This provider intentionally does not refresh or write tokens. Cockpit Tools
    owns the rotating refresh token; this app only consumes current access
    tokens and re-reads files when an upstream request reports 401.
    """

    def __init__(self, *, root: str | Path | None = None) -> None:
        self.root = Path(root) if root is not None else DEFAULT_COCKPIT_HOME
        self.index_path = self.root / CODEX_ACCOUNTS_INDEX
        self.accounts_dir = self.root / CODEX_ACCOUNTS_DIR
        self._cursor = 0

    def has_auth(self) -> bool:
        return bool(self._load_auth_states())

    def available_count(self) -> int:
        return len(self._load_auth_states())

    def list_auth_states(self) -> list[AuthState]:
        return self._load_auth_states()

    def auth_state_for_account_file_id(self, account_file_id: str) -> AuthState:
        if not _is_safe_account_file_id(account_file_id):
            raise ValueError("Invalid Cockpit account file id")
        state = self._load_account_state(account_file_id)
        if state is None:
            raise FileNotFoundError(account_file_id)
        return state

    def next_auth_state(self) -> AuthState:
        states = self._load_auth_states()
        if not states:
            raise RuntimeError(f"No usable Cockpit Codex OAuth accounts found in {self.root}")
        state = states[self._cursor % len(states)]
        self._cursor += 1
        return state

    def next_auth_state_after_unauthorized(self, current_state: AuthState) -> AuthState | None:
        states = self._load_auth_states()
        if not states:
            return None

        for state in states:
            if state.path == current_state.path and state.access_token != current_state.access_token:
                return state

        for _ in range(len(states)):
            candidate = self.next_auth_state()
            if candidate.path != current_state.path or candidate.access_token != current_state.access_token:
                return candidate
        return None

    def _load_auth_states(self) -> list[AuthState]:
        account_file_ids = self._account_file_ids()
        states: list[AuthState] = []
        for account_file_id in account_file_ids:
            state = self._load_account_state(account_file_id)
            if state is not None:
                states.append(state)
        return states

    def _account_file_ids(self) -> list[str]:
        index = self._read_json(self.index_path)
        ids: list[str] = []
        current_id = ""
        if isinstance(index, dict):
            current_id = str(index.get("current_account_id") or "")
            accounts = index.get("accounts")
            if isinstance(accounts, list):
                for account in accounts:
                    if isinstance(account, dict):
                        ids.append(str(account.get("id") or ""))

        if not ids and self.accounts_dir.exists():
            ids = [path.stem for path in sorted(self.accounts_dir.glob("*.json"))]

        ordered = [current_id] if current_id else []
        ordered.extend(ids)
        return _dedupe_safe_file_ids(ordered)

    def _load_account_state(self, account_file_id: str) -> AuthState | None:
        path = self.accounts_dir / f"{account_file_id}.json"
        payload = self._read_json(path)
        if not isinstance(payload, dict):
            return None

        auth_mode = str(payload.get("auth_mode") or "oauth")
        if auth_mode != "oauth":
            return None
        if bool(payload.get("requires_reauth")):
            return None

        tokens = payload.get("tokens")
        if not isinstance(tokens, dict):
            return None
        access_token = str(tokens.get("access_token") or "")
        refresh_token = str(tokens.get("refresh_token") or "")
        if not access_token:
            return None
        if not refresh_token:
            return None
        if not _access_token_is_current(access_token):
            return None

        raw = dict(payload)
        raw["_cockpit_account_file_id"] = account_file_id
        return AuthState(
            path=path,
            access_token=access_token,
            refresh_token=refresh_token,
            id_token=str(tokens.get("id_token") or ""),
            account_id=str(payload.get("account_id") or tokens.get("account_id") or ""),
            last_refresh=str(payload.get("token_updated_at") or payload.get("last_used") or ""),
            raw=raw,
        )

    @staticmethod
    def _read_json(path: Path) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return None


def _dedupe_safe_file_ids(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        clean = str(value or "")
        if clean in seen:
            continue
        if not _is_safe_account_file_id(clean):
            continue
        seen.add(clean)
        result.append(clean)
    return result


def _is_safe_account_file_id(value: str) -> bool:
    if value in {"", ".", ".."}:
        return False
    if value != value.strip():
        return False
    if "/" in value or "\\" in value:
        return False
    return not any(ord(ch) < 32 for ch in value)


def _access_token_is_current(access_token: str) -> bool:
    claims = decode_jwt_claims(access_token)
    if not claims:
        return True

    exp = claims.get("exp")
    if isinstance(exp, (int, float)) and exp <= time.time():
        return False

    return True
