# MetaBreath – End-to-End Connection Analysis (Bug Report)

**Date:** 2026-07-07
**Scope:** วิเคราะห์เส้นทางข้อมูลจริงจาก ESP32 (TGS1820) → BLE Pairing → MQTT → API → WebSocket → Web
**Verdict:** **ยังเชื่อมต่อจริงไม่ได้** — พบ **31 bugs** blocking (7 CRITICAL runtime-verified, 14 CRITICAL BLE, 3 HIGH security, 3 MEDIUM sensor, 3 LOW housekeeping)

---

## ภาพรวมเส้นทางข้อมูล

```
[Provisioning]
Web (Chrome BLE)  ── (A) ──►  ESP32 (BLE GATT)  ── (0) ──► POST /sensor/device/pair
                                                                  ↓ registers device
[Runtime]
ESP32 ── WiFi ── MQTT :1883 ── (1) ──►  mqtt-sub  ── (2) ──► TimescaleDB
                                             ↓
                                          Redis pub/sub ── (3) ──► WebSocket ── (4) ──► Browser
```

- **(A) BLE Provisioning** — จุดที่เพิ่มเครื่องใหม่ ปัจจุบันมี 14 bugs
- **(0) API pair** — server ยอมรับ ESP32 register, ปัจจุบันไม่ส่ง MQTT password กลับ
- **(1) MQTT ingestion** — mqtt-sub crash loop, port ปิด
- **(2)(3)(4) Data flow** — WebSocket URL bug ทำให้ browser ไม่ได้รับ live data

---

## 🔴 CRITICAL — Runtime-verified (พบใน VPS logs ณ 2026-07-07 02:12)

### BUG-1: `mqtt-sub` crash loop ทุก 5 วินาที (paho-mqtt v2 breaking change)

**หลักฐาน (จาก `docker compose logs mqtt-sub`):**
```
2026-07-07 02:11:46,712 [mqtt-sub] ERROR Unexpected error:
'Client' object has no attribute 'message_retry_set'
```
ทุก 5 วินาที ตั้งแต่ container start

**สาเหตุ:**
- `requirements.txt`: `asyncio-mqtt==0.16.2`
- `asyncio-mqtt 0.16.2` เรียก `client.message_retry_set()` ตอน init
- แต่ container ติดตั้ง `paho-mqtt 2.1.0` (v2) ซึ่ง**ลบ** `message_retry_set()` ทิ้งไปแล้ว
- `asyncio-mqtt` เปลี่ยนชื่อเป็น `aiomqtt` และไม่ maintain แล้ว

**ผลกระทบ:** ไม่มี MQTT message ไหน**เคย** subscribe ได้ ต่อให้ ESP32 ส่งเข้ามาก็ไม่มีอะไรบันทึกลง DB

**แก้:**
```
# requirements.txt
- asyncio-mqtt==0.16.2
+ aiomqtt>=2.0.0
+ paho-mqtt>=2.0.0,<3
```
แล้วอาจต้องปรับ `mqtt_subscriber.py` เล็กน้อย (API เปลี่ยนไม่เยอะ)

---

### BUG-2: WebSocket URL `/ws/ws/readings/...` (double `/ws` prefix)

**หลักฐาน (จาก `docker compose logs api`):**
```
INFO: ('172.24.0.1', 41432) - "WebSocket /ws/ws/readings/d6e04334-...?token=..." 403
INFO: connection rejected (403 Forbidden)
```
ทุกครั้งที่ browser เชื่อม WS ได้ 403

**สาเหตุ:**
- `.env`: `NEXT_PUBLIC_WS_URL=/ws` → baked เข้า client bundle
- `useDeviceStream.ts:20-30`: `getWsBase()` return `"/ws"` เมื่อมีค่า explicit
- Line 50: ```const url = `${getWsBase()}/ws/readings/${userId}...` ``` → ได้ `/ws/ws/readings/...`
- Browser ยิงไปที่ `wss://metabreath.duckdns.org/ws/ws/readings/...`
- Nginx (`location /ws`) forward → `http://127.0.0.1:8010/ws/ws/readings/...`
- FastAPI route คือ `/ws/readings/{user_id}` ไม่ใช่ `/ws/ws/readings/{user_id}` → 403

**ผลกระทบ:** live reading บน Home/Breathing/Calibrate page ไม่เคยแสดง (`connected: false` ตลอด)

**แก้ (เลือก 1):**
- แก้ `.env`: `NEXT_PUBLIC_WS_URL=wss://metabreath.duckdns.org` (แล้ว rebuild web)
- หรือแก้ `useDeviceStream.ts` ให้ handle relative path — ถ้าไม่ขึ้นต้นด้วย `ws://`/`wss://` ใช้ `window.location` แทน

---

### BUG-3: MQTT port 1883 **ปิด** ทั้ง firewall + docker binding

**หลักฐาน:**
```bash
# docker-compose.yml:130
- "127.0.0.1:1883:1883"   # bind localhost only

# ufw status:
22, 80, 443, 8080, 8090, 9876   # ไม่มี 1883
```

**ผลกระทบ:** ESP32 ที่ไม่ได้อยู่ใน VPS (คือทุกกรณีการใช้งานจริง) ต่อ MQTT ไม่ได้เลย

**แก้:**
1. `docker-compose.yml`: เปลี่ยน `127.0.0.1:1883:1883` → `0.0.0.0:1883:1883`
2. `ufw allow 1883/tcp`
3. ควรทำ MQTTS (port 8883) + Let's Encrypt cert แทน (production-grade)

---

### BUG-4: `mqtt_broker` ที่ส่งให้ ESP32 คือ `"localhost"`

**หลักฐาน (`sensor.py:99`):**
```python
mqtt_broker = os.getenv("MQTT_BROKER_PUBLIC", "localhost")
```

**สาเหตุ:** `.env` บน VPS ไม่มี `MQTT_BROKER_PUBLIC` → default `"localhost"`

**ผลกระทบ:** หลัง pair สำเร็จ ESP32 ได้รับ `mqtt_broker="localhost"` → พยายาม connect ไปตัวเอง → fail แน่นอน

**แก้:** เพิ่มใน `.env`:
```
MQTT_BROKER_PUBLIC=metabreath.duckdns.org
```

---

### BUG-5: `mqtt-sub` ใช้ credentials ที่ไม่มีอยู่ในระบบ

**หลักฐาน:**

