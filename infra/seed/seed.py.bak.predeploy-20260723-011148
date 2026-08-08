#!/usr/bin/env python3
"""
Cheewarun — Seed initial data
Run: docker compose exec api python /app/../infra/seed/seed.py
Or:  docker compose exec api python -m infra.seed.seed  (from /root/cheewarun)
"""
import asyncio, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../apps/api"))

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import settings
from app.models.ai import AIProvider
from app.models.gamification import Badge, Quest
from app.models.content import Article

engine = create_async_engine(settings.DATABASE_URL, echo=False)
Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

AI_PROVIDERS = [
    {"key": "openai",  "display_name": "OpenAI",           "priority": 1, "enabled": True,  "model": settings.OPENAI_MODEL,  "timeout_s": 8},
    {"key": "gemini",  "display_name": "Google Gemini",    "priority": 2, "enabled": True,  "model": settings.GEMINI_MODEL,  "timeout_s": 8},
    {"key": "claude",  "display_name": "Anthropic Claude", "priority": 3, "enabled": True,  "model": settings.CLAUDE_MODEL,  "timeout_s": 8},
]

BADGES = [
    {"code": "first_log",       "name": "ก้าวแรก",          "icon": "🌱", "description": "บันทึกค่าคีโตนครั้งแรก"},
    {"code": "streak_7",        "name": "Streak 7 วัน",      "icon": "🔥", "description": "บันทึกต่อเนื่อง 7 วัน"},
    {"code": "streak_30",       "name": "Streak 30 วัน",     "icon": "⚡", "description": "บันทึกต่อเนื่อง 30 วัน"},
    {"code": "streak_100",      "name": "ร้อยวัน",            "icon": "💎", "description": "บันทึกต่อเนื่อง 100 วัน"},
    {"code": "ketosis",         "name": "Ketosis",           "icon": "🧬", "description": "วัดค่าคีโตน ≥ 0.5 mmol/L ครั้งแรก"},
    {"code": "deep_ketosis",    "name": "Deep Ketosis",      "icon": "🚀", "description": "วัดค่าคีโตน ≥ 3.0 mmol/L"},
    {"code": "social_first",    "name": "เพื่อนสนิท",         "icon": "🤝", "description": "เพิ่มเพื่อนคนแรก"},
    {"code": "challenge_win",   "name": "แชมป์",              "icon": "🏆", "description": "ชนะ challenge ครั้งแรก"},
    {"code": "reader",          "name": "นักอ่าน",            "icon": "📖", "description": "อ่านบทความครบ 5 เรื่อง"},
    {"code": "scholar",         "name": "นักวิชาการ",          "icon": "🎓", "description": "อ่านบทความครบ 20 เรื่อง"},
    {"code": "level_10",        "name": "Level 10",          "icon": "⭐", "description": "ถึง Level 10"},
    {"code": "level_50",        "name": "Level 50",          "icon": "🌟", "description": "ถึง Level 50"},
]

from datetime import datetime

