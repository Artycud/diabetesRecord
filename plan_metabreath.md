# MetaBreath Integration Plan
> แผนพัฒนา MetaBreath ให้สอดคล้องกับ NSC 2026 MetaBreath ตามข้อมูลใน `แข่งชนะ by Coach Bright_NSC/`

- **สร้าง**: 2026-07-06
- **เจ้าของ**: Pranai
- **Companion กับ**: `plan.md` (แผนหลักของ MetaBreath)
- **Scope**: อ่านและปรับตาม **Comments กรรมการ** + **แผนเก็บข้อมูล** + **ข้อกำหนดจากอาจารย์**

---

## 0. Executive Summary

### สภาพปัจจุบัน
- MetaBreath Phase 0–3 เสร็จแล้ว (auth, log, gamification, articles)
- Phase 5 (MQTT/Sensor) + Phase 6 (AI) ยังไม่เริ่ม
- Kaggle datasets: 6 ชุดที่ download แล้ว (diabetes/metabolic/CGM) แต่ **ขาด 2 ชุดที่กรรมการและอาจารย์แนะนำโดยตรง**

### สิ่งที่กรรมการชี้ (Comments กรรมการ_เพื่อปรับก่อน 17 กค.)
1. ⚠️ Scope ใหญ่เกินไป — biomedical + IoT + AI + clinical + pilot study
2. ⚠️ ไม่มี calibration curve จริง / error / LoD / drift test
3. ⚠️ VOC sensor ไวต่อ confounders (humidity, temp, alcohol, food odor)
4. ⚠️ LSTM ยัง theoretical — ไม่มี real dataset, metrics, performance
5. ⚠️ MCP ยังเป็น concept — ไม่มี schema, data contract, tool/interface
6. ⚠️ LLM ในบริบทสุขภาพต้องมี guardrail, refusal policy, expert review
7. ⚠️ ยังไม่พิสูจน์ว่า breath acetone trend เปลี่ยนพฤติกรรมกลุ่มเป้าหมายจริง

### แนวทางแก้ในแผนนี้
- **ลด scope**: ทำ Proof of Concept ที่วัดผลได้จริง แทน biomedical device เต็มระบบ
- **สร้างหลักฐาน**: pilot study เล็ก + calibration report + model metrics ครบ
- **Design MCP + LLM safety** ให้ concrete ไม่ใช่ architecture concept

---

## 1. Sensor Data Model — Extension

### 1.1 ปัญหาปัจจุบัน
`SensorReading` model มีแค่:
```python
voc_ppb, ketone_mmol, temp_c, humidity_pct, raw (JSONB)
```

ไม่มี **ambient_voc / breath_voc** แยกกัน → คำนวณ `acetone_delta` ตามสูตร MetaBreath ไม่ได้

### 1.2 Migration ที่ต้องทำ (Phase 5A)

- [x] 1.2.1 Migration `c8a9e0f1b2d3_phase5a_metabreath_sensor.py` ✓ (2026-07-06)
  ```sql
  ALTER TABLE sensor_readings
    ADD COLUMN ambient_voc      float,   -- background VOC
    ADD COLUMN breath_voc       float,   -- exhaled VOC (raw)
    ADD COLUMN acetone_delta    float,   -- computed = breath - ambient
    ADD COLUMN pressure_mean    float,
    ADD COLUMN pressure_std     float,
    ADD COLUMN breath_duration  float,
    ADD COLUMN quality_score    float,
    ADD COLUMN reliability_score float,
    ADD COLUMN environment_penalty float,
    ADD COLUMN slope            float,   -- signal slope
    ADD COLUMN time_to_peak     float,
    ADD COLUMN recovery_rate    float,
    ADD COLUMN metabolic_risk_index int, -- 0=healthy, 1=watch, 2=high_risk
    ADD COLUMN confidence_score float;   -- 0–1
  ```

- [x] 1.2.2 Model update ใน `app/models/health.py` เพิ่ม fields ตรงกัน ✓
- [x] 1.2.3 Schema `app/schemas/sensor.py` — `SensorReadingCreate` + `SensorReadingOut` ✓ (2026-07-06)
- [x] 1.2.4 ยัง keep `voc_ppb / ketone_mmol` ไว้ backward compat ✓

### 1.3 Table ใหม่: `device_calibration`
- [x] 1.3.1 Migration ✓ (สร้างใน migration เดียวกัน — `c8a9e0f1b2d3`)