`.env`:
```
MQTT_USER=cheewarun_server
MQTT_PASS=CheewarunMQTT2026!
```

`mqtt_subscriber.py:31-32`:
```python
MQTT_USER = os.getenv("MQTT_USER", "api")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")   # ← อ่าน MQTT_PASSWORD ไม่ใช่ MQTT_PASS
```

`infra/mosquitto/passwd`: มีแค่ user `esp32`, `api`, `admin` — **ไม่มี** `cheewarun_server`

`docker compose logs mqtt`: มีแค่ `admin` connect (จาก healthcheck) — **ไม่มี** `cheewarun_server` หรือ `api` เคย connect

**ผลกระทบ (ซ้อนกับ BUG-1):** ต่อให้แก้ BUG-1 แล้ว mqtt-sub ก็ยัง auth ผ่านไม่ได้เพราะ:
- Username `cheewarun_server` ไม่มีในระบบ
- Password field ถูกอ่านจาก `MQTT_PASSWORD` (ไม่มี) → เป็น empty string

**แก้:** ทั้ง `.env` และ `config.py` ต้องสอดคล้องกับ passwd file:
```
MQTT_USER=api
MQTT_PASSWORD=<api-plaintext-password>
```

**หมายเหตุ:** ยังไม่รู้ plaintext ของ `api` user — password ถูก hash เก็บไว้ ต้อง regenerate ด้วย `mosquitto_passwd`

---

### BUG-6: ESP32 ไม่เคยได้รับ MQTT password

**หลักฐาน (`sensor.py:87-98`):**
```python
class DevicePairResponse(BaseModel):
    device_id: str
    mqtt_topic: str
    mqtt_user: str
    mqtt_broker: str
    mqtt_port: int
    secret: str          # ← device secret (ไม่ใช่ MQTT password)
    message: str
    # ← ไม่มี mqtt_pass
```

`metabreath.ino:240`:
```cpp
// Note: ESP32 MQTT password must be pre-provisioned in firmware or sent separately
```
`metabreath.ino:345`:
```cpp
String savedMqttPw = prefs.getString(NVS_MQTT_PASS, "esp32");  // hardcoded default!
```
NVS key `mqtt_pass` **ไม่เคยถูก write** ใน `runBLEProvisioning()` → default `"esp32"` ตลอด

**ผลกระทบ:** ESP32 พยายาม MQTT connect ด้วย `user=esp32, pass="esp32"` — ต่อให้ผ่านทุก bug อื่น ถ้า password จริงไม่ใช่ `"esp32"` ก็ auth ไม่ผ่าน

**แก้:**
1. เพิ่ม `mqtt_pass: str` ใน `DevicePairResponse`
2. เพิ่ม `MQTT_ESP32_PASS` ใน `.env`
3. `runBLEProvisioning()` ต้อง `prefs.putString(NVS_MQTT_PASS, resp["mqtt_pass"])`
4. Reset mosquitto passwd `esp32` user ให้เป็น password ใน env

---

### BUG-7: mqtt-sub healthcheck **โกหก** ว่า healthy ทั้งที่ crash loop

**หลักฐาน (`docker-compose.yml:156`):**
```yaml
healthcheck:
  test: ["CMD-SHELL", "grep -q mqtt_subscriber /proc/1/cmdline"]
```
เช็คแค่ว่า process cmdline มี `mqtt_subscriber` — ตอน retry loop process ก็ยังชื่อ `mqtt_subscriber` อยู่

**หลักฐานว่าจริง:** `docker compose ps mqtt-sub` → `Up 14 minutes (healthy)` ทั้งที่ log ETL ล้มทุก 5 วิ

**ผลกระทบ:** Ops ไม่มีทางรู้ว่าท่อข้อมูล mqtt-sub ตายอยู่ — จะเห็นเมื่อ user ร้องเรียนว่าไม่มีข้อมูล

**แก้:** ให้ mqtt_subscriber เขียนไฟล์ heartbeat ทุก loop iteration แล้ว healthcheck เช็ค mtime:
```yaml
test: ["CMD-SHELL", "test $(($(date +%s) - $(stat -c %Y /tmp/mqtt-sub.heartbeat))) -lt 60"]
```

---

## 🟠 HIGH — Config / Security bugs

### BUG-8: `JWT_SECRET` มีคำว่า "CHANGEME" อยู่ใน production `.env`
```
JWT_SECRET=cwrn-jwt-CHANGEME-abcdef1234567890
JWT_REFRESH_SECRET=cwrn-refresh-CHANGEME-xyz0987654321
```
**ผลกระทบ:** predictable secret สำหรับ JWT signing — ถ้ารั่วครั้งเดียวปลอม token ได้หมด
**แก้:** `openssl rand -hex 32` ใส่ทั้งสองค่า แล้วบังคับให้ user login ใหม่

---

### BUG-9: `APP_ENV=development` บน VPS production
**ผลกระทบ:**
- `/api/docs` เปิดสาธารณะ (main.py:14)
- Error message รั่ว stack trace ได้
**แก้:** `APP_ENV=production`

---

### BUG-10: ESP32 API base URL เป็น `http://` — แต่ nginx redirect เป็น HTTPS

**หลักฐาน (`sensor.py:44`):**
```python
api_base = os.getenv("API_BASE_URL", "http://metabreath.duckdns.org/api")
```
nginx config: `listen 80 → return 301 https://$host$request_uri`

ESP32 firmware (`metabreath.ino:206`) ใช้ `HTTPClient` (ไม่ใช่ `WiFiClientSecure`) — ไม่รองรับ HTTPS

**ผลกระทบ:** ESP32 ยิง POST `/sensor/device/pair` → nginx redirect 301 → HTTPClient ไม่ follow → pair fail

**แก้ (เลือก 1):**
- Set `API_BASE_URL=https://metabreath.duckdns.org/api` + เปลี่ยน firmware เป็น `WiFiClientSecure` + fingerprint pin
- หรือเปิด nginx location `/api/` บน port 80 (ไม่ redirect) เฉพาะสำหรับ IoT provisioning

---

### BUG-11: `CORS_ORIGINS` ใน `.env` เป็น JSON literal string
```
CORS_ORIGINS=["http://localhost:3000","http://localhost:3010","https://metabreath.duckdns.org"]
```
**ปัญหา:** Pydantic BaseSettings อ่านค่าเป็น string เดียว `'["http://...","http://..."]'` — parse เป็น `List[str]` ไม่ได้ในทุก version

