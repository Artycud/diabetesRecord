from fastapi import APIRouter, Depends
from sqlmodel import select
from sqlalchemy import func
from typing import List

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.content import ArticleRead
from app.models.gamification import Badge, UserBadge, Quest, QuestProgress, Streak
from app.schemas.gamification import XPOut, StreakOut, BadgeOut, QuestOut, CheckinOut
from app.services.gamification import get_xp, get_streak, touch_streak, award_xp, evaluate_badges
from datetime import date, datetime

router = APIRouter(prefix="/me", tags=["gamification"])

CHECKIN_XP = 10

@router.get("/xp", response_model=XPOut)
async def my_xp(user: User = Depends(get_current_user), db=Depends(get_db)):
    return await get_xp(db, user.id)

@router.get("/streak", response_model=StreakOut)
async def my_streak(user: User = Depends(get_current_user), db=Depends(get_db)):
    return await get_streak(db, user.id)

@router.get("/badges", response_model=List[BadgeOut])
async def my_badges(user: User = Depends(get_current_user), db=Depends(get_db)):
    result = await db.exec(
        select(Badge, UserBadge.awarded_at)
        .join(UserBadge, Badge.id == UserBadge.badge_id)
        .where(UserBadge.user_id == user.id)
        .order_by(UserBadge.awarded_at.desc())
    )
    rows = result.all()
    return [
        BadgeOut(
            code=b.code, name=b.name, icon=b.icon,
            description=b.description, awarded_at=awarded_at,
        )
        for b, awarded_at in rows
    ]

@router.get("/quests/today", response_model=List[QuestOut])
async def quests_today(user: User = Depends(get_current_user), db=Depends(get_db)):
    today = date.today()
    result = await db.exec(
        select(Quest, QuestProgress)
        .outerjoin(
            QuestProgress,
            (QuestProgress.quest_id == Quest.id)
            & (QuestProgress.user_id == user.id)
            & (QuestProgress.quest_date == today),
        )
        .order_by(Quest.xp_reward.desc())
    )
    rows = result.all()
    return [
        QuestOut(
            id=q.id,
            code=q.code,
            title=q.title,
            description=q.description,
            xp_reward=q.xp_reward,
            progress=qp.progress if qp else 0,
            target=qp.target if qp else 1,
            completed_at=qp.completed_at if qp else None,
        )
        for q, qp in rows
    ]

@router.post("/checkin", response_model=CheckinOut)
async def checkin(user: User = Depends(get_current_user), db=Depends(get_db)):
    """
    Called once per completed breath-test session (real or Demo Mode —
    BreathSession.tsx's finalize() calls this unconditionally for both, so
    the check-in habit loop and its streak/XP are identical either way).

    Safe to call more than once in the same day: touch_streak() is already
    idempotent for "already active today," and XP/quest progress here are
    only awarded on the first call of the day (mirrors the ArticleRead
    existence guard in POST /articles/{slug}/complete).
    """
    today = date.today()
    existing_streak = await db.get(Streak, user.id)
    already_checked_in_today = bool(existing_streak and existing_streak.last_active_date == today)

    await touch_streak(db, user.id)

    newly_awarded: List[str] = []
    total = (await get_xp(db, user.id)).total

    if not already_checked_in_today:
        total = await award_xp(db, user.id, CHECKIN_XP, "breath_checkin", ref_type="session")

        quest_result = await db.exec(select(Quest).where(Quest.code == "daily_breath_check"))
        quest = quest_result.first()
        if quest:
            qp_result = await db.exec(
                select(QuestProgress).where(
                    QuestProgress.quest_id == quest.id,
                    QuestProgress.user_id == user.id,
                    QuestProgress.quest_date == today,
                )
            )
            qp = qp_result.first()
            if qp and not qp.completed_at:
                qp.progress = min(qp.progress + 1, qp.target)
                if qp.progress >= qp.target:
                    qp.completed_at = datetime.utcnow()
                    total = await award_xp(db, user.id, quest.xp_reward, "quest_complete", ref_type="quest", ref_id=quest.id)

        reads_count_result = await db.exec(
            select(func.count()).select_from(ArticleRead).where(ArticleRead.user_id == user.id)
        )
        reads_count = reads_count_result.one()
        streak_after = await db.get(Streak, user.id)
        newly_awarded = await evaluate_badges(db, user.id, total, streak_after.current if streak_after else 0, reads_count)

    await db.commit()
    streak_out = await get_streak(db, user.id)
    return CheckinOut(
        xp_awarded=0 if already_checked_in_today else CHECKIN_XP,
        total_xp=total,
        streak=streak_out,
        newly_awarded_badges=newly_awarded,
    )