ARTICLES = [
    {
        "slug": "keto-101",
        "title": "Keto 101: เริ่มต้น Ketogenic Diet อย่างถูกต้อง",
        "category": "keto",
        "reading_min": 5,
        "tags": ["keto", "beginner", "diet"],
        "xp_reward": 10,
        "published_at": datetime(2026, 7, 1),
        "content": """## Ketogenic Diet คืออะไร?

Ketogenic Diet (คีโต) คือการรับประทานอาหารที่มีไขมันสูง โปรตีนปานกลาง และคาร์โบไฮเดรตต่ำมาก โดยทั่วไปแบ่งสัดส่วนดังนี้:

- **ไขมัน**: 70–75% ของแคลอรีทั้งหมด
- **โปรตีน**: 20–25%
- **คาร์บ**: 5–10% (ประมาณ 20–50 กรัม/วัน)

## ทำไมคาร์บต้องต่ำ?

เมื่อร่างกายได้รับคาร์บน้อย ระดับ insulin จะลดลง ตับจะเริ่มเปลี่ยนไขมันเป็น **ketone bodies** เพื่อใช้เป็นพลังงานแทนกลูโคส สภาวะนี้เรียกว่า **Ketosis**

## ประโยชน์ที่วิจัยพบ

- ช่วยลดน้ำหนักโดยเฉพาะไขมันหน้าท้อง
- ควบคุมระดับน้ำตาลในเลือดได้ดีขึ้น
- ลด Triglycerides และเพิ่ม HDL cholesterol
- ลดความหิวได้ดีกว่าอาหารไขมันต่ำ

## อาหารที่ควรกิน

- เนื้อสัตว์ ไข่ ปลา
- ผักใบเขียว บล็อกโคลี่ ผักกาดหอม
- ไขมันดี: อะโวคาโด ถั่ว น้ำมันมะกอก น้ำมันมะพร้าว
- ชีส เนย ครีม

## อาหารที่ต้องหลีกเลี่ยง

- ข้าว ขนมปัง เส้นก๋วยเตี๋ยว
- น้ำตาล ขนมหวาน น้ำอัดลม
- ผลไม้หวาน (กล้วย มะม่วง ลำไย)
- ถั่วแป้ง มันฝรั่ง

## ช่วงแรกอาจมีอาการ "Keto Flu"

อาการเหนื่อย ปวดหัว คลื่นไส้ใน 3–5 วันแรก เกิดจากร่างกายปรับตัว แก้ได้โดย:
- ดื่มน้ำมากขึ้น
- เพิ่ม electrolytes (เกลือ แมกนีเซียม โพแทสเซียม)
- อดทนไว้ อาการจะดีขึ้นเอง

> **เคล็ดลับ**: วัดค่าคีโตนด้วย breath analyzer ทุกเช้าเพื่อดูว่าร่างกายอยู่ใน ketosis หรือยัง""",
    },
    {
        "slug": "if-basics",
        "title": "Intermittent Fasting: เลือก Protocol ที่ใช่สำหรับคุณ",
        "category": "fasting",
        "reading_min": 4,
        "tags": ["fasting", "IF", "beginner"],
        "xp_reward": 10,
        "published_at": datetime(2026, 7, 2),
        "content": """## Intermittent Fasting (IF) คืออะไร?

IF คือการจำกัด**เวลา**การกิน ไม่ใช่การจำกัดชนิดอาหาร ร่างกายจะสลับระหว่างช่วงกินและช่วงอดอาหาร

## Protocol ยอดนิยม

### 16:8 — เหมาะสำหรับมือใหม่
- อดอาหาร 16 ชั่วโมง กิน 8 ชั่วโมง
- เช่น: กินมื้อแรก 12:00 น. กินมื้อสุดท้าย 20:00 น.
- เหมาะกับคนที่งดอาหารเช้าได้

### 18:6 — ระดับกลาง
- อดอาหาร 18 ชั่วโมง กิน 6 ชั่วโมง
- ผลดีกว่า 16:8 แต่ยากขึ้นเล็กน้อย

### OMAD (One Meal A Day) — ระดับสูง
- กินวันละมื้อเดียว
- ควรปรึกษาแพทย์ก่อนเริ่ม

## สิ่งที่ดื่มได้ตอนอด

- น้ำเปล่า (มากที่สุด)
- กาแฟดำ ชาดำ (ไม่ใส่น้ำตาลหรือนม)
- น้ำเกลือแร่ (0 แคลอรี)

## ประโยชน์จาก IF

- เพิ่ม **Autophagy** (การกำจัดเซลล์เสื่อม)
- ลด insulin resistance
- เผาผลาญไขมันได้ดีขึ้นในช่วงอด
- ง่ายกว่าการนับแคลอรีทุกมื้อ

## IF + Keto = ผลเสริมกัน

ทำ IF ร่วมกับ keto ช่วยให้เข้า ketosis เร็วขึ้นและออก ketosis ยากขึ้น เป็น combination ที่นิยมมากใน biohacking community

> **เคล็ดลับ**: บันทึกเวลากินและเวลาอดใน Cheewarun เพื่อสะสม streak และรับ XP""",
    },
    {
        "slug": "breath-acetone-explained",
        "title": "Breath Acetone คืออะไร? วิทยาศาสตร์เบื้องหลัง MetaBreath",
        "category": "science",
        "reading_min": 6,
        "tags": ["science", "breath", "ketosis", "MetaBreath"],
        "xp_reward": 15,
        "published_at": datetime(2026, 7, 3),
        "content": """## Acetone ในลมหายใจมาจากไหน?

เมื่อร่างกายเผาผลาญไขมัน ตับสร้าง **ketone bodies** 3 ชนิด:

- **Beta-hydroxybutyrate (BHB)** — อยู่ในเลือด ใช้เป็น energy
- **Acetoacetate** — intermediate
- **Acetone** — ระเหยออกทางลมหายใจและปัสสาวะ

Acetone ใน**ลมหายใจ**จึงเป็น **biomarker ที่วัดได้โดยไม่ต้องเจาะเลือด**

## สูตรที่ MetaBreath ใช้

```
acetone_delta = breath_voc - ambient_voc
```

ต้องหักค่า VOC จากอากาศโดยรอบออก เพราะมีสารอินทรีย์จากสิ่งแวดล้อมปนอยู่เสมอ

## ระดับ Acetone กับสภาวะร่างกาย

| ระดับ | acetone_delta (ppm) | ความหมาย |
|---|---|---|
| Low | < 20 | ไม่อยู่ใน ketosis |
| Moderate | 20–50 | Nutritional ketosis |
| High | > 50 | Deep ketosis |
| Unreliable | — | คุณภาพ sample ต่ำ |

## งานวิจัยที่รองรับ

**Wang & Wang (2013)** — รีวิวประวัติศาสตร์ 80 ปีของการวัด breath acetone ในผู้ป่วยเบาหวาน พบว่าเป็น biomarker ที่เชื่อถือได้

**Bovey et al. (2018)** — พบความสัมพันธ์ระหว่าง breath acetone กับการสูญเสียไขมันในผู้ที่ลดน้ำหนัก

**Gregoire et al. (2023)** — ทดสอบ handheld device วัด breath acetone ในชีวิตประจำวัน ความแม่นยำสูงเพียงพอสำหรับ monitoring

## Sensor TGS1820

MetaBreath ใช้ **TGS1820** ของ Figaro — sensor ตรวจจับ organic gas ที่ไวต่อ acetone โดยเฉพาะ

- ต้องปรับเทียบ (calibrate) กับค่า ambient ทุกครั้ง
- อุณหภูมิและความชื้นมีผลต่อค่าที่วัดได้ → ใช้ SHT35 แก้ไข
- ต้องเป่าลมด้วยแรงดันสม่ำเสมอ → วัดด้วย pressure sensor

> ค่า quality_score และ reliability_score ใน MetaBreath ช่วยกรอง sample ที่ไม่ผ่านเกณฑ์ออก""",
    },
    {
        "slug": "metabolic-flexibility",
        "title": "Metabolic Flexibility: ความสามารถสลับเชื้อเพลิงที่ร่างกายต้องการ",
        "category": "science",
        "reading_min": 5,
        "tags": ["science", "metabolism", "health"],
        "xp_reward": 15,
        "published_at": datetime(2026, 7, 4),
        "content": """## Metabolic Flexibility คืออะไร?

คือความสามารถของร่างกายในการ**สลับแหล่งพลังงาน**ได้อย่างยืดหยุ่น ระหว่าง:

- **กลูโคส** (จากคาร์บ) — ใช้เมื่อมีคาร์บพร้อม
- **ไขมัน** (fatty acids + ketones) — ใช้เมื่ออดอาหารหรือออกกำลังกาย

คนที่มี metabolic flexibility สูง = เผาไขมันได้ดีเมื่อไม่มีคาร์บ และใช้กลูโคสได้ดีเมื่อกินคาร์บ

## วัด Metabolic Flexibility ได้อย่างไร?

### วิธี Lab-Grade: RER (Respiratory Exchange Ratio)
```
RER = CO2 ที่ออก / O2 ที่ใช้
```
- RER = 1.0 → เผาคาร์บ 100%
- RER = 0.7 → เผาไขมัน 100%
- RER = 0.85 → เผาทั้งคู่

วัดด้วย metabolic cart ในห้องแล็บ แพงและไม่สะดวก

### วิธี MetaBreath: Breath Acetone
Acetone ในลมหายใจสะท้อนการเผาไขมัน ค่า acetone_delta สูง = ร่างกายกำลังเผาไขมัน = Metabolic Flexibility ดี

## ทำไม Metabolic Flexibility สำคัญ?

### สัมพันธ์กับสุขภาพหลายด้าน

- **เบาหวาน Type 2** — ผู้ป่วยมัก metabolic flexibility ต่ำ
- **โรคหัวใจ** — Triglycerides สูง + HDL ต่ำ = flexibility ต่ำ
- **Metabolic Syndrome** — กลุ่มอาการที่สัมพันธ์กับ flexibility ต่ำ

### ในนักกีฬา
นักกีฬา endurance ที่ฝึก fat-adapted (keto-adapted) มี metabolic flexibility สูง — วิ่งมาราธอนโดยไม่ต้อง gel ทุก 30 นาที

## วิธีเพิ่ม Metabolic Flexibility

1. **Intermittent Fasting** — ฝึกให้ร่างกายเผาไขมันในช่วงอด
2. **Ketogenic Diet** — ลดคาร์บให้ร่างกายปรับมาใช้ไขมัน
3. **ออกกำลังกายแบบ fasted** — เช้าก่อนอาหาร เผาไขมันได้มากขึ้น
4. **Zone 2 Cardio** — ความเข้มข้นต่ำ ยาวนาน → เทรน fat oxidation

> **หมายเหตุ**: การวัด acetone_delta ทุกวันใน Cheewarun ช่วยติดตาม metabolic flexibility ของคุณในชีวิตประจำวัน""",
    },
    {
        "slug": "exercise-starter",
        "title": "เริ่มต้นออกกำลังกายสำหรับสาย Keto และ IF",
        "category": "exercise",
        "reading_min": 4,
        "tags": ["exercise", "keto", "fasting", "beginner"],
        "xp_reward": 10,
        "published_at": datetime(2026, 7, 5),
        "content": """## ออกกำลังกายตอนอด (Fasted Exercise) ดีไหม?

ช่วง **6–12 ชั่วโมงหลังกินมื้อสุดท้าย** ระดับ insulin ต่ำ ร่างกายพร้อมเผาไขมัน — นี่คือเวลาที่ดีที่สุดสำหรับ fat burning exercise

### ประโยชน์ของ Fasted Exercise
- เผาไขมันได้มากกว่า 20–30% เมื่อเทียบกับออกหลังกิน
- ไม่ต้องรอย่อยอาหาร ตื่นปุ๊บออกได้เลย
- เพิ่ม Growth Hormone จากการอดรวมกับการออก

## ประเภทการออกกำลังกายที่เหมาะกับ Keto/IF

### Zone 2 Cardio — เหมาะมาก
- เดิน จ๊อกเกิ้ง ปั่นจักรยาน ว่ายน้ำ ความเข้มปานกลาง
- หัวใจ 60–70% ของ max HR
- เผาไขมันได้มากที่สุด เทรน mitochondria

### HIIT — ระวัง
- ความเข้มสูง ร่างกายต้องการ glycogen
- ทำ fasted HIIT อาจทำให้กล้ามเนื้อสลายได้
- แนะนำ: ทำ HIIT หลังกินมื้อแรก

### Weight Training
- ต้องการ glycogen บ้าง แต่ทำ fasted ได้ถ้า keto-adapted แล้ว
- ดื่ม BCAAs ก่อน fasted lifting ช่วยลด muscle breakdown

## คาร์บก่อนออกกำลังกาย

ถ้าออกหนัก (วิ่ง 10km+ หรือ weight training intensive) พิจารณา:
- **Targeted Keto** — กินคาร์บ 20–30g ก่อนออก 30 นาที เฉพาะวันที่ออกหนัก
- หลังออกค่อย ketosis กลับมาใหม่

## ฟื้นตัว (Recovery)

- โปรตีนหลังออก: 20–40g ภายใน 30 นาที
- Magnesium กลางคืน: ช่วยกล้ามเนื้อฟื้น ลดตะคริว
- นอนหลับ 7–9 ชั่วโมง: Growth hormone ออกตอนนอน

## เป้าหมายแรก

สัปดาห์แรก: เดิน 30 นาที / วัน ก่อนอาหารเช้า 3–5 วัน
เดือนแรก: Zone 2 cardio 150 นาที/สัปดาห์

> **บันทึกใน Cheewarun**: log activity ทุกวันเพื่อสะสม streak และดู pattern การออกกำลังกายของคุณ""",
    },
]

