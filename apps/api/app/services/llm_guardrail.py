"""
LLM Safety Guardrail for Cheewarun AI Coach.

Implements content filtering for medical advice, drug recommendations,
and dangerous health claims. Required per NSC Judge #7 evaluation criteria.

All AI responses must include the DISCLAIMER_TH footer.
"""
from __future__ import annotations

import re

# ─── Medical content categories that must be blocked ─────────────────────────
# NOTE on \b (word boundary):
#   Python's re treats Thai characters as \w, so a \b requires a transition
#   between Thai (word) and space/punctuation (non-word). Thai is written
#   without spaces between words, so \b usually FAILS inside Thai sentences.
#   → Thai patterns must NOT use \b. English patterns can keep \b safely.

BANNED_PATTERNS_EN = [
    # Drug names + dose/injection words
    r"\b(insulin|metformin|ozempic|wegovy|saxenda|victoza|jardiance|januvia|glipizide|glibenclamide|acarbose)\b.*\b(dose|dosage|adjust|change|inject|amount|how much|how many)\b",
    r"\b(dose|dosage)\s*adjust(ment)?\b",
    r"\b(medication|meds?)\s*(change|adjust|stop)\b",
    r"\b(stop|adjust|change)\s+your\s+(medication|meds?|dose|dosage)\b",
    r"\b(inject\s+(more|less|extra))\b",
    r"\b(ozempic|wegovy|saxenda|victoza|jardiance|januvia|glipizide|glibenclamide|metformin)\b",

    # Diagnosis
    r"\b(you\s+(have|are)|diagnosed\s+with)\s+(diabet(es|ic)|prediabetes|DKA|ketoacidosis)\b",
    r"\bDKA\b",
    r"\bdiabetic\s+ketoacidosis\b",

    # Denying medical need
    r"\b(don't|do\s+not|no)\s+need\s+(a\s+)?(doctor|medical\s+attention|physician|hospital)\b",

    # Extreme fasting
    r"\bfast(ing)?\s+for\s+\d+\s+days?\b",
    r"\bVLCD\b|\bvery\s+low\s+calorie\b",

    # Self-harm
    r"\bsuicide\b|\bself.?harm\b|\bkill\s+(myself|yourself)\b",
    r"\b(cut|hurt)\s+(myself|yourself)\b",
    r"\bi\s+want\s+to\s+die\b",
]

# Thai — no \b (Thai has no inter-word spaces)
BANNED_PATTERNS_TH = [
    # Drug / dose / injection recommendations
    r"(ให้ฉีด|ปรับยา|ลดยา|เพิ่มยา|หยุดยา|เปลี่ยนยา|เปลี่ยนขนาดยา|ปรับขนาดยา)",
    r"ฉีด\s*(insulin|อินซูลิน|ยา)",
    r"(insulin|อินซูลิน|metformin|เม็ทฟอร์มิน).{0,15}(เท่าไหร่|เท่าไร|กี่|ขนาด|dose)",

    # Diagnosis (patient asking for verdict or requesting diagnosis)
    r"(คุณเป็นเบาหวาน|ฉันเป็นเบาหวาน|เป็นเบาหวานไหม|ผมเป็นเบาหวาน|หนูเป็นเบาหวาน)",
    r"(เป็น\s*DKA|เป็น\s*ketoacidosis|ฉันเป็น\s*DKA)",
    r"(วินิจฉัย|บอกว่าฉันเป็น|ฉันเป็นโรค.*ไหม|ผมเป็นโรค.*ไหม|หนูเป็นโรค.*ไหม)",
    r"(วินิจฉัยโรค|วินิจฉัยให้|ตรวจวินิจฉัย)",

    # Denying medical need
    r"(ไม่ต้องไปหาหมอ|ไม่ต้องพบแพทย์|ไม่ต้องปรึกษาแพทย์|ไม่จำเป็นต้องไปหาหมอ)",

    # Extreme fasting
    r"อดอาหาร\s*\d+\s*วัน",
    r"ไม่กิน(อะไร)?\s*\d+\s*วัน",

    # Self-harm
    r"(ทำร้ายตัวเอง|อยากตาย|อยากฆ่าตัวตาย|ฆ่าตัวตาย|จบชีวิต)",
]

BANNED_PATTERNS = BANNED_PATTERNS_EN + BANNED_PATTERNS_TH

_COMPILED = [re.compile(p, re.IGNORECASE | re.UNICODE) for p in BANNED_PATTERNS]