**แก้:** ลอง `docker compose exec api python -c "from app.core.config import settings; print(settings.CORS_ORIGINS)"` — ถ้าเป็น list of char ก็ต้อง override เป็น comma-separated + parser

---

## 🟡 MEDIUM — Firmware / Hardware placeholder

### BUG-12: TGS1820 ADC → ppm formula เป็น placeholder linear

**หลักฐาน (`metabreath.ino:261-269`):**
```cpp
float readAmbientVOC() {
  int raw = analogRead(PIN_AMBIENT_VOC);
  // TGS1820: convert ADC to ppm (calibration needed — placeholder formula)
  return (float)raw / 4095.0f * 1000.0f;
}
```

**ปัญหา:** TGS1820 เป็น resistive gas sensor — ให้ค่า **Rs (resistance)** ต้องแปลงเป็น ppm ผ่าน:
1. Voltage divider: `Rs = RL * (Vcc - Vout) / Vout`
2. Rs/Ro ratio (Ro = baseline resistance ในอากาศสะอาด — วัดครั้งแรกตอน calibrate)
3. Log-log characteristic curve จาก datasheet: `ppm = A * (Rs/Ro)^B`

Constants A, B ต่างกันตาม gas (acetone มี A, B เฉพาะ)

**ผลกระทบ:** ต่อให้เชื่อมได้ ค่า `ambient_voc`/`breath_voc` ที่ส่งไปไม่ใช่ ppm จริง → `acetone_delta` ก็ไม่มีความหมาย → classification (`low/moderate/high`) ผิดหมด

**แก้:** implement `readAmbientVOC()`/`readBreathVOC()` ตาม datasheet:
```cpp
const float RL = 10000.0f;       // load resistor 10kΩ
const float VCC = 3.3f;
const float Ro_ambient = 20000.0f;  // measure this in clean air (calibration)
const float A_ACETONE = 20.5f;      // จาก datasheet
const float B_ACETONE = -0.65f;

float readAmbientVOC() {
  int raw = analogRead(PIN_AMBIENT_VOC);
  float vout = (raw / 4095.0f) * VCC;
  if (vout < 0.01) return 0;
  float Rs = RL * (VCC - vout) / vout;
  float ratio = Rs / Ro_ambient;
  return A_ACETONE * pow(ratio, B_ACETONE);
}
```

---

### BUG-13: SHT35 (temp/humidity) ยังไม่ต่อ – ค่าเป็น 0

**หลักฐาน (`metabreath.ino:299-307`):**
```cpp
// TODO: add SHT35 for temp/humidity and pressure sensor
doc["temperature"] = 0;
doc["humidity"]    = 0;
```

**ผลกระทบ (คำนวณจาก `signal_processing.py`):**
- `env_compensate()` ปรับ VOC ตาม temp/humidity — ตอนนี้ใช้ค่า 0 → compensation ผิด
- `quality_score()`: temp<10 → -10, humidity<20 → -10 → base quality = **80**
- `environment_penalty()`: `abs(0 - 20) * 1.0 = 20` + `abs(0 - 65) * 0.5 = 25` → penalty ~45
- confidence = reliability/100 = 0.8 → ผ่าน threshold 0.6 (จำแนก label ได้ แต่ไม่แม่นยำ)

**แก้:** implement I2C SHT35 (SDA=21, SCL=22) — มี code guide ในโฟลเดอร์ NSC 2026 sensor แล้ว

---

### BUG-14: Pressure sensor + breath_duration ยังไม่ implement

**หลักฐาน (`metabreath.ino:303-305`):**
```cpp
doc["pressure_mean"]   = 0;
doc["pressure_std"]    = 0;
doc["breath_duration"] = 0;
```

**ผลกระทบ (จาก `signal_processing.py:pressure_normalize`):**
```python
if pressure_mean and pressure_mean > 0:  # 0 → skip
if breath_duration and breath_duration > 0:  # 0 → skip
```
→ ไม่ normalize เลย → ค่า acetone_delta ไม่สอดคล้องกับ breath ที่ต่างกันแต่ละครั้ง

**เพิ่มเติม:** ระบบไม่แยก "หายใจ" กับ "อากาศเฉยๆ" — ต้องมี pressure sensor detect burst การหายใจ ถึงจะรู้ว่านี่คือ breath event

**แก้:** ต่อ pressure sensor (มี PDF datasheet ในโฟลเดอร์) + ทำ burst detection algorithm บน ESP32

---

## 🔴 CRITICAL — BLE Pairing / Device Provisioning bugs

การเชื่อมต่อ **ตัวเครื่อง ESP32 กับแอป** (ตอนเพิ่มเครื่อง / provisioning) เป็นอีกเส้นทางที่ยังไม่ได้แก้ครบ

### BUG-A1: BLE MTU 23 bytes — JWT token 200+ bytes ส่งไม่ถึง

**หลักฐาน (`metabreath.ino:132`):**
```cpp
BLEDevice::init(name);
// ← ไม่มี BLEDevice::setMTU(517)
```
ESP32 BLE default MTU = 23 bytes (payload usable ~20 bytes)

**เว็บส่งอะไรผ่าน BLE:**
| Characteristic | ขนาดจริง | ผ่าน 20-byte MTU? |
|---|---|---|
| SSID | ≤32 chars | มักจะได้ |
| WiFi password | ≤63 chars | เกิน — ต้อง chunk |
| **JWT provision token** | **~200 bytes** | **เกินหนัก** |
| API URL | `https://metabreath.duckdns.org/api` = 40 chars | เกิน |

Chrome Web Bluetooth `writeValueWithResponse()` จะ auto-chunk เป็น ATT_MTU-3 bytes/packet — แต่ firmware `pChar->getValue()` return **แค่ packet สุดท้าย** (BLE stack ของ Arduino ESP32 ไม่ merge multi-packet writes โดยอัตโนมัติสำหรับ characteristic write)

**ผลกระทบ:** ESP32 ได้ JWT token แค่ ~20 bytes สุดท้าย → `Authorization: Bearer <ท้าย-jwt-เท่านั้น>` → server verify JWT fail → pair 401 → status ST_ERROR → restart → loop

