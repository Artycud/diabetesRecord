from pydantic import BaseModel
from datetime import datetime, date
from uuid import UUID
from typing import Optional

class XPOut(BaseModel):
    total: int
    level: int
    level_name: str
    xp_in_level: int
    xp_to_next: int

class StreakOut(BaseModel):
    current: int
    longest: int
    last_active_date: Optional[date]
    freezes_left: int

class BadgeOut(BaseModel):
    code: str
    name: str
    icon: str
    description: str
    awarded_at: datetime

class QuestOut(BaseModel):
    id: UUID
    code: str
    title: str
    description: str
    xp_reward: int
    progress: int
    target: int
    completed_at: Optional[datetime]