### 1.4 Table ใหม่: `pilot_session` (สำหรับ human pilot study)
- [x] 1.4.1 Migration ✓ (สร้างใน migration เดียวกัน — `c8a9e0f1b2d3`)
  ```python
  class PilotSession(SQLModel, table=True):
      id: UUID
      user_id: UUID
      cohort: str            # "5day_20p" | "14day_10p"
      day_number: int        # 1–14
      timepoint: str         # "fasting" | "post_meal_60" | "post_meal_120"
      bmi: Optional[float]
      waist_cm: Optional[float]
      fasting_hours: Optional[float]
      food_type: Optional[str]  # "low_carb" | "high_carb" | "keto"
      activity_min: Optional[int]
      sleep_hours: Optional[float]
      homa_ir: Optional[float]  # gold standard reference
      recorded_at: datetime
  ```

---

## 2. Sensor Calibration + Drift Handling (Judge Comment #2, #3)

### 2.1 API endpoints
- [x] 2.1.1 `POST /device/{id}/calibrate` — บันทึก ambient baseline ✓ (2026-07-06)
- [x] 2.1.2 `GET /device/{id}/calibration` — ดู calibration history ✓ (2026-07-06)
- [x] 2.1.3 drift detection via calibration history comparison ✓ (detect_drift in signal_processing.py)

### 2.2 Signal processing service
- [x] 2.2.1 `app/services/signal_processing.py` ✓ (2026-07-06):
  - `baseline_subtract(raw, baseline)` — subtract ambient
  - `env_compensate(voc, temp, humidity)` — hum/temp correction (จาก TGS1820 datasheet)
  - `pressure_normalize(voc, pressure, duration)` — flow rate compensation
  - `compute_features(sequence)` — slope, time_to_peak, recovery_rate
  - `quality_score(pressure_std, breath_duration, ambient_stability)` → 0–100
  - `reliability_score(consecutive_readings, temp_drift)` → 0–100

### 2.3 Drift detection worker
- [x] 2.3.1 Celery task `check_device_drift` (นาน 6 ชม./รอบ) ✓ (2026-07-06)
  - เทียบ current ambient กับ baseline
  - ถ้า drift > threshold → mark device `needs_recalibration = True`
  - อ้างอิงจาก `gas-sensor-drift-detection.ipynb` (XGBoost drift detection)

### 2.4 Calibration report endpoint (เพื่อ NSC evidence)
- [x] 2.4.1 `GET /device/{id}/calibration/report` — export JSON ✓ (2026-07-06):
  ```json
  {
    "calibration_curve": [{...points}],
    "limit_of_detection_ppm": 0.3,
    "repeatability_cv_pct": 8.2,
    "drift_slope_ppm_per_day": 0.05,
    "cross_sensitivity_test": {
      "ethanol_10ppm": "response_ratio",
      "acetaldehyde_10ppm": "response_ratio"
    },
    "reference_comparison": {
      "device": "ketone_meter",
      "correlation_r": 0.78,
      "bland_altman_bias": 0.12
    }
  }
  ```

---

## 3. Kaggle Datasets — Missing Additions

### 3.1 ต้อง download เพิ่ม
- [x] 3.1.1 **eNose Sensor for Human Diseases** ✓ (2026-07-06)
  ```
  kaggle datasets download muhammadrizwan111/enose-sensor-dataset-for-predicting-human-diseases
  → data/kaggle/enose-diseases/  (1,000 rows, TGS series sensors, Diabetes/Normal)
  ```
  > หมายเหตุ: อาจารย์แนะนำ notebook "Accurate Diabetes Dx by Electronic Nose" (ไม่ใช่ dataset) — dataset ที่แหล่งเดียวกัน + label ตรง คือ dataset นี้แทน
- [x] 3.1.2 **UCI Gas Sensor Array Drift** ✓ (2026-07-06)
  ```
  kaggle datasets download orvile/gas-sensor-array-drift-dataset
  → data/kaggle/uci-gas-drift/  (13,910 rows, 10 batches, includes Acetone)
  ```

### 3.2 Reference values ที่ต้องใช้เป็น label
จาก `คำแนะนำในการเทรน AI จากอ..docx`:

| กลุ่ม | Breath Acetone (ppm) | Label |
|---|---|---|
| สุขภาพดี | 0.3–0.9 | `healthy` |
| อดอาหาร / Ketosis | 1–40 | `fat_burning` (1–5), `ketosis` (5–40) |
| ออกกำลังกาย | 1–20 | `fat_burning` |
| DKA (เบาหวานรุนแรง) | > 75 | `diabetes` |

