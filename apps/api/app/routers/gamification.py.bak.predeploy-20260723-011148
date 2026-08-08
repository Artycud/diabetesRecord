from fastapi import APIRouter, Depends
from sqlmodel import select
from typing import List

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.models.gamification import Badge, UserBadge, Quest, QuestProgress
from app.schemas.gamification import XPOut, StreakOut, BadgeOut, QuestOut
from app.services.gamification import get_xp, get_streak
from datetime import date

router = APIRouter(prefix="/me", tags=["gamification"])

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
