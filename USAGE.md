# MetaBreath — คู่มือการใช้งานระบบ

**สถานะ:** Production live ที่ `https://metabreath.duckdns.org`
**อัพเดตล่าสุด:** 2026-07-07

---

## สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [Flow ผู้ใช้ทั่วไป (User)](#2-flow-ผู้ใช้ทั่วไป)
3. [Flow เพิ่มอุปกรณ์ + ติดตั้ง firmware](#3-flow-เพิ่มอุปกรณ์--ติดตั้ง-firmware)
4. [Admin Dashboard — ดูข้อมูลผู้ใช้ทั้งหมด](#4-admin-dashboard)
5. [AI Coach (LLM) — ทำอะไรได้ / ทำอะไรไม่ได้](#5-ai-coach-llm)
6. [Data flow ทั้งระบบ](#6-data-flow-ทั้งระบบ)

---

## 1. ภาพรวมระบบ

MetaBreath ประกอบด้วย 3 ชิ้นหลัก

| ชิ้น | ทำอะไร | เทคโนโลยี |
|---|---|---|
| **ESP32 firmware** | อ่าน TGS1820 (acetone) + XGZP6847A (pressure) + SHT31 (temp/humidity) แล้ว publish MQTT ทุก 3 วินาที | Arduino, PubSubClient, ArduinoJson |
| **Backend (VPS)** | รับ MQTT → signal processing → เก็บ TimescaleDB → ยิง WebSocket → แชท AI | FastAPI + Mosquitto + TimescaleDB + Redis + Celery |
| **Web app** | Real-time dashboard, ประวัติ, calibration, AI chat, admin | Next.js 16 + Tailwind + React Query + Web Bluetooth |

### Roles

- **User (ผู้ใช้ทั่วไป)** — เจ้าของอุปกรณ์, เข้าดูข้อมูล**ของตัวเองเท่านั้น**
- **Admin** — ดูข้อมูล**ผู้ใช้ทุกคน**, ป้อนค่าเซนเซอร์ manual, สร้าง virtual device สำหรับ demo

---

## 2. Flow ผู้ใช้ทั่วไป

### 2.1 สมัครสมาชิก + Login
```
metabreath.duckdns.org/register
    ↓
กรอก username / email / password / display_name
เลือกเป้าหมาย: Keto / Fasting / Exercise / Monitor
    ↓
Auto redirect → /onboarding
    ↓
กรอก height / weight / dob / sex
    ↓
เข้าสู่ /home
```

### 2.2 หน้าหลัก 4 tabs (PillNav บนสุด)

| Tab | เนื้อหา |
|---|---|
| **Health** (`/home`) | AcetoneRing สด (mV), Streak, Level/XP, Category cards |
| **Breathing** (`/breathing`) | สถานะอุปกรณ์ + Live · START session · ประวัติ session ล่าสุด |
| **Device** (`/me/device`) | รายละเอียดอุปกรณ์ + calibration + firmware + settings |
| **Profile** (`/me`) | ข้อมูลส่วนตัว, XP, badges, quests, language, appearance |

**ปุ่มพิเศษ:**
- **⊕ (top-right)** — quick add (scan QR, add device, log reading)
- **🤖 FAB (bottom-right)** — AI Coach chat sheet

### 2.3 ดูข้อมูลสด

- WebSocket auto-connect ตอน login
- ค่าใหม่ทุก ~3 วิ (per firmware publish)
- Ring hero แสดง: `mV delta`, label (clean / low / moderate / high), quality score
- ถ้าไม่มีอุปกรณ์เชื่อม → prompt "connect device"

### 2.4 Calibrate อุปกรณ์

Firmware ทำ baseline auto-calibrate ทุกครั้งที่เปิดเครื่อง (10 วิในอากาศสะอาด) — แต่ถ้าอยากปรับ baseline บน server (ต้องการ drift tracking):

```
/me/device/{id}/calibrate
   ↓
Step 1: intro (เตรียมอุปกรณ์ในอากาศสะอาด 5 นาที)
   ↓
Step 2: กรอก Baseline Voltage (V) — แอปดึงจาก firmware ให้อัตโนมัติถ้าเชื่อม
        + Temp/Humidity (auto-fill จาก SHT31)
   ↓
Step 3: confirm → บันทึก → server คำนวณ drift score
   ↓
Step 4: done — redirect ไปหน้า report
```

### 2.5 Calibration report

`/me/device/{id}/report` แสดง:
- **LoD (3σ)** — mV, บอกความไวขั้นต่ำที่แยกได้จาก noise
- **Repeatability CV** — %, ความสม่ำเสมอของ baseline
- **Baseline Drift** — mV/day
- **Cross-sensitivity note** — TGS1820 sensitive กับ ethanol (แนะนำอด 2 ชม.)

---

## 3. Flow เพิ่มอุปกรณ์ + ติดตั้ง firmware

### 3.1 สร้าง device + download firmware

```
/me/device/add
   ↓
เลือกรุ่น (TGS1820 v1)
   ↓
กด "สร้าง Device + ดาวน์โหลด Firmware"
   ↓
POST /sensor/device/pair → server สร้าง Device row + MQTT topic
   ↓
Auto redirect → /me/device/{new_id}/firmware
   ↓
กรอก WiFi SSID + Password
   ↓
กด "ดาวน์โหลด .ino"
   ↓
POST /sensor/device/{id}/firmware
   ↓
Server สร้างไฟล์ metabreath_xxxxxxxx.ino ที่ฝัง:
  - WIFI_SSID
  - WIFI_PASSWORD
  - DEVICE_ID (UUID ของ device row)
  - MQTT_BROKER = metabreath.duckdns.org
  - MQTT_USER = esp32
  - MQTT_PASS (จาก .env)
   ↓
ดาวน์โหลด → เปิดใน Arduino IDE
```

### 3.2 Flash firmware

**สิ่งที่ต้องมี:**
- Arduino IDE (`arduino.cc/en/software`)
- ESP32 board package (`espressif.github.io/arduino-esp32/package_esp32_index.json`)
- Libraries: `PubSubClient`, `ArduinoJson`
- สาย USB + ESP32 dev board

**ขั้นตอน:**
1. เปิดไฟล์ `.ino` ใน Arduino IDE
2. เลือก Board → ESP32 Dev Module
3. เสียบ USB → เลือก Port
4. กด Upload (→) รอ compile ~30 วิ
5. เปิด Serial Monitor 115200 baud
6. รอ:
   - `Calibrating TGS1820 baseline...` (10 วิ)
   - `[WiFi] Connected: 192.168.x.x`
   - `[MQTT] Connected` + `Publishing to: metabreath/{device_id}/reading`

### 3.3 ใช้งานอุปกรณ์

- ค่าเซนเซอร์ publish ทุก 3 วิ
- Serial Monitor ยังพิมพ์ log ตลอด (debug ได้)
- ถ้า WiFi/MQTT หลุด → sensor ยังเดิน, auto-reconnect
- ถ้าไม่ตั้ง WiFi → serial-only mode (ไม่ส่งขึ้น server)

---

## 4. Admin Dashboard

**URL:** `https://metabreath.duckdns.org/admin`

### 4.1 การเข้าถึง (ทำอย่างไร)

1. Login เป็น user ที่มี email ตรงกับ `ADMIN_EMAIL` ใน `.env` (ปัจจุบัน: `plaiad.innovation@gmail.com`)
2. ไปที่ `/admin`
3. กรอก **Admin password** (จาก `.env` → `ADMIN_PASSWORD`)
4. เข้าสู่ dashboard

**Double-gated security:**
- ⚠️ ต้องมีทั้ง JWT ของ email ที่ตรงกับ `ADMIN_EMAIL` **และ** admin password แยกอีกชั้น
- Password ถูกเก็บใน `sessionStorage` ระหว่าง session (หายเมื่อปิด tab)
- Backend ตรวจทั้ง 2 อย่างในทุก request (`X-Admin-Password` header)

### 4.2 หน้า Admin ทำอะไรได้บ้าง

**GET `/admin/users`** — รายชื่อผู้ใช้ทั้งหมด พร้อม:
- Display name / username / email / created_at
- อุปกรณ์ทั้งหมดของแต่ละคน (kind, sensor_model, calibration status)
- Reading summary: total readings, last reading time, last label, last acetone_delta, last quality score

**Panel ต่อ user:**

1. **Overview** — สรุป device + reading history
2. **Manual Entry** — ป้อนค่าเซนเซอร์ให้ user ที่ไม่มีอุปกรณ์จริง (สำหรับ pilot study)
   - เลือก device (หรือกดสร้าง Virtual Device)
   - กรอก: Ambient VOC, Breath VOC, Pressure, Temp/Humidity, Duration, note
   - Submit → server ผ่าน signal processing pipeline เหมือน MQTT reading
   - บันทึก audit trail (`note` field)
3. **Ensure Manual Device** — สร้าง virtual device แบบ kind=`manual` (ไม่ต้องมี ESP32) ให้ user นั้น

### 4.3 Endpoints ที่ admin ใช้

| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/verify` | ตรวจ admin password |
| GET | `/admin/users` | รายชื่อ + summary ผู้ใช้ทุกคน |
| POST | `/admin/device/ensure/{user_id}` | สร้าง virtual device ให้ user |
| POST | `/admin/reading` | ป้อน sensor reading manually |

### 4.4 สิ่งที่ Admin **ยัง**ทำไม่ได้ (จำกัด scope)

- ❌ แก้ profile / password ของ user
- ❌ ลบ user / ลบ readings
- ❌ ดู login history / access log
- ❌ เปลี่ยน goal_type ของ user
- ❌ Export CSV/PDF ทั้งระบบ (ใช้แค่ pilot session export)

*ถ้าต้องการ features เพิ่ม → เพิ่ม endpoint ใน `apps/api/app/routers/admin.py`*

---

## 5. AI Coach (LLM)

**Provider:** Anthropic Claude — `claude-haiku-4-5-20251001` (default), fallback = `claude-sonnet-4-6`
**API key:** ต้อง set `ANTHROPIC_API_KEY` หรือ `CLAUDE_API_KEY` ใน `.env`

### 5.1 LLM เอาข้อมูลอะไรไปใช้

ตอนที่ user chat, backend build system prompt ที่มี:

```
USER CONTEXT:
{
  "display_name": "จอห์น",
  "goal_type": "keto"
}

RECENT SENSOR DATA:
{
  "latest_reading_time": "2026-07-07T02:30:15",
  "acetone_delta": 45.2,     ← mV จาก TGS1820
  "label": "moderate",
  "confidence_score": 0.85,
  "quality_score": 90
}
```

**LLM ไม่เห็น:**
- Email / password / JWT
- ประวัติ chat ครั้งก่อน (stateless, ทุก request ใหม่)
- Data ของ user อื่น
- Full sensor history (แค่ latest reading เท่านั้น)

### 5.2 LLM ทำอะไรได้ (allowed)

- ✅ อธิบายค่าเซนเซอร์ว่าหมายถึงอะไร
- ✅ แนะนำ lifestyle (อาหาร, ออกกำลังกาย, การนอน) ตาม `goal_type`
- ✅ ให้กำลังใจ / streak encouragement
- ✅ ตอบคำถามทั่วไปเรื่อง ketosis / metabolic health
- ✅ Compare กับ reference range (< 5 clean, < 30 low, < 80 moderate, ≥ 80 high mV)

### 5.3 LLM ทำอะไรไม่ได้ (guardrails)

**Pre-filter — regex block ก่อนส่งเข้า LLM:**

```python
BANNED_PATTERNS = [
  # Medication
  r"insulin dose | metformin | ozempic | wegovy | ...",
  r"ให้ฉีด | ปรับยา | ลดยา | เพิ่มยา | หยุดยา",

  # Specific diagnosis
  r"คุณเป็นเบาหวาน | you have diabetes | DKA confirmed",

  # Emergency mismanagement
  r"ไม่ต้องไปหาหมอ | don't need a doctor",

  # Extreme fasting
  r"อดอาหาร \d+ วัน | fast for \d+ days | VLCD",

  # Self-harm
  r"ทำร้ายตัวเอง | suicide | self-harm",
]
```

ถ้าคำถามมี pattern พวกนี้ → **refuse ทันที** (ไม่ส่งเข้า LLM), ตอบข้อความปลอดภัย

**Post-filter — sanitise LLM response:**
- ตรวจซ้ำอีกครั้ง (กรณี LLM หลุด)
- แทนที่ด้วย `[ข้อมูลนี้ถูกซ่อนด้วยระบบความปลอดภัย]`
- Append disclaimer เสมอ:
  > ⚠️ ข้อมูลนี้เพื่อการศึกษาเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์
  > ปรึกษาแพทย์หรือผู้เชี่ยวชาญด้านสุขภาพก่อนปรับเปลี่ยนพฤติกรรมหรือการรักษา

### 5.4 System prompt strict rules

LLM ถูก instruct 5 ข้อ (จาก NSC Judge #7):

1. Never prescribe or recommend specific medications or dosages
2. Never diagnose the user with any disease
3. Never tell a user they do not need to see a doctor
4. Always end every response with the disclaimer
5. If asked about emergency symptoms → say "โปรดโทร 1669 หรือไปห้องฉุกเฉินทันที"

### 5.5 Endpoints AI ทั้งหมด

| Method | Path | ทำอะไร |
|---|---|---|
| POST | `/ai/predict` | ML inference (XGBoost) ทำนาย risk index จาก features |
| GET | `/ai/trend` | Linear regression trend + 7-day forecast ของ acetone |
| POST | `/ai/chat` | LLM chat (Claude Haiku 4.5) พร้อม guardrail |

### 5.6 ML model (นอกจาก LLM)

- Trained locally ใน `apps/api/notebooks/train_models.py`
- Store weights: `apps/api/models/rf_classifier.joblib`, `xgb_classifier.joblib`
- Features: acetone_delta, quality, breath_duration, slope, time_to_peak, recovery_rate, temp, humidity
- Output: 3-class label (low/moderate/high) + confidence

Model นี้ inference ใน `apps/api/app/services/ml_inference.py` — ไม่ใช้ external API, ทำงานใน container ได้เลย

---

## 6. Data flow ทั้งระบบ

```
┌──────────────────────────────────────────────────────────────────┐
│                         ESP32 firmware                            │
│   TGS1820 + XGZP6847A + SHT31 → JSON payload                     │
│   {sensor_voltage, baseline_voltage, pressure_kpa, temp, humid}  │
└─────────────────────────┬────────────────────────────────────────┘
                          │ MQTT publish every 3s
                          │ user=esp32, topic=metabreath/{device_id}/reading
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│         Mosquitto broker (VPS :1883, public)                     │
└─────────────────────────┬────────────────────────────────────────┘
                          │ subscribe metabreath/+/reading
                          ▼
┌──────────────────────────────────────────────────────────────────┐
│                    mqtt-sub (Python worker)                       │
│   1. Verify device UUID + fetch latest calibration               │
│   2. Compute acetone_delta_mv = (sensor - baseline) × 1000       │
│   3. quality_score + reliability_score + classify_acetone        │
│   4. INSERT INTO sensor_readings (TimescaleDB hypertable)        │
│   5. PUBLISH to Redis channel readings:{user_id}                 │
└─────────────────────────┬────────────────────────────────────────┘
                          │
             ┌────────────┴─────────────┐
             ▼                          ▼
┌───────────────────────┐   ┌───────────────────────────────────┐
│  TimescaleDB          │   │  Redis pub/sub                    │
│  (history queries)    │   │  → WebSocket /ws/readings/{uid}   │
└───────────┬───────────┘   └────────────────┬──────────────────┘
            │                                 │
            ▼                                 ▼
┌───────────────────────────────────────────────────────────────┐
│                    FastAPI (Uvicorn :8010)                    │
│                                                                │
│  REST APIs:                                                    │
│    /auth/*         — register, login, refresh, profile        │
│    /sensor/*       — devices, readings, calibrate, firmware   │
│    /ai/*           — predict, trend, chat (Claude)            │
│    /me/*           — xp, streak, badges, quests               │
│    /articles/*     — content, MDX articles                    │
│    /pilot/*        — NSC pilot study endpoints                │
│    /admin/*        — user list, manual reading entry          │
│    /ws/readings/*  — WebSocket live stream                    │
└───────────────────────────┬───────────────────────────────────┘
                            │ HTTPS + WSS
                            ▼
┌───────────────────────────────────────────────────────────────┐
│           Web app (Next.js, https://metabreath.duckdns.org)   │
│                                                                │
│   /home        AcetoneRing hero + streak + categories         │
│   /breathing   Live status + session history                  │
│   /me/device   Device list + calibrate + firmware download    │
│   /me          Profile + XP + badges + language               │
│   /admin       (gated) User list + manual entry               │
│   /trends      7-day forecast                                 │
│   /log/pilot   NSC pilot cohort data entry                    │
│                                                                │
│   FAB → AI Coach chat sheet                                   │
└───────────────────────────────────────────────────────────────┘
```

---

## ภาคผนวก — บัญชี & credentials

### Admin
- **Email:** `plaiad.innovation@gmail.com` (จาก `ADMIN_EMAIL` ใน `.env`)
- **Admin password:** ใน `.env` → `ADMIN_PASSWORD`

### MQTT
- **Broker:** `metabreath.duckdns.org:1883`
- **User for ESP32:** `esp32` / password ใน `.env` → `MQTT_ESP32_PASS`
- **User for backend:** `api` / password ใน `.env` → `MQTT_PASSWORD`

### API endpoints
- **Production:** `https://metabreath.duckdns.org/api`
- **WebSocket:** `wss://metabreath.duckdns.org/ws/readings/{user_id}` (auth token sent via `Sec-WebSocket-Protocol: access_token, <jwt>`, not a URL query param — avoids leaking the token into proxy access logs/history)
- **API docs (dev only):** `/api/docs` — ปิดใน production เพราะ `APP_ENV=production`

### VPS
- **IP:** 45.136.236.57
- **Path:** `/root/cheewarun/`
- **Deploy:** `bash /root/cheewarun/scripts/build-web.sh` + `docker compose up -d`