QUESTS = [
    {"code": "daily_ketone",   "title": "วัดคีโตนวันนี้",       "description": "บันทึกค่าคีโตนอย่างน้อย 1 ครั้ง",   "xp_reward": 20, "goal_types": None},
    {"code": "daily_water",    "title": "ดื่มน้ำ 8 แก้ว",       "description": "บันทึกการดื่มน้ำครบ 8 แก้ว",       "xp_reward": 15, "goal_types": None},
    {"code": "daily_article",  "title": "อ่านบทความ 1 เรื่อง",  "description": "อ่านบทความจนจบ",                   "xp_reward": 10, "goal_types": None},
    {"code": "daily_weight",   "title": "ชั่งน้ำหนัก",           "description": "บันทึกน้ำหนักวันนี้",               "xp_reward": 10, "goal_types": None},
    {"code": "daily_exercise", "title": "ออกกำลังกาย",          "description": "บันทึก activity อย่างน้อย 20 นาที", "xp_reward": 25, "goal_types": ["exercise"]},
    {"code": "daily_meal",     "title": "บันทึกมื้ออาหาร",      "description": "บันทึกอาหาร 2 มื้อขึ้นไป",          "xp_reward": 15, "goal_types": ["fasting", "monitor"]},
]

async def seed():
    async with Session() as db:
        # AI providers
        for p in AI_PROVIDERS:
            existing = await db.exec(select(AIProvider).where(AIProvider.key == p["key"]))
            if not existing.first():
                db.add(AIProvider(**p))
                print(f"  + AIProvider: {p['key']}")

        # Badges
        for b in BADGES:
            existing = await db.exec(select(Badge).where(Badge.code == b["code"]))
            if not existing.first():
                db.add(Badge(**b))
                print(f"  + Badge: {b['code']}")

        # Quests
        for q in QUESTS:
            existing = await db.exec(select(Quest).where(Quest.code == q["code"]))
            if not existing.first():
                db.add(Quest(**q))
                print(f"  + Quest: {q['code']}")

        # Articles
        for a in ARTICLES:
            existing = await db.exec(select(Article).where(Article.slug == a["slug"]))
            if not existing.first():
                db.add(Article(**a))
                print(f"  + Article: {a['slug']}")

        await db.commit()
        print("Seed done ✓")

if __name__ == "__main__":
    asyncio.run(seed())
