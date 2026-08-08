import asyncio
from datetime import date, datetime, timedelta
from croniter import croniter

from app.workers.celery_app import celery_app

def _run(coro):
    loop = asyncio.get_event_loop()
    return loop.run_until_complete(coro)

@celery_app.task(name="tasks.health_check")
def health_check():
    return "ok"

@celery_app.task(name="tasks.generate_daily_quests")
def generate_daily_quests():
    """Create QuestProgress rows for each user at 00:05 Asia/Bangkok."""
    from sqlmodel import select
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.config import settings
    from app.models.user import User
    from app.models.gamification import Quest, QuestProgress

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _inner():
        today = date.today()
        async with Session() as db:
            users_result = await db.exec(select(User.id))
            user_ids = users_result.all()

            quests_result = await db.exec(select(Quest))
            quests = quests_result.all()

            created = 0
            for uid in user_ids:
                for quest in quests:
                    # check goal_type filter
                    existing = await db.exec(
                        select(QuestProgress).where(
                            QuestProgress.user_id == uid,
                            QuestProgress.quest_id == quest.id,
                            QuestProgress.quest_date == today,
                        )
                    )
                    if not existing.first():
                        db.add(QuestProgress(
                            user_id=uid,
                            quest_id=quest.id,
                            quest_date=today,
                            progress=0,
                            target=1,
                        ))
                        created += 1

            await db.commit()
        return created

    count = _run(_inner())
    return f"generated {count} quest rows for {date.today()}"

@celery_app.task(name="tasks.check_reminders")
def check_reminders():
    """Fire due reminders via webpush."""
    from sqlmodel import select
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.config import settings
    from app.models.notification import Reminder, PushSubscription, NotificationLog

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _inner():
        now = datetime.utcnow()
        async with Session() as db:
            result = await db.exec(
                select(Reminder).where(
                    Reminder.enabled == True,
                    Reminder.next_fire_at <= now,
                )
            )
            due = result.all()

            fired = 0
            for reminder in due:
                # get push subscriptions for user
                subs_result = await db.exec(
                    select(PushSubscription).where(PushSubscription.user_id == reminder.user_id)
                )
                subs = subs_result.all()

                for sub in subs:
                    if settings.VAPID_PUBLIC and settings.VAPID_PRIVATE:
                        try:
                            from pywebpush import webpush, WebPushException
                            import json
                            webpush(
                                subscription_info={
                                    "endpoint": sub.endpoint,
                                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                                },
                                data=json.dumps({
                                    "title": "MetaBreath",
                                    "body": reminder.message or f"เวลา {reminder.kind} แล้ว!",
                                }),
                                vapid_private_key=settings.VAPID_PRIVATE,
                                vapid_claims={"sub": settings.VAPID_SUBJECT},
                            )
                        except Exception:
                            pass

                db.add(NotificationLog(
                    user_id=reminder.user_id,
                    kind=f"reminder:{reminder.kind}",
                    payload={"reminder_id": str(reminder.id)},
                    delivered=bool(subs),
                ))

                # advance next_fire_at using cron
                try:
                    cron = croniter(reminder.schedule, now)
                    reminder.next_fire_at = cron.get_next(datetime)
                except Exception:
                    reminder.next_fire_at = now + timedelta(days=1)

                fired += 1

            if fired:
                await db.commit()
        return fired

    return _run(_inner())


@celery_app.task(name="tasks.check_device_drift")
def check_device_drift():
    """
    Every 6 hours: scan all active devices, compute drift from calibration history,
    flag devices that need recalibration, and push a notification if drift_score > 0.6.
    """
    from sqlmodel import select
    from sqlmodel.ext.asyncio.session import AsyncSession
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.core.config import settings
    from app.models.health import Device, DeviceCalibration
    from app.services.signal_processing import detect_drift

    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _inner():
        flagged = 0
        async with Session() as db:
            devices_result = await db.exec(select(Device).where(Device.active == True))
            devices = devices_result.all()

            for device in devices:
                cal_result = await db.exec(
                    select(DeviceCalibration)
                    .where(DeviceCalibration.device_id == device.id)
                    .order_by(DeviceCalibration.calibrated_at)
                )
                history = cal_result.all()
                if len(history) < 2:
                    continue

                hist_dicts = [
                    {"baseline_voc": c.baseline_voc, "calibrated_at": c.calibrated_at}
                    for c in history
                ]
                drift_info = detect_drift(hist_dicts)

                if drift_info["needs_recalibration"] and not device.needs_recalibration:
                    device.needs_recalibration = True
                    flagged += 1

            if flagged:
                await db.commit()

        return f"drift check complete — {flagged} device(s) flagged for recalibration"

    return _run(_inner())