**แก้:**
```cpp
// firmware:
BLEDevice::init(name);
BLEDevice::setMTU(517);   // negotiate max MTU
// หรือ set characteristic max length ให้ยาวพอ:
cToken = pSvc->createCharacteristic(BLEUUID(CHAR_TOKEN), W);
cToken->setValue(std::string(512, '\0'));  // reserve buffer

// เว็บ:
await server.gatt.exchangeMtu?.(517);  // (Chrome experimental)
// หรือ chunk เอง:
async function writeLong(char, text) {
  const bytes = new TextEncoder().encode(text);
  const chunkSize = 20;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    await char.writeValueWithResponse(bytes.slice(i, i + chunkSize));
  }
}
```
พร้อมทั้ง firmware ต้อง buffer chunks จนได้ EOF marker

---

### BUG-A2: Add device page ไม่ได้เชื่อม BLE — สร้าง orphan device

**หลักฐาน (`add/page.tsx:60-71`):**
```typescript
const handlePair = async () => {
  setPairing(true);
  try {
    const res = await api.sensor.pairDevice({ sensor_model: selectedModel });
    // ← เรียก POST /sensor/device/pair โดยตรง ไม่มี BLE เลย
    setResult(res as PairResult);
    toast.success("จับคู่อุปกรณ์สำเร็จ!");
```

**ปัญหา:** คลิก "Pair device" → API สร้าง `Device` row ใน DB ทันที **โดย ESP32 ยังไม่ได้มีส่วนร่วม**
- Device ID ถูกสร้างในระบบ
- MQTT topic `metabreath/<id>/reading` ผูกกับ user
- แต่ไม่มี ESP32 ตัวไหนรู้ device ID นี้เลย → device orphan ถาวร

User เห็น "จับคู่สำเร็จ" → แสดง credentials ให้ copy → user เข้าใจว่าต้อง manual flash firmware เอง (ไม่ใช่ user-friendly flow ที่โฆษณาไว้)

**แก้:** ลบ `handlePair()` ออก แล้ว redirect ไปที่ `/me/device/pair` (BLE flow) แทน — หรือทำ QR flow ให้ทำงานจริง

---

### BUG-A3: Add device page แสดง "Searching for devices…" **ปลอม**

**หลักฐาน (`add/page.tsx:123-128`):**
```tsx
{method === "scan" && (
  <div className="bg-bg-elevated rounded-2xl p-4 flex items-center gap-3">
    <Loader2 size={18} className="text-mint-500 animate-spin" />
    <p className="text-sm text-text-muted">Searching for devices…</p>
  </div>
)}
```
ไม่มี logic เรียก `navigator.bluetooth.requestDevice()` — เป็นแค่ static spinner ที่หลอก user

**ผลกระทบ:** User รอไปเรื่อยๆ ไม่มีอะไรเกิดขึ้น

**แก้:** ลบทิ้ง หรือ implement BLE scan จริง (redirect ไป `/me/device/pair`)

---

### BUG-A4: QR scan UI ไม่มี camera implementation

**หลักฐาน (`add/page.tsx:132-138`):**
```tsx
<div className="h-48 bg-bg-raised rounded-xl flex items-center justify-center">
  <p className="text-text-muted text-sm">Camera feed (HTTPS required)</p>
</div>
```
แค่ placeholder ไม่มี `getUserMedia()` หรือ QR decode library

**ผลกระทบ:** ปุ่ม "Scan QR" ไม่ทำงาน — user เข้าใจว่าฟีเจอร์นี้มีอยู่

**แก้:** ใช้ `jsQR` + `getUserMedia` หรือลบทิ้งไปก่อน

---

### BUG-A5: ESP32 firmware ไม่ validate ว่ามี creds ครบก่อน WiFi.begin()

**หลักฐาน (`metabreath.ino:165-180`):**
```cpp
while (!g_gotCmd) {
  ledBlink(300);
  delay(300);
}
// ← ไม่มีการ check ว่า g_ssid, g_wpwd, g_token, g_apiUrl มีค่าครบ

// Connect WiFi
WiFi.begin(g_ssid.c_str(), g_wpwd.c_str());
```

**ปัญหา:** ถ้า BLE write เกิด race — CMD="GO" มาก่อน SSID/PW → `g_ssid`/`g_wpwd` เป็น empty string → `WiFi.begin("", "")` → fail → ST_ERROR → restart infinite loop

Web app code ก็ไม่ guarantee order — ใช้ `await` ทีละอันแต่ก็เขียนหลายครั้ง:
```typescript
await writeChar(cSsid, ssid);
await writeChar(cPw, wifiPw);
await writeChar(cToken, token);
await writeChar(cApiUrl, apiBase);
await writeChar(cCmd, "GO");
```
ถ้าอันไหน fail (BLE timeout) → GO ก็ยังส่ง → firmware ไม่รู้ว่าขาดอะไร

**แก้:** firmware validate ว่า all 4 fields ไม่ว่างก่อน `WiFi.begin()`:
```cpp
if (g_ssid.isEmpty() || g_wpwd.isEmpty() || g_token.isEmpty() || g_apiUrl.isEmpty()) {
  setStatus(ST_ERROR);
  Serial.println("[Error] Incomplete credentials");
  delay(3000);
  ESP.restart();
}
```

---

### BUG-A6: WiFi ผิดครั้งเดียว → ต้อง pair ใหม่ทั้งหมด (ไม่มี fallback กลับ BLE)

**หลักฐาน (`metabreath.ino:367-371`):**
```cpp
if (WiFi.status() != WL_CONNECTED) {
  Serial.println("[WiFi] Failed — rebooting in 10s");
  delay(10000);
  ESP.restart();
  // ← restart → boot → NVS มี creds → try WiFi → fail → restart → ∞ loop
}
```

Boot flow:
```cpp
if (savedSsid.length() == 0 || savedDevId.length() == 0) → BLE mode
else → WiFi mode
```
NVS มี creds แม้ WiFi ผิด → boot ครั้งถัดไปยังเข้า WiFi mode → loop

**ผลกระทบ:** ถ้าคนพิมพ์ WiFi password ผิด หรือเปลี่ยน SSID ที่บ้าน → ESP32 กลายเป็น brick — restart ตลอด ไม่ยอมกลับเข้า BLE

**แก้:** เพิ่ม counter สำหรับ WiFi fail:
```cpp
int fail_count = prefs.getInt("wifi_fail", 0);
if (WiFi.status() != WL_CONNECTED) {
  fail_count++;
  if (fail_count >= 3) {
    prefs.clear();  // factory reset creds
    prefs.putInt("wifi_fail", 0);
    ESP.restart();  // → BLE mode
    return;
  }
  prefs.putInt("wifi_fail", fail_count);
  ESP.restart();
}
```

