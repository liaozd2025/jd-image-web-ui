from __future__ import annotations

import base64
import binascii
import hmac
import secrets

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .database import PostgresConnections


MASTER_KEY_CHECK_LOCK_ID = 5_322_114_907
MASTER_KEY_CHECK_PLAINTEXT = b"jd-image-master-key-valid"
MASTER_KEY_CHECK_AAD = b"jd-image-master-key-check:v1"
ENCRYPTION_SCHEME = "aesgcm-v1"


class MasterKeyError(ValueError):
    pass


class MasterKeyMismatch(RuntimeError):
    pass


class ProviderSecretCipher:
    def __init__(self, key: bytes) -> None:
        if len(key) != 32:
            raise MasterKeyError("JD_IMAGE_MASTER_KEY must decode to exactly 32 bytes")
        self._cipher = AESGCM(key)

    @classmethod
    def from_encoded_key(cls, encoded_key: str) -> "ProviderSecretCipher":
        try:
            key = _decode_base64(encoded_key.strip())
        except (binascii.Error, ValueError) as error:
            raise MasterKeyError("JD_IMAGE_MASTER_KEY must be URL-safe base64") from error
        return cls(key)

    def ensure_database_key(self, connections: PostgresConnections) -> None:
        with connections.connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_xact_lock(%s)", (MASTER_KEY_CHECK_LOCK_ID,))
                cursor.execute(
                    "SELECT check_ciphertext FROM server_master_key_state WHERE singleton = 1"
                )
                row = cursor.fetchone()
                if row is None:
                    cursor.execute(
                        """
                        INSERT INTO server_master_key_state (singleton, check_ciphertext)
                        VALUES (1, %s)
                        """,
                        (self._encrypt(MASTER_KEY_CHECK_PLAINTEXT, MASTER_KEY_CHECK_AAD),),
                    )
                    return
                plaintext = self._decrypt(row[0], MASTER_KEY_CHECK_AAD)
                if not hmac.compare_digest(plaintext, MASTER_KEY_CHECK_PLAINTEXT):
                    raise MasterKeyMismatch("JD_IMAGE_MASTER_KEY does not match this database")

    def encrypt_personal_api_key(
        self,
        *,
        user_id: str,
        provider_version_id: str,
        api_key: str,
    ) -> str:
        return self._encrypt(
            api_key.encode("utf-8"),
            _personal_key_aad(user_id, provider_version_id),
        )

    def decrypt_personal_api_key(
        self,
        *,
        user_id: str,
        provider_version_id: str,
        encrypted_value: str,
    ) -> str:
        plaintext = self._decrypt(
            encrypted_value,
            _personal_key_aad(user_id, provider_version_id),
        )
        return plaintext.decode("utf-8")

    def encrypt_department_api_key(self, *, provider_version_id: str, api_key: str) -> str:
        return self._encrypt(
            api_key.encode("utf-8"),
            _department_key_aad(provider_version_id),
        )

    def decrypt_department_api_key(self, *, provider_version_id: str, encrypted_value: str) -> str:
        plaintext = self._decrypt(
            encrypted_value,
            _department_key_aad(provider_version_id),
        )
        return plaintext.decode("utf-8")

    def _encrypt(self, plaintext: bytes, associated_data: bytes) -> str:
        nonce = secrets.token_bytes(12)
        ciphertext = self._cipher.encrypt(nonce, plaintext, associated_data)
        return f"{ENCRYPTION_SCHEME}${_encode_base64(nonce)}${_encode_base64(ciphertext)}"

    def _decrypt(self, envelope: str, associated_data: bytes) -> bytes:
        try:
            scheme, encoded_nonce, encoded_ciphertext = envelope.split("$", 2)
            if scheme != ENCRYPTION_SCHEME:
                raise ValueError("unsupported encryption scheme")
            nonce = _decode_base64(encoded_nonce)
            ciphertext = _decode_base64(encoded_ciphertext)
            return self._cipher.decrypt(nonce, ciphertext, associated_data)
        except (InvalidTag, ValueError, binascii.Error) as error:
            raise MasterKeyMismatch(
                "JD_IMAGE_MASTER_KEY does not match encrypted server data"
            ) from error


def _personal_key_aad(user_id: str, provider_version_id: str) -> bytes:
    return f"personal-provider-key:v1:{user_id}:{provider_version_id}".encode("utf-8")


def _department_key_aad(provider_version_id: str) -> bytes:
    return f"department-provider-key:v1:{provider_version_id}".encode("utf-8")


def _encode_base64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode_base64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