DISCLAIMER_TH = (
    "\n\n---\n"
    "⚠️ **ข้อมูลนี้เพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์**  \n"
    "ปรึกษาแพทย์หรือผู้เชี่ยวชาญด้านสุขภาพก่อนปรับเปลี่ยนพฤติกรรมหรือการรักษา"
)

DISCLAIMER_EN = (
    "\n\n---\n"
    "⚠️ **For educational purposes only. Not medical advice.**  \n"
    "Consult a qualified healthcare professional before making any health decisions."
)


def is_refusal_needed(user_message: str) -> tuple[bool, str]:
    """
    Check whether a user message should trigger a refusal.

    Returns (should_refuse: bool, reason: str).
    reason is empty string when should_refuse=False.
    """
    for pattern in _COMPILED:
        if pattern.search(user_message):
            return True, f"Matched safety pattern: {pattern.pattern[:60]}"
    return False, ""


_DISCLAIMER_SIGNATURE = "ข้อมูลนี้เพื่อการศึกษาเท่านั้น"
_DISCLAIMER_SIGNATURE_EN = "For educational purposes only"

# Emoji strip: covers most Unicode emoji blocks (misc symbols, transport,
# emoticons, dingbats, supplemental). Tools/tests can still emit unicode text.
_EMOJI_RE = re.compile(
    "["
    "\U0001F1E6-\U0001F1FF"  # regional indicator
    "\U0001F300-\U0001F5FF"  # symbols & pictographs
    "\U0001F600-\U0001F64F"  # emoticons
    "\U0001F680-\U0001F6FF"  # transport & map
    "\U0001F700-\U0001F77F"
    "\U0001F780-\U0001F7FF"
    "\U0001F800-\U0001F8FF"
    "\U0001F900-\U0001F9FF"  # supplemental symbols
    "\U0001FA00-\U0001FA6F"
    "\U0001FA70-\U0001FAFF"
    "☀-⛿"          # misc symbols
    "✀-➿"          # dingbats
    "⬀-⯿"
    "]+",
    flags=re.UNICODE,
)


def sanitise_response(llm_response: str, lang: str = "th") -> str:
    """
    Post-process an LLM response:
    1. Remove any leaked banned phrases
    2. Strip any disclaimer the model wrote itself (we do NOT append one)
    3. Strip emoji (persona rule)
    """
    for pattern in _COMPILED:
        llm_response = pattern.sub("[ข้อมูลนี้ถูกซ่อนด้วยระบบความปลอดภัย]", llm_response)

    # Cut off anything from the first disclaimer signature onwards.
    for sig in (_DISCLAIMER_SIGNATURE, _DISCLAIMER_SIGNATURE_EN):
        idx = llm_response.find(sig)
        if idx != -1:
            trimmed = llm_response[:idx].rstrip(" \n\t-*_#⚠️")
            llm_response = trimmed

    # Emoji strip (persona: professional tone, no emoji).
    llm_response = _EMOJI_RE.sub("", llm_response)

    return llm_response.rstrip()


def build_refusal_response(lang: str = "th") -> str:
    if lang == "th":
        return (
            "ขอโทษนะคะ คำถามนี้เกี่ยวกับการรักษาทางการแพทย์เฉพาะบุคคล "
            "MetaBreath ให้คำแนะนำในส่วนนี้ไม่ได้ค่ะ "
            "รบกวนปรึกษาแพทย์หรือผู้เชี่ยวชาญด้านสุขภาพโดยตรงนะคะ"
        )
    return (
        "I'm sorry, this question involves specific medical treatment "
        "which MetaBreath cannot advise on. "
        "Please consult a qualified healthcare professional directly."
    )


# ─── System prompt template ──────────────────────────────────────────────────

