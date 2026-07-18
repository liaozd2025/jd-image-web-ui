from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets


USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{2,64}$")
PASSWORD_SCHEME = "scrypt-v1"
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 1024


class CredentialValidationError(ValueError):
    pass


def normalize_username(username: str) -> tuple[str, str]:
    display_name = username.strip()
    if not USERNAME_PATTERN.fullmatch(display_name):
        raise CredentialValidationError(
            "username must be 2-64 characters using letters, numbers, dot, underscore or hyphen"
        )
    return display_name, display_name.casefold()


def new_temporary_password() -> str:
    return secrets.token_urlsafe(18)


def validate_new_password(password: str) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise CredentialValidationError(
            f"password must contain at least {MIN_PASSWORD_LENGTH} characters"
        )
    if len(password) > MAX_PASSWORD_LENGTH:
        raise CredentialValidationError("password is too long")


def hash_password(password: str) -> str:
    validate_new_password(password)
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=32,
    )
    encoded_salt = base64.urlsafe_b64encode(salt).decode("ascii").rstrip("=")
    encoded_digest = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return f"{PASSWORD_SCHEME}${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${encoded_salt}${encoded_digest}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, n_value, r_value, p_value, encoded_salt, encoded_digest = encoded.split("$")
        if scheme != PASSWORD_SCHEME:
            return False
        salt = _decode_base64(encoded_salt)
        expected = _decode_base64(encoded_digest)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n_value),
            r=int(r_value),
            p=int(p_value),
            dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def consume_dummy_password_work(password: str) -> None:
    hashlib.scrypt(
        password.encode("utf-8"),
        salt=b"jd-image-dummy!",
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=32,
    )


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _decode_base64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
