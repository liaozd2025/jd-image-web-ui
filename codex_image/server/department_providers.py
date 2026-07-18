from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from psycopg.rows import dict_row

from .audit import record_audit_event
from .database import PostgresConnections
from .provider_secrets import MasterKeyMismatch, ProviderSecretCipher
from .providers import ProviderVersionInactive, ProviderVersionNotFound


class DepartmentCredentialNotFound(RuntimeError):
    pass


class DepartmentQuotaExceeded(RuntimeError):
    pass


@dataclass(frozen=True)
class DepartmentProviderCredential:
    provider_version_id: str
    provider_key: str
    version_number: int
    display_name: str
    api_key_mask: str | None
    has_credential: bool
    is_active: bool
    provider_is_active: bool
    updated_at: str


@dataclass(frozen=True)
class DepartmentQuota:
    period_start: str
    period_end: str
    global_quota_units: int
    user_quota_units: int
    reserved_units: int
    consumed_units: int
    available_units: int


class DepartmentProviderRepository:
    def __init__(self, connections: PostgresConnections, cipher: ProviderSecretCipher) -> None:
        self.connections = connections
        self.cipher = cipher

    def list_credentials(self, *, active_only: bool = False) -> list[DepartmentProviderCredential]:
        condition = "AND credentials.is_active" if active_only else ""
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    f"""
                    SELECT credentials.provider_version_id, versions.provider_key,
                           versions.version_number, versions.display_name, credentials.api_key_mask,
                           credentials.encrypted_api_key IS NOT NULL AS has_credential,
                           credentials.is_active, versions.is_active AS provider_is_active,
                           credentials.updated_at
                    FROM department_provider_credentials AS credentials
                    JOIN provider_catalog_versions AS versions
                      ON versions.provider_version_id = credentials.provider_version_id
                    WHERE TRUE {condition}
                    ORDER BY versions.provider_key, versions.version_number
                    """
                )
                return [self._credential_from_row(row) for row in cursor.fetchall()]

    def save_credential(self, actor_user_id: str, *, provider_version_id: str, api_key: str) -> DepartmentProviderCredential:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    "SELECT provider_key, version_number, display_name, is_active FROM provider_catalog_versions WHERE provider_version_id = %s FOR UPDATE",
                    (provider_version_id,),
                )
                provider = cursor.fetchone()
                if provider is None:
                    raise ProviderVersionNotFound("provider version was not found")
                if not provider["is_active"]:
                    raise ProviderVersionInactive("provider version is inactive")
                encrypted = self.cipher.encrypt_department_api_key(
                    provider_version_id=provider_version_id,
                    api_key=api_key,
                )
                mask = _mask_api_key(api_key)
                cursor.execute(
                    """
                    INSERT INTO department_provider_credentials (
                        provider_version_id, encrypted_api_key, api_key_mask,
                        is_active, configured_by_user_id
                    ) VALUES (%s, %s, %s, TRUE, %s)
                    ON CONFLICT (provider_version_id) DO UPDATE SET
                        encrypted_api_key = EXCLUDED.encrypted_api_key,
                        api_key_mask = EXCLUDED.api_key_mask,
                        is_active = TRUE,
                        configured_by_user_id = EXCLUDED.configured_by_user_id,
                        updated_at = CURRENT_TIMESTAMP
                    RETURNING updated_at
                    """,
                    (provider_version_id, encrypted, mask, actor_user_id),
                )
                updated_at = cursor.fetchone()["updated_at"]
                record_audit_event(
                    cursor,
                    action="provider.department_credential_saved",
                    actor_user_id=actor_user_id,
                    subject_user_id=None,
                    details={"provider_version_id": provider_version_id},
                )
        return DepartmentProviderCredential(
            provider_version_id=provider_version_id,
            provider_key=provider["provider_key"],
            version_number=provider["version_number"],
            display_name=provider["display_name"],
            api_key_mask=mask,
            has_credential=True,
            is_active=True,
            provider_is_active=True,
            updated_at=updated_at.isoformat(),
        )

    def set_active(self, actor_user_id: str, *, provider_version_id: str, is_active: bool) -> DepartmentProviderCredential:
        with self.connections.connect() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    UPDATE department_provider_credentials AS credentials
                    SET is_active = %s, updated_at = CURRENT_TIMESTAMP
                    FROM provider_catalog_versions AS versions
                    WHERE credentials.provider_version_id = %s
                      AND versions.provider_version_id = credentials.provider_version_id
                    RETURNING credentials.provider_version_id, versions.provider_key,
                        versions.version_number, versions.display_name, credentials.api_key_mask,
                        credentials.encrypted_api_key IS NOT NULL AS has_credential,
                        credentials.is_active, versions.is_active AS provider_is_active,
                        credentials.updated_at
                    """,
                    (is_active, provider_version_id),
                )
                row = cursor.fetchone()
                if row is None:
                    raise DepartmentCredentialNotFound("department provider credential was not found")
                record_audit_event(
                    cursor,
                    action="provider.department_credential_activated" if is_active else "provider.department_credential_deactivated",
                    actor_user_id=actor_user_id,
                    subject_user_id=None,
                    details={"provider_version_id": provider_version_id},
                )
        return self._credential_from_row(row)

    def resolve_api_key(self, *, provider_version_id: str) -> str:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT encrypted_api_key
                    FROM department_provider_credentials AS credentials
                    JOIN provider_catalog_versions AS versions USING (provider_version_id)
                    WHERE credentials.provider_version_id = %s
                      AND credentials.is_active AND versions.is_active
                    """,
                    (provider_version_id,),
                )
                row = cursor.fetchone()
        if row is None:
            raise DepartmentCredentialNotFound("active department provider credential was not found")
        try:
            return self.cipher.decrypt_department_api_key(
                provider_version_id=provider_version_id,
                encrypted_value=row[0],
            )
        except MasterKeyMismatch as error:
            raise DepartmentCredentialNotFound("department provider credential is unavailable") from error

    def quota(self, user_id: str) -> DepartmentQuota:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT settings.period_start, settings.period_end, settings.quota_units,
                           COALESCE(user_quotas.quota_units, settings.quota_units),
                           COALESCE(usage.reserved_units, 0), COALESCE(usage.consumed_units, 0)
                    FROM department_quota_settings AS settings
                    LEFT JOIN department_user_quotas AS user_quotas ON user_quotas.user_id = %s
                    LEFT JOIN department_usage AS usage
                      ON usage.user_id = %s AND usage.period_start = settings.period_start
                    WHERE settings.singleton
                    """,
                    (user_id, user_id),
                )
                row = cursor.fetchone()
        if row is None:
            raise DepartmentQuotaExceeded("department quota settings were not initialized")
        available = max(0, min(int(row[2]), int(row[3])) - int(row[4]) - int(row[5]))
        return DepartmentQuota(
            period_start=row[0].isoformat(),
            period_end=row[1].isoformat(),
            global_quota_units=int(row[2]),
            user_quota_units=int(row[3]),
            reserved_units=int(row[4]),
            consumed_units=int(row[5]),
            available_units=available,
        )

    def reserve(self, user_id: str, units: int = 1) -> str:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT period_start, period_end, quota_units FROM department_quota_settings WHERE singleton FOR UPDATE")
                settings = cursor.fetchone()
                if settings is None:
                    raise DepartmentQuotaExceeded("department quota settings were not initialized")
                cursor.execute(
                    "SELECT quota_units FROM department_user_quotas WHERE user_id = %s",
                    (user_id,),
                )
                user_quota_row = cursor.fetchone()
                user_quota = int(user_quota_row[0]) if user_quota_row else int(settings[2])
                cursor.execute(
                    """
                    INSERT INTO department_usage (user_id, period_start, reserved_units, consumed_units)
                    VALUES (%s, %s, %s, 0)
                    ON CONFLICT (user_id, period_start) DO UPDATE SET
                        reserved_units = department_usage.reserved_units + EXCLUDED.reserved_units
                    RETURNING reserved_units, consumed_units
                    """,
                    (user_id, settings[0], units),
                )
                usage = cursor.fetchone()
                if int(usage[0]) + int(usage[1]) > min(int(settings[2]), user_quota):
                    raise DepartmentQuotaExceeded("department quota exceeded")
                return settings[0].isoformat()

    def settle(self, user_id: str, period_start: str, *, units: int = 1, consumed: bool) -> None:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE department_usage
                    SET reserved_units = GREATEST(0, reserved_units - %s),
                        consumed_units = consumed_units + %s
                    WHERE user_id = %s AND period_start = %s
                    """,
                    (units, units if consumed else 0, user_id, period_start),
                )

    def set_global_quota(self, actor_user_id: str, quota_units: int) -> DepartmentQuota:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "UPDATE department_quota_settings SET quota_units = %s, updated_at = CURRENT_TIMESTAMP WHERE singleton",
                    (quota_units,),
                )
                record_audit_event(cursor, action="quota.department_updated", actor_user_id=actor_user_id, subject_user_id=None, details={"quota_units": quota_units})
        return self.quota(actor_user_id)

    def set_user_quota(self, actor_user_id: str, user_id: str, quota_units: int) -> DepartmentQuota:
        with self.connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "INSERT INTO department_user_quotas (user_id, quota_units) VALUES (%s, %s) ON CONFLICT (user_id) DO UPDATE SET quota_units = EXCLUDED.quota_units, updated_at = CURRENT_TIMESTAMP",
                    (user_id, quota_units),
                )
                record_audit_event(cursor, action="quota.user_department_updated", actor_user_id=actor_user_id, subject_user_id=user_id, details={"quota_units": quota_units})
        return self.quota(user_id)

    @staticmethod
    def _credential_from_row(row: dict[str, Any]) -> DepartmentProviderCredential:
        updated_at = row["updated_at"]
        return DepartmentProviderCredential(
            provider_version_id=row["provider_version_id"],
            provider_key=row["provider_key"],
            version_number=int(row["version_number"]),
            display_name=row["display_name"],
            api_key_mask=row["api_key_mask"],
            has_credential=row["has_credential"],
            is_active=row["is_active"],
            provider_is_active=row["provider_is_active"],
            updated_at=updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at),
        )


def _mask_api_key(api_key: str) -> str:
    return "••••" if len(api_key) <= 4 else f"••••{api_key[-4:]}"