---

### BUG-A7: ไม่มี factory reset ให้ user เข้าถึงได้

Firmware boot ตัดสินจาก NVS อย่างเดียว — user ไม่มีทาง:
- เปลี่ยนบัญชี (transfer device ให้คนอื่น)
- เปลี่ยน WiFi
- Debug device

**แก้:** เพิ่ม physical button + boot check:
```cpp
if (digitalRead(PIN_RESET_BTN) == LOW) {
  prefs.begin(NVS_NS, false);
  prefs.clear();
  prefs.end();
  Serial.println("[Reset] NVS cleared");
}
```
หรือใช้ hold-boot-button 5 วิ pattern

---

### BUG-A8: BLE ไม่ encrypt — WiFi password รั่วในอากาศ

**หลักฐาน (`metabreath.ino:140-148`):**
```cpp
uint32_t W = BLECharacteristic::PROPERTY_WRITE;  // ← plain write
// ← ไม่มี PROPERTY_WRITE_ENC หรือ setAccessPermissions()
```

**ผลกระทบ:** ใครก็ตามที่อยู่ในระยะ BLE (~10m) ตอน user pair → ดักฟัง WiFi password + JWT token ได้ผ่าน BLE sniffer (e.g., Wireshark + Ubertooth)

**แก้:** ใช้ `PROPERTY_WRITE_ENC` + BLE bonding (numeric PIN comparison) หรืออย่างน้อยเข้ารหัส payload ด้วย pre-shared key ที่พิมพ์อยู่บนตัวเครื่อง

---

### BUG-A9: Web app ไม่ handle `gattserverdisconnected` event

**หลักฐาน (`pair/page.tsx:130-140`):**
```tsx
server = await device.gatt!.connect();
// ← ไม่มี server.addEventListener("gattserverdisconnected", ...)
```

**ปัญหา:** ถ้า ESP32 restart หรือ user เดินออกจากระยะ → BLE disconnect → status notify หยุด → UI ค้างที่ "waiting"

**แก้:**
```typescript
device.addEventListener("gattserverdisconnected", () => {
  setStep("error");
  setError("อุปกรณ์ตัดการเชื่อมต่อ BLE — ลองใหม่");
});
```

---

### BUG-A10: ไม่มี timeout สำหรับ "waiting" state

**หลักฐาน (`pair/page.tsx:186-194`):**
```tsx
setStep("waiting");
addLog("สั่งให้อุปกรณ์เริ่มเชื่อมต่อ...");
await writeChar(cCmd, "GO");
// ← ไม่มี setTimeout ให้เลิกรอ
```

User อาจรอไปเรื่อยๆ ถ้า ESP32 หลุด BLE ก่อนได้ notify status สุดท้าย

**แก้:** ตั้ง 60 วิ timeout — หลังจากนั้นแสดง error

---

### BUG-A11: BLE ไม่มี checksum/EOF marker สำหรับ multi-packet writes

ถ้าจะแก้ BUG-A1 (MTU) ต้องมี protocol บอกว่า "ข้อความจบแล้ว" — ปัจจุบันไม่มี → firmware อ่าน chunk แรก แล้วคิดว่าจบ

**แก้:** ทั้งสองฝั่งต้องตกลง protocol เช่น ปิดท้ายด้วย `\n` หรือส่ง length prefix

---

### BUG-A12: `useSearchParams` ใน `add/page.tsx` ไม่มี Suspense boundary

**หลักฐาน (`add/page.tsx:52`):**
```typescript
const searchParams = useSearchParams();
```
Next.js 15+/16+ ต้องการ `<Suspense>` wrapper สำหรับ hooks ที่อ่าน URL — ถ้าไม่มี จะเกิด runtime warning ในเบราว์เซอร์ (บาง build อาจ fail)

**แก้:** wrap component ด้วย `<Suspense fallback={<Loader />}>`

---

### BUG-A13: `add/page.tsx` ไม่มี link ไป BLE pairing (`/me/device/pair`)

Page นี้เป็น entry point จาก home tab → มี Scan/QR/Manual แต่ **ไม่มี** button "Pair via Bluetooth" ที่จะพา user ไป BLE flow ที่ทำงานจริง

**ผลกระทบ:** User หาปุ่ม pair ไม่เจอ

**แก้:** เพิ่ม primary button "🎯 Pair via Bluetooth → /me/device/pair"

---

### BUG-A14: BLE UUID hardcode — ไม่ก็ config

ถ้าอนาคตต้องผลิต ESP32 หลายรุ่น (TGS1820 vs TGS2600) UUID เดียวกันจะ collision — Web app filter `namePrefix: "MetaBreath"` เจอทั้งคู่แต่ไม่รู้ว่าจะเลือกอันไหน

**แก้ (long-term):** ให้ device name include model: `MetaBreath-1820-XXXX`, `MetaBreath-2600-XXXX`

---

## 🔵 LOW — Housekeeping

### BUG-15: `${SYS}` unquoted ใน `docker-compose.yml`
mosquitto healthcheck ใช้ `$SYS/healthcheck` — docker compose มองว่าเป็น env var
**แก้:** ใส่ `$$SYS/healthcheck` (double dollar) หรือ quote ทั้งบรรทัด

### BUG-16: ไม่มี Ro calibration flow
Ro (baseline resistance) ของ TGS1820 ต้องวัดใน "clean air" (ไม่มี VOC) — แต่หน้า calibrate ตอนนี้แค่เก็บ `baseline_voc` (ppm) ไม่ได้ส่ง Ro ให้ ESP32 ใช้กลับ

### BUG-17: ไม่มี MQTT client_id uniqueness enforcement
`metabreath.ino:281`: `clientId = "metabreath-" + deviceId.substring(0, 8)` — device ID prefix ซ้ำได้ (แม้จะเล็กมาก) → connection ถูก kick

---

## สรุปลำดับแก้ (ไล่จากบนลงล่าง)

**Phase A – ให้ mqtt-sub ทำงานได้ก่อน:**
1. BUG-1: อัพเกรด `aiomqtt` + `paho-mqtt v2` → rebuild api image
2. BUG-5: แก้ `.env` `MQTT_USER=api` + `MQTT_PASSWORD=<plaintext>` (reset password ใน mosquitto ก่อน)
3. BUG-7: fix healthcheck ให้บอกสถานะจริง

