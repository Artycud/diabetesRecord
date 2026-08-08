"""Session-based device sharing helpers.

A shared device (Device.is_shared=True) can be claimed by any signed-in user
via POST /device/{id}/claim. Only one DeviceSession may be `active` per
device at a time — the partial unique index on device_session enforces this.
Claim silently ends any prior active session.

Attribution rule for ingested readings:
    active session (unexpired) → session.user_id
    otherwise                  → device.user_id (owner)
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional
from uuid import UUID

from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.health import Device, DeviceSession

# Sliding TTL — a claim stays valid this long without renewal.
SESSION_TTL = timedelta(minutes=30)


async def resolve_reading_user(
    device: Device, db: AsyncSession
) -> UUID:
    """Return the user that a new reading from this device should belong to.

    Falls back to device.user_id (owner) when no unexpired active session exists.
    """
    now = datetime.utcnow()
    sess_result = await db.exec(
        select(DeviceSession)
        .where(
            DeviceSession.device_id == device.id,
            DeviceSession.active == True,  # noqa: E712
            DeviceSession.expires_at > now,
        )
    )
    session = sess_result.first()
    if session:
        return session.user_id
    return device.user_id


async def get_active_session(
    device_id: UUID, db: AsyncSession
) -> Optional[DeviceSession]:
    now = datetime.utcnow()
    result = await db.exec(
        select(DeviceSession)
        .where(
            DeviceSession.device_id == device_id,
            DeviceSession.active == True,  # noqa: E712
            DeviceSession.expires_at > now,
        )
    )
    return result.first()


async def claim_device(
    device_id: UUID, user_id: UUID, db: AsyncSession
) -> DeviceSession:
    """End any prior active session on this device, start a new one for user_id."""
    # Deactivate any existing active sessions (any user, incl. expired-but-marked-active)
    existing_result = await db.exec(
        select(DeviceSession)
        .where(
            DeviceSession.device_id == device_id,
            DeviceSession.active == True,  # noqa: E712
        )
    )
    for prior in existing_result.all():
        prior.active = False
        db.add(prior)

    now = datetime.utcnow()
    session = DeviceSession(
        device_id=device_id,
        user_id=user_id,
        started_at=now,
        expires_at=now + SESSION_TTL,
        active=True,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def release_device(
    device_id: UUID, user_id: UUID, db: AsyncSession
) -> bool:
    """End the caller's active session on this device. Returns True if one existed."""
    result = await db.exec(
        select(DeviceSession)
        .where(
            DeviceSession.device_id == device_id,
            DeviceSession.user_id == user_id,
            DeviceSession.active == True,  # noqa: E712
        )
    )
    released = False
    for session in result.all():
        session.active = False
        db.add(session)
        released = True
    if released:
        await db.commit()
    return released


async def extend_session(
    session: DeviceSession, db: AsyncSession
) -> DeviceSession:
    """Slide the expiry forward by SESSION_TTL. Call whenever the owner interacts."""
    session.expires_at = datetime.utcnow() + SESSION_TTL
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session