- [x] 3.2.1 Label mapping implemented in `signal_processing.classify_acetone()` + `ml_inference.py` ✓ (2026-07-06)

---

## 4. AI Model Pipeline (Judge Comment #4)

### 4.1 Classification (ไม่ใช่ Regression)
กรรมการชี้ว่า regression มี error สูง → ให้ classify เป็น risk levels

- [x] 4.1.1 สร้าง `apps/api/notebooks/` directory ✓ (2026-07-06)
- [x] 4.1.2 `notebooks/01_prepare_data.ipynb` — merge eNose + UCI drift + label mapping ✓
- [x] 4.1.3 `notebooks/02_random_forest.ipynb` — F1, confusion matrix, ROC-AUC ✓
- [x] 4.1.4 `notebooks/03_xgboost_optuna.ipynb` — Optuna 50 trials + drift analysis ✓
- [x] 4.1.5 `notebooks/04_lstm_temporal.ipynb` ✓:
  - Input: sequence 5 วัน × 3 timepoints = 15 readings
  - Target: metabolic_risk_index หลัง 24 ชม.
  - Report: accuracy, F1, confusion matrix, ROC-AUC (ตามที่กรรมการเรียก)

### 4.2 Model serving
- [x] 4.2.1 `apps/api/models/` directory for .joblib exports ✓ (2026-07-06)
- [x] 4.2.2 `app/services/ml_inference.py` — predict_risk() + predict_trend() ✓
- [x] 4.2.3 `POST /ai/predict` → label + confidence_score + recalibration_needed ✓
- [x] 4.2.4 `GET /ai/trend?days=7` → trend_direction + predicted_points ✓

### 4.3 Confidence Score
ทุก prediction ต้องมี confidence:
- reliability_score ของ input × model uncertainty
- ถ้า confidence < 0.6 → ไม่แสดง label ให้ผู้ใช้ (แสดง "ต้องวัดใหม่")

---

## 5. Pilot Study Support (Judge Comment #7)

### 5.1 สอดคล้องกับ `ร่างวิธีเก็บข้อมูล_เพื่อพิจารณา.docx`

- **Cohort A**: 20 คน อายุ 35+, BMI ปกติ 10 / สูง 10, 5 วัน × 3 ครั้ง = 300 จุด
- **Cohort B**: 10 คน, 14 วัน × 3 ครั้ง = 420 จุด
- Gold standard: HOMA-IR blood test (raw + adjusted correlation)

### 5.2 Features ที่ต้องบันทึกเพิ่ม
- [x] 5.2.1 `PilotSession` model complete (age, sex, cohort, timepoint, homa_ir, etc.) ✓ (2026-07-06)
- [x] 5.2.2 UI wizard `/onboarding/pilot` — 3-step form (study info + context + gold standard) ✓
- [x] 5.2.3 UI `/log/pilot` — session list + correlation card + export button ✓

### 5.3 Analysis endpoint
- [x] 5.3.1 `GET /pilot/correlation` — Pearson r (raw + adjusted) + p-value ✓ (2026-07-06)
- [x] 5.3.2 `GET /pilot/export` — UTF-8 BOM CSV download ✓
- [ ] 5.3.3 Bland-Altman plot data endpoint (post-NSC)

---

## 6. MCP Integration (Judge Comment #5)

กรรมการชี้ว่า MCP ยัง concept — ต้องมี **schema + data contract + tools + reasoning flow + prompt template ที่ concrete**

### 6.1 MCP Server setup
- [x] 6.1.1 `apps/mcp/` — MCP server (Python) ✓ (2026-07-06) มี:
  ```
  mcp/
    server.py            # MCP protocol handler
    tools/               # concrete tool definitions
      get_recent_readings.py
      get_metabolic_trend.py
      log_meal.py
      log_activity.py
      calibrate_device.py
    resources/           # data resource schemas
      sensor_reading.json
      user_profile.json
    prompts/             # reusable prompt templates
      metabolic_coach.md
      calibration_helper.md
      safety_wrapper.md
  ```

### 6.2 Data Contract (schema)
- [x] 6.2.1 `apps/mcp/schema.json` — full JSON Schema (SensorReading, TrendResponse, CalibrationReport, PilotSession) ✓
- [x] 6.2.2 MCP Resources: acetone-ranges + tgs1820-datasheet ✓
- [ ] 6.2.3 OpenAPI publish (post-NSC)

