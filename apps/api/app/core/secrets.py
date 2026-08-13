"""
Reversible encryption-at-rest for admin-configured secrets (e.g. the global
AI fallback API keys in app.models.ai.AIProvider.api_key_encrypted) — unlike
User.hashed_password (one-way bcrypt), these need to be recoverable in
plaintext at call time to hand to the OpenAI/Gemini SDK, so a one-way hash
doesn't work here.

No dedicated encryption key is required in .env: the key is deterministically
derived from settings.JWT_SECRET (already a required, unique-per-deployment
secret) via SHA-256, base64-encoded to Fernet's expected 32-byte key format.
This avoids adding a second secret admins would need to provision/rotate
separately — rotating JWT_SECRET would also invalidate stored fallback keys,
which is an acceptable tradeoff given how rarely that rotates.
"""
import base64
import hashlib
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


def _derive_fernet_key() -> bytes:
    digest = hashlib.sha256(settings.JWT_SECRET.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


_fernet = Fernet(_derive_fernet_key())


def encrypt_secret(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt_secret(ciphertext: str) -> Optional[str]:
    """Returns None (rather than raising) on a corrupt/undecryptable value —
    callers should treat that the same as "not configured"."""
    try:
        return _fernet.decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError):
        return None