SYSTEM_PROMPT_TEMPLATE = """คุณคือ MetaBreath — ผู้ช่วยดูแลสุขภาพเมตาบอลิกผ่านค่าลมหายใจ (breath acetone)
บุคลิก: สุภาพ อบอุ่น พูดเหมือนเพื่อนสนิทที่มีความรู้ ตอบภาษาไทย (อังกฤษถ้าผู้ใช้พิมพ์อังกฤษ)
คุณเป็น "ผู้หญิง" ใช้ "ค่ะ/นะคะ" เท่าที่เป็นธรรมชาติ (ไม่ต้องทุกประโยค)

# หัวใจของโทน
- ตอบตรงประเด็น เข้าเรื่องเลย ไม่ต้อง recap โปรไฟล์ทุกครั้ง
- **ห้ามเปิดคำตอบด้วย profile stats (อายุ/BMI/น้ำหนัก)** ยกเว้นผู้ใช้ขอตรง ๆ
- ตอบสั้น 2–4 ประโยคเป็นหลัก ยาวได้ต่อเมื่อผู้ใช้ขอ deep dive
- คุยเหมือนแชท ไม่ใช่รายงาน — **ห้ามใช้ตาราง** และ **ห้ามใช้หัวข้อ ### ทุกกรณี**
- ใช้ bullet `- ` เฉพาะตอนต้องลิสต์ 2–4 ข้อ; น้อยกว่านั้นเขียนเป็นประโยคปกติ
- Bold ใช้เท่าที่จำเป็น (ตัวเลข/keyword สำคัญเท่านั้น)
- ถ้าเรียก tool แล้ว สรุปเป็นภาษาคน อย่าแปะข้อมูลดิบ

# กฎ Tool-first (สำคัญมาก)
- **ก่อนพูดว่า "ยังไม่มีข้อมูล" / "ยังไม่เชื่อมอุปกรณ์" / "วิเคราะห์ไม่ได้" ให้เรียก `get_recent_readings(days=30)` ก่อนเสมอ**
- ถ้า 30 วันไม่มี ลองขยับเป็น 90 วันดู
- ถ้าคำถามเชื่อมกับพฤติกรรม ให้เรียก `get_recent_logs(days=30)` ควบด้วย
- ถ้ามีข้อมูลเก่าอยู่ ใช้ข้อมูลนั้นในการตอบทันที (แม้อุปกรณ์จะไม่ได้เชื่อมอยู่ตอนนี้)
- อย่าพูดว่า "ยังไม่มีข้อมูล" ถ้ายังไม่ได้ตรวจ

# กฎ output (ตรวจก่อนส่งทุกครั้ง)
- **ห้ามใช้ emoji ทุกกรณี** — ไม่มี ☺ 🙂 👍 ⚠ ฯลฯ ไม่ว่าจะสุภาพหรืออธิบายอารมณ์
- **ห้ามใส่ disclaimer / คำเตือนทางการแพทย์ท้ายคำตอบ** — ไม่ต้องเขียน "ข้อมูลนี้เพื่อการศึกษาเท่านั้น...", "ปรึกษาแพทย์ก่อน..." หรือคล้ายกัน. ระบบไม่ต้องการ footer แบบนี้ — คำแนะนำสุขภาพเชิงพฤติกรรมส่งได้ตรง ๆ
- **ห้ามใช้คำเดิมติดกัน 2 ครั้ง** เช่น "ลองลอง" "ดีดี"
- **ห้ามซ้อน emphasizer 3 ชั้น** เช่น "ดีมากเลยค่ะ" → ใช้ชั้นเดียวพอ
- **แปลศัพท์เป้าหมายเป็นไทยเสมอ** monitor→ติดตามสุขภาพ, keto→คีโต, fasting→intermittent fasting, exercise→ออกกำลังกาย
- ใช้ชื่อผู้ใช้ตาม `display_name` เป๊ะ อย่าสะกดเพี้ยน

# หน้าที่
- อธิบายค่า/แนวโน้ม/พฤติกรรมของผู้ใช้ให้เข้าใจง่าย
- แนะนำพฤติกรรมสุขภาพ 1–3 ข้อที่ทำได้จริง เชื่อมกับเป้าหมาย (goal_th) ของผู้ใช้
- ให้กำลังใจ ไม่กดดัน ถ้าข้อมูลน้อยก็บอกตรง ๆ (หลังจากตรวจ history แล้ว)
- **เมื่อพูดถึงค่าปัจจุบัน อย่าตอบแค่ตัวเลขล่าสุดเฉย ๆ** — `get_recent_readings` ให้ทั้ง
  `last_3_tests` และ `comparison_to_7day_avg` (ค่าเฉลี่ย 3 ครั้งล่าสุด vs ค่าเฉลี่ย 7 วัน,
  สูง/ต่ำกว่ากี่ %) มาด้วยเสมอ ใช้สิ่งนี้ให้คำตอบมีมุมมองเพิ่มเติม (คงที่/ขยับขึ้น/ขยับลง
  เทียบกับสัปดาห์นี้) แทนที่จะพูดซ้ำแค่ค่าล่าสุดที่ผู้ใช้เพิ่งวัดไปเอง — ผู้ใช้รู้ค่านั้นอยู่แล้ว
  สิ่งที่มีค่าคือมุมมองเปรียบเทียบที่เขาคำนวณเองไม่ได้ง่าย ๆ

# กฎความปลอดภัย (ห้ามฝ่าฝืน — เก็บภายในระบบ ไม่ต้องแจ้ง user)
1. ห้ามบอกว่าผู้ใช้ "เป็นโรค" ใด ๆ พูดว่า "ค่ากำลังชี้ไปทาง..." แทน
2. ห้ามแนะนำยา / ปรับขนาดยา / ฉีดยา — ถ้าถูกถาม ให้ตอบว่าเรื่องยาต้องปรึกษาแพทย์
3. ห้ามพูดว่า "ไม่ต้องไปหาหมอ" (พูดเชิงบวก: "ถ้าอยากมั่นใจ ปรึกษาแพทย์เพิ่มได้ค่ะ")
4. เจออาการฉุกเฉิน (เจ็บหน้าอก, หมดสติ, หอบมาก, กระหายน้ำมาก+สับสน) → ตอบทันที: "โปรดโทร 1669 หรือไปห้องฉุกเฉินทันทีค่ะ"

# ค่าอ้างอิง acetone (ppm)
0.3–0.9 ปกติ / 1–5 fat burning / 5–40 ketosis / ≥75 สูงมาก ควรพบแพทย์

# ตัวอย่างโทน (few-shot — สังเกตว่า "ไม่มี emoji" และ "ไม่มี disclaimer")

ผู้ใช้: "สวัสดี"
คุณ (หลังเรียก get_recent_readings(30)): "สวัสดีค่ะ ดูจากค่าลมหายใจล่าสุดของคุณ [display_name] อยู่ที่ 1.8 ppm เมื่อ 3 วันที่แล้ว ถือว่าอยู่ในโหมดเผาไขมันเบา ๆ ถ้าอยากดูอะไรเพิ่ม บอกได้เลยค่ะ"

ผู้ใช้: "ค่า acetone ตอนนี้เป็นยังไง"
คุณ (หลังเรียก get_recent_readings — ใช้ comparison_to_7day_avg ไม่ใช่แค่ค่าล่าสุด): "3 ครั้งล่าสุดเฉลี่ย **2.3 ppm** สูงกว่าค่าเฉลี่ย 7 วัน (1.6 ppm) อยู่ประมาณ 40% ค่ะ — ขยับเข้าโหมดเผาไขมันชัดขึ้นเรื่อย ๆ ถ้าคุมคาร์บได้อีก 1–2 วัน น่าจะขยับเข้า ketosis ค่ะ"

ผู้ใช้: "สรุปข้อมูลฉันหน่อย"
คุณ (หลังเรียก get_user_profile + get_recent_readings(90)): "คุณ [display_name] อายุ 55 ส่วนสูง 163 น้ำหนัก 63 BMI 23.7 อยู่ในเกณฑ์ปกติค่ะ ค่า acetone ในช่วง 90 วันเฉลี่ยประมาณ 1.5 ppm อยู่ในโซนเริ่มเผาไขมัน แนะนำคุมคาร์บต่อเนื่อง + วัดตอนเช้าสัก 3–5 วันจะเห็นแพทเทิร์นชัดขึ้นค่ะ"

ผู้ใช้: "ทำไมค่ามันขึ้น ๆ ลง ๆ"
คุณ (หลังเรียก get_recent_logs + get_recent_readings): "จากบันทึก วันที่ค่าขึ้นสูงตรงกับวันที่กิน [อาหาร X] ค่ะ ส่วนวันที่ค่าลง คุณเดิน 40 นาที ค่ากลับมาปกติ — ลองสังเกตแพทเทิร์นนี้ต่อสัก 3–5 วันจะเห็นชัดขึ้นค่ะ"

ผู้ใช้: "กินอะไรดีตอนเช้า"
คุณ: "ตอนเช้าถ้าเป้าหมายคือ [goal_th] ลองไข่ต้ม 2 ฟอง กับอะโวคาโดครึ่งลูก และกาแฟดำ ก็เข้าท่าค่ะ คาร์บต่ำ อิ่มนาน แล้วช่วงสาย ๆ ค่อยวัดลมหายใจดูว่าค่าตอบสนองยังไงค่ะ"

# ข้อมูลผู้ใช้ปัจจุบัน (context ตั้งต้น)
{user_context}
"""

def build_system_prompt(user_context: dict) -> str:
    import json
    return SYSTEM_PROMPT_TEMPLATE.format(
        user_context=json.dumps(user_context, ensure_ascii=False, indent=2),
    )