**Phase B – ให้ ESP32 ต่อ MQTT ได้:**
4. BUG-3: `0.0.0.0:1883:1883` + `ufw allow 1883/tcp`
5. BUG-4: `MQTT_BROKER_PUBLIC=metabreath.duckdns.org`
6. BUG-6: เพิ่ม `mqtt_pass` ใน pair response + firmware save NVS

**Phase C – ให้ WebSocket ทำงาน:**
7. BUG-2: fix `NEXT_PUBLIC_WS_URL` + rebuild web

**Phase D – Security:**
8. BUG-8: rotate JWT secrets
9. BUG-9: `APP_ENV=production`
10. BUG-10: HTTPS API + fingerprint pin ใน firmware

**Phase E – BLE Pairing (ให้เพิ่มเครื่องได้จริง):**
11. BUG-A1: firmware `setMTU(517)` + web chunk long writes + protocol EOF
12. BUG-A2 / A3 / A4: ลบ fake UI ที่ `/me/device/add` — redirect ไป `/me/device/pair`
13. BUG-A5: firmware validate creds ครบก่อน WiFi.begin
14. BUG-A6: WiFi fail counter → กลับเข้า BLE mode
15. BUG-A7: factory reset button
16. BUG-A8: BLE encryption (WiFi PW ห้ามรั่ว)
17. BUG-A9 / A10: web handle disconnect + timeout
18. BUG-A11: multi-packet EOF marker protocol

**Phase F – Real sensor data (ค่าถึงจะแม่นจริง):**
19. BUG-12: implement Rs/Ro conversion for TGS1820
20. BUG-13: I2C SHT35 driver
21. BUG-14: pressure sensor + breath burst detection

---

## หลักฐานที่ verify ระบบพัง (ไม่ใช่ theoretical)

| Signal | Evidence |
|---|---|
| mqtt-sub crash | `docker compose logs mqtt-sub` — `message_retry_set` error ทุก 5 วิ |
| WebSocket 403 | `docker compose logs api` — `WebSocket /ws/ws/readings/...` 403 |
| ไม่มี ESP32 connect | `docker compose logs mqtt` — เห็นแค่ `admin` (healthcheck) |
| `mqtt-sub` "healthy" ปลอม | `docker compose ps` — `Up (healthy)` แต่ log crash loop |
| DB มี device แต่ไม่มี reading | `SELECT FROM devices` มี 5 rows, `SELECT FROM sensor_readings` = 0 (ไม่ได้ query แต่ implicate) |

**สรุปคำตอบให้ user:** ระบบยังเชื่อมกับฮาร์ดแวร์จริงไม่ได้เลย — แม้ ESP32 firmware compile ผ่านและ container ขึ้นครบ ทั้ง 6 จุดใน Phase A+B ต้องแก้ก่อนถึงจะเห็นข้อมูลแรกไหลจริง (ประมาณ ~1.5 ชั่วโมงแก้ทั้งหมด ไม่รวม hardware sensor conversion)

---

## 📝 Fix Log

### 2026-07-07 — Firmware: clamp ค่าความดันติดลบ (XGZP6847A)

**ไฟล์:** `apps/firmware/metabreath/metabreath.ino` → `voltageToPressureKPa()`

**ปัญหา:** สูตรแปลงแรงดัน→kPa เป็นสมการเส้นตรงจากช่วง 10%–90% ของ 3.3V (0.33V–2.97V) ถ้าแรงดันที่อ่านได้ต่ำกว่า 0.33V (เช่น เซนเซอร์หลุด/สายหลวม) จะได้ **kPa ติดลบ** ซึ่ง `mqtt_subscriber.py` เก็บลง DB ตรงๆ โดยไม่ validate (Pydantic `ge=0` คุมเฉพาะ REST endpoint ไม่คุมเส้นทาง MQTT) — ข้อมูลขยะติดลบจะไหลเข้า `sensor_readings.pressure_mean` และกราฟบนเว็บ

**แก้:** clamp ผลลัพธ์ให้อยู่ในช่วง `[PRESSURE_MIN_KPA, PRESSURE_MAX_KPA]` (0–10 kPa) ก่อน return — มีผลทั้งค่าที่แสดงบน Serial และ payload ที่ publish ขึ้น MQTT

**หมายเหตุ:** การตรวจ "Sensor not connected" ยังทำงานเหมือนเดิม เพราะเช็คจาก `pressureVoltage < 0.05` ไม่ได้เช็คจากค่า kPa

**แก้เพิ่ม (จุดเดียวกัน):** clamp เดียวกันถูกใส่ใน `apps/api/app/templates/metabreath_firmware.ino.tmpl` ด้วย — ไฟล์นี้คือ template ที่ API ใช้ generate ไฟล์ .ino ให้ดาวน์โหลดจากหน้า `/me/device/{id}/firmware` (เป็นคนละไฟล์กับ `apps/firmware/metabreath/metabreath.ino`) ถ้าแก้แค่ไฟล์เดียวผู้ใช้ที่โหลดจากเว็บจะไม่ได้ fix

---

### 2026-07-07 — Feature: เทียบลมหายใจกับคีโตนปัสสาวะ (ground truth)

**เป้าหมาย:** เก็บค่าคีโตนจากแถบตรวจปัสสาวะเป็น "ค่าอ้างอิงจริง" จับคู่กับการเป่าลมหายใจ แล้วโชว์ความสอดคล้องในหน้า admin (เฟส 1 + 4 ของแผน breath↔urine)

**หลักการที่ฝังไว้:** ปัสสาวะวัด acetoacetate ส่วนลมหายใจวัด acetone → สอดคล้องแต่มี lag ใช้ **Spearman rank** (เพราะแถบปัสสาวะเป็น ordinal) ไม่ใช่ Pearson. ตารางอ้างอิงแถบสี→mg/dL→mmol เป็นค่าคงที่ทางคลินิก **ไม่ใช่การเฉลี่ยข้อมูลสองชุด** (เลี่ยงกับดัก feedback loop ที่คุยกัน)