### 6.3 Tools (concrete)
- [x] 6.3.1 `get_recent_readings(device_id, days)` ✓ (2026-07-06)
- [x] 6.3.2 `get_metabolic_trend(device_id, days)` ✓
- [x] 6.3.3 `explain_reading(acetone_ppm, context)` — plain Thai/EN explanation ✓
- [x] 6.3.4 `log_meal(name, kcal, carbs_g)`, `log_activity(kind, duration_min)` ✓
- [x] 6.3.5 `calibrate_device(device_id, baseline_voc)` ✓

### 6.4 Reasoning flow
- [x] 6.4.1 Reasoning flow prompt in `llm_guardrail.SYSTEM_PROMPT_TEMPLATE` + MCP `get_prompt()` ✓ (2026-07-06):
  ```
  System: You are a metabolic health coach. NEVER diagnose disease.
  When user asks "how am I doing?":
    1. Call get_recent_readings(user_id, 7)
    2. Call get_metabolic_trend(user_id, 7)
    3. Interpret trend WITHIN safety guidelines
    4. Suggest ONE actionable behavior change
  If confidence < 0.6 → advise recalibration, don't interpret
  ```

### 6.5 Guardrail tests
- [x] 6.5.1 `tests/test_llm_guardrail.py` — 25 scenarios ✓ (2026-07-06):
  - test_refuses_diagnosis_request
  - test_refuses_medication_advice
  - test_low_confidence_triggers_recalibration
  - test_high_risk_triggers_doctor_referral

---

## 7. LLM Safety Layer (Judge Comment #6, #8)

### 7.1 Refusal Policy
- [x] 7.1.1 `apps/api/app/services/llm_guardrail.py` ✓ (2026-07-06):
  ```python
  BANNED_REQUESTS = [
      "diagnose my diabetes",
      "should I stop insulin",
      "am I dying",
      # ... clinical safety list
  ]
  def is_refusal_needed(user_message: str, user_context: dict) -> tuple[bool, str]
  ```

### 7.2 Test cases
- [x] 7.2.1 `tests/test_llm_guardrail.py` — 25 scenarios (16 refusal + 9 safe + signal tests) ✓
- [x] 7.2.2 Hallucination prevention via SYSTEM_PROMPT_TEMPLATE + sanitise_response() ✓
- [ ] 7.2.3 CI integration (post-NSC)

### 7.3 Disclaimers
- [x] 7.3.1 DISCLAIMER_TH + DISCLAIMER_EN — appended to every AI response via sanitise_response() ✓
- [x] 7.3.2 High confidence + label=diabetes → system prompt includes 1669 emergency protocol ✓

### 7.4 Expert review
- [ ] 7.4.1 Expert physician review (pending contact — due 17 July)
- [x] 7.4.2 `infra/seed/clinical_review_log.md` — review table + audit summary ✓ (2026-07-06)

---

## 8. Restructured Phases — Update ใน plan.md

### Phase 5 เดิม → แบ่งใหม่เป็น 5A / 5B / 5C

**Phase 5A — MetaBreath Data Model + Calibration** (Prep)
- Migration extended fields
- device_calibration table
- pilot_session table
- Signal processing service (baseline, env compensation, features)
- Drift detection worker

**Phase 5B — MQTT Ingestion + Device Pairing** (เดิม Phase 5)
- MQTT subscriber
- Device pairing flow
- WebSocket realtime push
- Realtime trend page

**Phase 5C — Pilot Study Support** (ใหม่)
- Pilot enrollment UI
- Session logging UI
- HOMA-IR correlation endpoint
- Data export for stats

**Phase 5D — Calibration UI + Report** (ใหม่)
- Calibration wizard
- Quality/reliability meter display
- Calibration report page (for NSC evidence)

### Phase 6 เดิม → แบ่งใหม่เป็น 6A / 6B / 6C / 6D

**Phase 6A — Model Training Notebooks**
- Prepare data (MetaBreath + Kaggle + Pilot)
- RF + XGBoost + Optuna
- LSTM temporal
- Metrics reports (F1, confusion matrix, ROC-AUC)

**Phase 6B — Model Serving**
- ML inference service
- `/ai/predict` + `/ai/trend` endpoints
- Confidence score wrapper

**Phase 6C — MCP Integration** (ใหม่)
- MCP server + tools + resources
- Data contract schemas
- Prompt templates
- Guardrail test suite

**Phase 6D — LLM Coach + Safety**
- Provider chain (OpenAI/Gemini/Claude) — เดิม
- Refusal policy + disclaimers
- Expert review process
- Chat UI

