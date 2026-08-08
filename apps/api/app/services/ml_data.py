"""
Training-data gatekeeper.

Any code that pulls sensor_readings / ketone_logs into an ML training pipeline
MUST go through get_training_readings() (or the SQL predicate returned by
training_data_filter_sql()). This is the single choke-point that enforces:

  1. Users flagged with `exclude_from_training = TRUE` (admin/demo/sim accounts)
     never appear in training data.
  2. Rows tagged as simulated (session_id LIKE '%-sim-%', or raw->>'source'
     matches a simulated / imported marker) are excluded.
  3. Deleted/inactive users are skipped.

Current status: no training pipeline reads from the production DB — the
notebooks (train_models.py, train_lstm_trend.py) both read from CSV files
in data/processed/. This module exists so that:
  - When the pilot dataset graduates to DB-backed training, we have a
    ready-to-use safe loader.
  - Auditors can see the exclusion policy is enforced at the code level,
    not just documented in a README.
"""
from __future__ import annotations

from typing import Iterable, Optional

from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.health import SensorReading


# Marker prefixes in session_id that indicate synthetic / imported data.
# Add new prefixes here whenever you introduce a new import or simulation source.
_EXCLUDED_SESSION_PREFIXES: tuple[str, ...] = (
    "%-sim-%",         # any user-scoped simulation (e.g. sunbright-sim-01)
    "%-pilot-%",       # excel pilot import (e.g. wan-pilot-20260714)
    "demo-%",          # future demo / screenshot data
)

# Values inside sensor_readings.raw->>'source' that indicate non-organic data.
_EXCLUDED_RAW_SOURCE_MARKERS: tuple[str, ...] = (
    "simulated_",
    "excel_pilot_import",
    "demo_",
    "synthetic_",
)


def is_training_row(session_id: Optional[str], raw_source: Optional[str]) -> bool:
    """True if a single sensor_readings row should be included in ML training."""
    if session_id:
        low = session_id.lower()
        for marker in ("-sim-", "-pilot-", "demo-", "synthetic-"):
            if marker in low:
                return False
    if raw_source:
        low = raw_source.lower()
        for marker in _EXCLUDED_RAW_SOURCE_MARKERS:
            if marker in low:
                return False
    return True


async def get_training_readings(
    db: AsyncSession,
    limit: Optional[int] = None,
) -> list[SensorReading]:
    """
    Return sensor_readings that are safe to feed into an ML training pipeline.

    Filters applied:
      - reading's user is active AND exclude_from_training = FALSE
      - session_id does NOT match a simulation/import prefix
      - raw->>'source' does NOT match a synthetic/import marker
      - acetone_delta IS NOT NULL

    Ordering: chronological (oldest first) so time-series can be batched.
    """
    q = (
        select(SensorReading)
        .join(User, SensorReading.user_id == User.id)
        .where(
            User.is_active == True,  # noqa: E712 — SQLAlchemy comparison
            User.exclude_from_training == False,  # noqa: E712
            SensorReading.acetone_delta.isnot(None),
        )
        .order_by(SensorReading.time)
    )
    # Session-id + raw-source markers are applied client-side to keep the SQL
    # simple; the row count after user filtering is small enough to loop over.
    if limit is not None:
        q = q.limit(limit * 4)  # over-fetch, then post-filter, then trim

    rows = (await db.exec(q)).all()
    kept = [
        r for r in rows
        if is_training_row(r.session_id, (r.raw or {}).get("source"))
    ]
    return kept if limit is None else kept[:limit]


def training_data_filter_sql() -> str:
    """
    Return the WHERE clause fragment that ANY hand-written SQL query pulling
    training data must include. Use with .format() or f-string.

    Example:
        SELECT time, acetone_delta FROM sensor_readings sr
        JOIN users u ON u.id = sr.user_id
        WHERE {filter}
    """
    session_conds = " AND ".join(
        f"(sr.session_id IS NULL OR sr.session_id NOT LIKE '{p}')"
        for p in _EXCLUDED_SESSION_PREFIXES
    )
    source_conds = " AND ".join(
        f"(sr.raw IS NULL OR sr.raw->>'source' IS NULL "
        f"OR sr.raw->>'source' NOT LIKE '%{m}%')"
        for m in _EXCLUDED_RAW_SOURCE_MARKERS
    )
    return (
        "u.is_active = TRUE "
        "AND u.exclude_from_training = FALSE "
        "AND sr.acetone_delta IS NOT NULL "
        f"AND {session_conds} "
        f"AND {source_conds}"
    )


def excluded_usernames_snapshot() -> Iterable[str]:
    """
    For audit reports — describe what's typically excluded.
    (This is documentation, not a live query — use SELECT username FROM users
    WHERE exclude_from_training = TRUE for the current list.)
    """
    return [
        "sunbright  (admin / developer)",
        "test1      (manual test account)",
        # add as needed — always excluded regardless of flag:
        "* any user with exclude_from_training = TRUE",
        "* any row with session_id containing -sim- or -pilot- or demo-",
        "* any row with raw->>'source' containing simulated_/excel_pilot_import/demo_/synthetic_",
    ]