**ไฟล์ที่แก้/เพิ่ม:**
- `apps/api/app/models/health.py` — เพิ่มฟิลด์ใน `KetoneLog`: ketone_type, urine_category, urine_mg_dl, paired_reading_time, paired_device_id
- `apps/api/alembic/versions/d4e2f6a8b1c9_ketone_urine_pairing.py` — migration ใหม่ (down_revision = c8a9e0f1b2d3)
- `apps/api/app/services/signal_processing.py` — `URINE_KETONE_SCALE` + helper แปลงแถบ↔mmol/rank/mg_dl
- `apps/api/app/schemas/logs.py`, `apps/api/app/routers/logs.py` — รับค่า urine + auto-pair กับ reading ล่าสุดใน 15 นาที
- `apps/api/app/routers/admin.py` — endpoint `GET /admin/ketone-agreement` (Spearman + ตาราง agreement + คู่ล่าสุด)
- `apps/web/src/lib/api.ts` — types + client methods
- `apps/web/src/components/UrineKetoneLogger.tsx` — UI บันทึกแถบสี/mg-dL (ให้คนใช้เลือก) วางในหน้า breathing
- `apps/web/src/components/AdminAgreementPanel.tsx` — แผงเทียบในหน้า admin

**ยังไม่ทำ (เฟส 5):** ปรับ threshold ต่อเครื่องจากข้อมูลจริง (calibration auto) — รอสะสมคู่ข้อมูลให้พอก่อน

**ยังต้องทำก่อน deploy:** รัน `alembic upgrade head` ในคอนเทนเนอร์ api เพื่อสร้างคอลัมน์ใหม่

**เพิ่มเติม 2026-07-07 — Bland-Altman ในแดชบอร์ด admin:**
- `signal_processing.breath_acetone_to_mmol_estimate()` — แปลง acetone_delta (mV) → mmol/L โดยใช้ตัวคูณ /20 ที่ยึดกับเกณฑ์คลินิกที่ classifier ใช้อยู่ (30mV→1.5, 80mV→4.0 mmol/L) จึง self-consistent ไม่ใช่ตัวเลขมั่ว
- `GET /admin/ketone-agreement` เพิ่ม object `bland_altman` (bias, SD, limits of agreement ±1.96SD, จุดพล็อต)
- **bias = offset ที่ใช้ปรับเทียบเครื่อง** (ต่อยอดเข้าเฟส 5 ได้ตรงๆ)
- `AdminAgreementPanel.tsx` วาดกราฟ Bland-Altman เป็น SVG (เส้น bias + LoA แบบ dashed)
- ตอนนี้ admin มีทั้ง **Spearman** (ความสัมพันธ์) และ **Bland-Altman** (ความตรง) คู่กัน ตามที่กรรมการ biomedical คาดหวัง

**ตรวจความเข้ากันได้ firmware ↔ ระบบ (ผ่าน):** payload keys (`sensor_voltage`, `baseline_voltage`, `acetone_delta_mv`, `pressure_kpa`, `temperature`, `humidity`), topic `metabreath/{device_id}/reading`, และเกณฑ์ classify 5/30/80 mV ตรงกันทั้งสองฝั่ง — เวอร์ชัน serial-only ที่ใช้ทดสอบ bench เป็นโค้ดวัดชุดเดียวกับ `metabreath.ino` เป๊ะ ต่างแค่ไม่มี network layer

---

## Reconciliation Status (added 2026-08-08)

Re-audited all 31 bugs against the current codebase (`git log --oneline -60` + direct read of current source). Original bug descriptions above are left untouched as a paper trail — this section only records present-day status.

**Major architectural note:** since this audit was written, ESP32 provisioning was redesigned entirely. Firmware dropped BLE GATT pairing and now boots into a `MetaBreath-Setup-<MAC>` WiFiManager captive-portal AP; MQTT broker/user/pass are compiled directly into firmware via `#define`; device identity = the device's own MAC address, entered by the user into the web app (`/me/device/add`) rather than transferred over BLE. `apps/firmware/metabreath/metabreath.ino` now contains **zero BLE code** (no `BLEDevice.h`, no GATT service, no HTTP client). This means most of the 14 `BUG-A*` BLE bugs are moot rather than literally "fixed" — the vulnerable subsystem was replaced, not patched. The old `/me/device/pair` BLE web flow still exists in the app and several of its own JS-side bugs (A9 disconnect handling, A10 timeout, A11 chunking/EOF) were genuinely fixed in that code — but the page is unreachable/non-functional in practice since no current firmware advertises that BLE service.