---

## 9. Timeline (ปรับตาม NSC deadline 17 กค.)

| ช่วง | Phase | Deliverable |
|---|---|---|
| 2026-07-06 → 07-10 | **5A** (Data Model) | Migration + models ใหม่ committed |
| 2026-07-11 → 07-13 | **5A** (Signal processing) | services/signal_processing.py + tests |
| 2026-07-11 → 07-13 | **6A** (Data prep) | Download 2 datasets + notebook 01 |
| 2026-07-14 → 07-15 | **6A** (RF/XGBoost) | notebooks 02, 03 with metrics |
| 2026-07-16 | **6C** (MCP skeleton) | server.py + 3 tools + 1 prompt |
| 2026-07-17 | **NSC Presentation** | นำเสนอกรรมการ |

**หลัง 17 กค.** (ถ้าผ่านรอบ):
- 07-20 → 08-05: Phase 5B (MQTT ingestion)
- 08-06 → 08-19: Phase 6B (Model serving)
- 08-20 → 09-05: Phase 5C (Pilot study)
- 09-06 → 09-19: Phase 6D (LLM safety)
- 09-20 → 10-03: Phase 5D (Calibration UI)

---

## 10. Deliverables Checklist (ตอบทุก Judge Comment)

### หลักฐานที่ต้องมีใน 17 กค.

- [ ] **Judge #2 — Calibration curve**: notebook + report endpoint
- [ ] **Judge #2 — Drift test**: drift detection worker + baseline history
- [ ] **Judge #3 — Confounder mitigation**: env compensation formula + test
- [ ] **Judge #4 — LSTM metrics**: notebook 04 with F1, ROC-AUC, confusion matrix
- [ ] **Judge #4 — Real dataset**: Kaggle E-nose (ถ้าไม่ทันเก็บ pilot จริง)
- [ ] **Judge #5 — MCP schema**: JSON schemas + tools + reasoning flow doc
- [ ] **Judge #6 — LLM guardrails**: test suite + refusal policy doc
- [ ] **Judge #7 — Use case validation**: pilot enrollment plan + reference clinical protocol

### หลักฐานที่ยังไม่ต้องมี (แต่ต้องมีแผน)
- Full pilot data (20 people × 5 days) — ยังทำไม่ทัน 17 กค.
- HOMA-IR correlation (ต้อง lab)
- GC-MS reference comparison (ต้องมีเครื่อง)
- Expert medical review (ต้องคุยกับหมอ)

---

## 11. Sensor Discrepancy Note

**Abstract (April)** ใช้: MQ-138 + DHT11
**Final Round (July)** ใช้: **TGS1820 + SHT35** ← ใช้อันนี้เป็น source of truth

MetaBreath code ควรอ้าง TGS1820 + SHT35 ให้ตรงกับ final round

---

## 12. References

**เอกสารตัดสินใจ** (อยู่ในโฟลเดอร์ `แข่งชนะ by Coach Bright_NSC/`)
- `NSC 2026/Comments กรรมการ_เพื่อปรับก่อน 17 กค..docx` — ต้นทางของ judge concerns
- `NSC 2026/1. Data set สำหรับเทรน AI/คำแนะนำในการเทรน AI จากอ..docx` — reference values + Kaggle recommendations
- `NSC 2026/3. หลักการแพทย์ และข้อมูลอ้างอิง/ร่างวิธีเก็บข้อมูล_เพื่อพิจารณา.docx` — pilot study protocol
- `NSC 2026/1. Data set สำหรับเทรน AI/metabreath_acetone_delta_demo_dataset.csv` — 18-column feature schema
- `gas-sensor-drift-detection.ipynb` — XGBoost + Optuna drift model reference
- `Final round CEDT สำหรับอ้างอิง/2. การเพิ่มฟีเจอร์ MCP, LLMs และ LSTM สำหรับการให้คำแน(1).pdf` — MCP + LLM + LSTM proposal
- `NSC 2026/ร่างรายงานฉบับสมบูรณ์_ส่งโค้ช.docx` — draft full report

**Research papers** (ใน `บทความวิจัยอ้างอิง/`)
- Wang & Wang 2013 — biomarker foundations
- Bovey et al 2018 — energy balance
- Gregoire et al 2023 — handheld device
- Reliability 2024 — repeatability
- Metabolic flexibility 2017 — RER concept
- Anderson 2015 — fat loss monitoring

---

## 13. Changelog

- 2026-07-06 — สร้างครั้งแรก, based on audit vs NSC materials
