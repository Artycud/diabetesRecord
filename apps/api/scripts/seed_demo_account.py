"""Seed a realistic demo persona for screenshots/presentation recording.

Why this exists: the only account with meaningful history in this deployment
was the built-in seeded admin (username="admin", role="admin") — logging in
as it for a demo screenshot simultaneously explains "Hello, Admin", a visible
Admin Console, an empty Trends chart, and a baseline that disagrees with what
the chart shows. None of that is a code bug (see bug.md's review-findings
log) — it needs a normal-looking patient account with real-shaped history
instead. This script creates exactly that: a role="patient" user, one
device, ~21 days of varied breath-check sessions (spanning multiple zones,
not clustered — same "genuine variety" principle Demo Mode's own
randomization fix uses), and a modest, believable XP/streak trail.

Run inside the api container:
    docker compose exec api python -m scripts.seed_demo_account

Idempotent: re-running skips creation if a user with USERNAME already exists
and just prints its login, so it's safe to run more than once.
"""
import asyncio
import random
from datetime import datetime, timedelta, date

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, Profile
from app.models.health import Device, SensorReading
from app.models.gamification import Streak, XPLedger
from app.services.signal_processing import classify_acetone

engine = create_async_engine(settings.DATABASE_URL, echo=False)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

USERNAME = "waranyu_k"
EMAIL = "waranyu.demo@metabreath.local"
DISPLAY_NAME = "Waranyu Kittithawornkul"
PASSWORD = "MetaBreathDemo2026!"

DAYS_OF_HISTORY = 21

# Two rough "bands" per day (fasted-morning tends higher, post-meal lower) so
# the story is coherent, not just noise — mirrors the two-band approach used
# to fix Demo Mode's own randomization earlier (see demoReading.ts) rather
# than one flat random range that clusters near a zone boundary.
MORNING_BAND_MV = (35.0, 95.0)   # mostly moderate, sometimes high (fasted)
EVENING_BAND_MV = (8.0, 40.0)    # mostly low, sometimes moderate (post-meal)


def _session_samples(base_mv: float, n: int = 7) -> list[float]:
    """A handful of per-sample values ramping toward base_mv, matching the
    shape of a real 5s recording (rises then eases) instead of flat-repeated
    identical values, which would look synthetic in the per-session chart."""
    out = []
    for i in range(n):
        frac = min(1.0, (i + 1) / (n * 0.7))
        jitter = random.uniform(-1.5, 1.5)
        out.append(max(0.0, base_mv * frac + jitter))
    return out


async def seed() -> None:
    async with Session() as db:
        existing = await db.exec(select(User).where(User.username == USERNAME))
        user = existing.first()
        if user:
            print(f"Already seeded: username={USERNAME!r} (id={user.id}) — not re-creating.")
            print(f"Login: {USERNAME} / {PASSWORD}")
            return

        user = User(email=EMAIL, username=USERNAME, hashed_password=hash_password(PASSWORD))
        db.add(user)
        await db.flush()  # user.id for FKs below

        db.add(Profile(user_id=user.id, display_name=DISPLAY_NAME, goal_type="keto"))
        db.add(Device(
            user_id=user.id,
            kind="breath",
            sensor_model="TGS1820",
            active=True,
            created_at=datetime.utcnow() - timedelta(days=DAYS_OF_HISTORY + 2),
        ))
        await db.flush()

        device_result = await db.exec(select(Device).where(Device.user_id == user.id))
        device = device_result.first()

        # ─── Breath-check history ───────────────────────────────────────
        today = datetime.utcnow().date()
        session_seq = 0
        xp_total = 0
        streak_run = 0
        longest_streak = 0
        last_active: date | None = None

        for days_ago in range(DAYS_OF_HISTORY, 0, -1):
            day = today - timedelta(days=days_ago)
            # Not every day has a check-in — a perfect unbroken streak reads
            # as fake. ~80% of days active, matching a realistic habit.
            if random.random() > 0.8:
                continue

            streak_run += 1
            longest_streak = max(longest_streak, streak_run)
            last_active = day

            sessions_today = 1 if random.random() > 0.35 else 2
            for s in range(sessions_today):
                is_morning = s == 0
                lo, hi = MORNING_BAND_MV if is_morning else EVENING_BAND_MV
                base_mv = random.uniform(lo, hi)
                hour = random.randint(6, 9) if is_morning else random.randint(17, 21)
                minute = random.randint(0, 59)
                session_start = datetime(day.year, day.month, day.day, hour, minute) + timedelta(
                    seconds=random.randint(0, 30)
                )

                session_seq += 1
                session_id = f"{USERNAME}{session_seq}"
                samples = _session_samples(base_mv)
                for i, mv in enumerate(samples):
                    cls = classify_acetone(mv, confidence=0.9)
                    reading = SensorReading(
                        time=session_start + timedelta(milliseconds=i * 700),
                        device_id=device.id,
                        user_id=user.id,
                        acetone_delta=mv,
                        ambient_voc=0.3,
                        breath_voc=0.3 + mv / 1000,
                        pressure_mean=random.uniform(3.0, 6.5),
                        pressure_std=random.uniform(0.1, 0.4),
                        breath_duration=5.0,
                        quality_score=random.uniform(78, 97),
                        reliability_score=random.uniform(75, 98),
                        confidence_score=0.9,
                        label=cls["label"],
                        metabolic_risk_index=cls["metabolic_risk_index"],
                        session_id=session_id,
                    )
                    db.add(reading)

                xp_total += 10  # CHECKIN_XP, matches gamification.py's constant
                db.add(XPLedger(
                    user_id=user.id,
                    ts=session_start,
                    delta=10,
                    reason="checkin",
                ))

        db.add(Streak(
            user_id=user.id,
            current=streak_run,
            longest=longest_streak,
            last_active_date=last_active,
        ))

        await db.commit()
        print(f"Seeded demo account: username={USERNAME!r} display_name={DISPLAY_NAME!r}")
        print(f"Login: {USERNAME} / {PASSWORD}")
        print(f"~{session_seq} sessions over {DAYS_OF_HISTORY} days, {xp_total} XP, streak {streak_run} (longest {longest_streak})")


if __name__ == "__main__":
    asyncio.run(seed())