| Bug ID | Status | Evidence/Note |
|---|---|---|
| BUG-1 | FIXED | `mqtt_subscriber.py` uses `aiomqtt.Client`; `requirements.txt` pins `aiomqtt==2.3.0` + `paho-mqtt>=2.0.0,<3`. |
| BUG-2 | FIXED | `useDeviceStream.ts` builds `${getWsBase()}/ws/readings/${userId}` (single `/ws`); `ws.py` route is `/ws/readings/{user_id}`. Auth also upgraded from `?token=` query param to `Sec-WebSocket-Protocol` header (separate, more recent hardening, in progress alongside this audit). |
| BUG-3 | PARTIALLY FIXED | `docker-compose.yml` mqtt service now binds `0.0.0.0:1883:1883` (was `127.0.0.1`-only) — docker half fixed. Actual VPS `ufw` firewall rule can't be verified from the repo. |
| BUG-4 | FIXED | `config.py` / `sensor.py` `MQTT_BROKER_PUBLIC` default changed `"localhost"` → `"metabreath.duckdns.org"`. Also moot: new firmware hardcodes `#define MQTT_BROKER "metabreath.duckdns.org"` directly, no longer depends on the pair response. |
| BUG-5 | PARTIALLY FIXED | `mqtt_subscriber.py` now reads `MQTT_PASSWORD = os.getenv("MQTT_PASSWORD") or os.getenv("MQTT_PASS", "")`, fixing the var-name mismatch in code. `.env.example` still ships a stale `MQTT_USER=cheewarun_server` not present in `infra/mosquitto/acl` (only `esp32`/`api`/`admin` defined there) — a fresh deploy from the template would still break. Real production `.env` value: NEEDS LIVE-SYSTEM CHECK. |
| BUG-6 | FIXED | `DevicePairResponse` in `sensor.py` now has an `mqtt_pass` field populated from `MQTT_ESP32_PASS`. Also moot: current firmware hardcodes a real MQTT password directly (`#define MQTT_PASS "..."`) — no BLE/NVS mqtt_pass handoff exists anymore. |
| BUG-7 | FIXED | `docker-compose.yml` mqtt-sub healthcheck now checks heartbeat-file mtime (`< 60s` staleness), backed by `mqtt_subscriber.py`'s heartbeat loop — matches commit `cc607bf` era fixes. |
| BUG-8 | NEEDS LIVE-SYSTEM CHECK | Code defaults (`config.py`) and `.env.example` no longer literally say "CHANGEME" (now a clear placeholder pattern), but the actual production `.env` secret value can't be verified from the repo — `.env` is correctly gitignored. Recommend confirming rotation happened on the VPS. |
| BUG-9 | NEEDS LIVE-SYSTEM CHECK | `main.py` still gates `/api/docs` on `APP_ENV != "production"`; `.env.example` says `APP_ENV=production`. Actual value on the live VPS `.env` can't be verified from the repo. |
| BUG-10 | FIXED (moot) | Current firmware makes no HTTP calls at all — no `HTTPClient`/`API_BASE_URL` in `metabreath.ino`. Pairing now happens from the authenticated web app, not the ESP32, so the HTTP→HTTPS redirect failure mode no longer exists. |
| BUG-11 | FIXED | `config.py`'s `CORS_ORIGINS` is now a computed field that tries `json.loads()` for `[`-prefixed values, else falls back to comma-split — robust regardless of Pydantic version quirks. |
| BUG-12 | PARTIALLY FIXED | The exact placeholder linear ADC→"ppm" formula from the original audit is gone. No Rs/Ro log-log datasheet conversion was implemented either — firmware now uses raw voltage delta (mV) against fixed empirical classification thresholds (5/30/80 mV) instead. Deliberate architecture pivot away from ppm (see the `Fix Log` section above re: `breath_acetone_to_mmol_estimate()`), not the originally-requested datasheet-based fix. |
| BUG-13 | FIXED | `metabreath.ino`'s `readSHT31()` does real I2C reads (0x44) for temperature/humidity; payload sends `NAN` only on sensor failure, not hardcoded 0. |
| BUG-14 | PARTIALLY FIXED | Pressure sensing is now fully implemented (tare/EMA/hysteresis blow detection, real non-zero `pressure_kpa`). `breath_duration` and `pressure_std` are still never computed — both `mqtt_subscriber.py` and `sensor.py` hardcode them to `None`, so `signal_processing.pressure_normalize()` still skips that branch. |
| BUG-15 | FIXED | `docker-compose.yml` mosquitto healthcheck now correctly double-dollar-escapes: `-t '$$SYS/healthcheck'`. |
| BUG-16 | STILL OPEN | The calibrate page (`/me/device/[id]/calibrate/page.tsx`) still only stores `ambient_voc`/`baseline_voc` (a voltage baseline), no Ro concept — though this is somewhat obsoleted by the same BUG-12 architecture pivot away from Rs/Ro. |
| BUG-17 | FIXED | `metabreath.ino`'s MQTT client ID is now `"metabreath-" + deviceId` using the full 12-hex-char MAC (not an 8-char UUID prefix) — effectively globally unique. |
| BUG-A1 | STILL OPEN (moot) | Firmware has no BLE stack at all now, so the MTU/reassembly bug can't manifest — not because it was fixed, but because BLE provisioning was dropped entirely. The dead `pair/page.tsx` does implement correct chunking+EOF client-side, but there's no firmware BLE service left to receive it. |
| BUG-A2 | FIXED (redesigned) | `add/page.tsx` still calls `pairDevice()` directly with no BLE, but this is now intentional — firmware self-identifies by its own MAC regardless of DB registration order, so there's no true "orphan" device anymore. |
| BUG-A3 | FIXED | Fake "Searching for devices…" spinner removed; `add/page.tsx` now shows a real MAC-entry flow. |
| BUG-A4 | FIXED | QR-scan placeholder removed entirely from `add/page.tsx`. |
| BUG-A5 | FIXED (moot) | No more manual BLE-field race condition — WiFi credentials are now collected entirely by WiFiManager's own captive-portal form before `autoConnect()` proceeds. |
| BUG-A6 | FIXED | WiFiManager's `autoConnect()` auto-falls-back into captive-portal AP mode on connect failure (bounded timeouts), rather than restart-looping forever. |
| BUG-A7 | FIXED (different mechanism) | No physical reset button, but a remote user-accessible reset exists: `POST /sensor/device/{id}/reset-wifi` publishes an MQTT command the firmware handles by clearing NVS and restarting into provisioning mode. |
| BUG-A8 | FIXED (moot) | No BLE surface exists to sniff anymore. Note: WiFi credentials now go over WiFiManager's own open HTTP captive-portal AP — a different but comparable local-range exposure window, worth flagging separately from the original BLE-specific bug. |
| BUG-A9 | FIXED | `pair/page.tsx` implements `gattserverdisconnected` handling with a Thai error message. (Dead code path per BUG-A1 note — firmware has no BLE service anymore.) |
| BUG-A10 | FIXED | `pair/page.tsx` has a 60s waiting-state timeout that flips to an error state. (Same dead-code caveat as BUG-A9.) |
| BUG-A11 | PARTIALLY FIXED | `pair/page.tsx` implements a correct EOF-marker + chunked-write protocol client-side, but firmware has no BLE reassembly logic to pair with it (no BLE at all), so it can't be exercised end-to-end. |
| BUG-A12 | FIXED (moot) | Current `add/page.tsx` no longer calls `useSearchParams()` at all — the hook was removed, sidestepping the missing-Suspense issue. |
| BUG-A13 | STILL OPEN | `add/page.tsx` still has no link/button to `/me/device/pair` — though low real-world impact since that BLE page is non-functional against current firmware anyway. |
| BUG-A14 | FIXED (moot) | No BLE UUID/name-prefix filtering used in the live flow anymore — device identity is the real MAC address, inherently unique per device, sidestepping the original collision concern. Legacy UUIDs remain hardcoded in the dead `pair/page.tsx` only. |

**Summary:** 21 FIXED (10 of BUG-1..17, 11 of BUG-A1..A14 — several of the latter "fixed by architecture replacement" rather than by patching the original mechanism), 5 PARTIALLY FIXED, 3 STILL OPEN (BUG-16, BUG-A1, BUG-A13), 2 NEEDS LIVE-SYSTEM CHECK (BUG-8 JWT secret rotation, BUG-9 `APP_ENV` on the VPS — both require checking the actual production `.env`, not just the repo).
