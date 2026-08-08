from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "metabreath",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Asia/Bangkok",
    enable_utc=True,
    beat_schedule={
        "generate-daily-quests": {
            "task": "tasks.generate_daily_quests",
            "schedule": crontab(hour=0, minute=5),
        },
        "check-reminders": {
            "task": "tasks.check_reminders",
            "schedule": 60.0,  # every 60 seconds
        },
        "check-device-drift": {
            "task": "tasks.check_device_drift",
            "schedule": crontab(minute=0, hour="*/6"),  # every 6 hours
        },
    },
)
