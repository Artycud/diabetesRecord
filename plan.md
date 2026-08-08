# แผนพัฒนา AI Pipeline — MetaBreath

> **Owner**: Pranai
> **สร้าง**: 2026-07-12
> **Version**: 2.0 (major revision — Trend Classifier design + Phase 1/2 completion log)
> **NSC Deadline**: 2026-07-17 (5 วัน)
> **Companion**: `plan_metabreath.md`, `plan_connect_ai.md`, `plan_ESP.md`
> **Related report**: `MetaBreath_AI_Technical_Report_NSC2026.pdf`

---

## 0. Executive Summary

### เป้าหมาย
สร้าง AI pipeline ที่ **ซื่อสัตย์เชิงวิทยาศาสตร์** (ไม่ inflate ตัวเลข), **มีประโยชน์ทางคลินิก** (บอก trend ไม่ใช่ diagnose), และ **ปลอดภัยตามกฎหมาย** (guardrail ครบ) สำหรับส่งประกวด NSC 2026 และต่อยอดสู่ pilot study หลังนั้น

### สภาพปัจจุบัน (2026-07-12)
- ✅ **Phase 1 (Report)** — ตัด CGM datasets, เพิ่ม L9 label-feature circularity, Interpretation Note ใน §4.1
- ✅ **Phase 2 (RF/XGB dual variant)** — เทรน verification (13 feat, 0.99) + predictive (9 feat, 0.40 ~ chance) แยกเก็บ artifacts + PDF อัปเดตครบ
- ✅ **Phase 3 (LSTM Trend Classifier)** — trained val_acc 0.95 (participant-wise), integrated ที่ `/ai/predict/trend`, tests 23/23 PASS
- ✅ **Phase 4 (Frontend integration)** — `TrendClassCard` wire บน /home + /trends แล้ว (combined implementation แทน MiniCard+Banner)
- ✅ **Phase 5A (End-to-end simulation)** — `simulate_scenarios.py` รัน 6 scenarios PASS ครบ 6/6 (S6 fix: missing-field mean-imputation) → `models/simulation_results.json`
- ✅ **Phase 5C (Defense cheatsheet)** — `NSC_DEFENSE_CHEATSHEET.md` 12 Q+A + cheat card + section pointers
- 🚧 **Phase 5B (Manual UI walkthrough + screenshot)** — รอเดินผ่าน Chrome
- 📅 **Phase 5D (Final commit + tag `v1.0-nsc2026-submission`)** — รอผู้ใช้ยืนยัน
- 📅 **Phase 6 (Pilot / Real BOHB training)** — post-NSC (Q3-Q4 2026)

### หลักคิดสำคัญ (Design Principles)
1. **ไม่มี circular metric** — model input ต้องไม่เป็นฟังก์ชันของ label
2. **แยกบทบาท 2 model** — RF/XGB = per-reading rule verification, LSTM = trend over time
3. **แยก verification vs predictive** — รายงาน 2 เลขเสมอ ไม่ปลอมว่าเป็น predictive validity
4. **Participant-wise split** — ห้าม train/test มีคนคนเดียวกัน
5. **Trend classification, not diagnosis** — output ทุกช่องต้องผ่าน LLM Guardrail
6. **Every ML output ต้องมี confidence + fallback** — ถ้า confidence < 0.6 หรือ model ล้ม ต้อง fallback ไป Anderson rule

---

## 1. System Architecture — จากรากถึงยอด

### 1.1 Layer Diagram (10 ชั้น)

```
┌─────────────────────────────────────────────────────────────────┐
│ L10  USER INTERFACE (Next.js / React)                           │
│      /home, /breathing, /trends, /chat, /log, /me               │
├─────────────────────────────────────────────────────────────────┤
│ L9   API CLIENT (fetch wrapper + TanStack Query)                │
├─────────────────────────────────────────────────────────────────┤
│ L8   FASTAPI ROUTERS (apps/api/app/routers/*.py)                │
│      /ai/predict, /ai/predict/lstm, /ai/trend, /ai/drift,       │
│      /ai/chat, /ai/flexibility                                  │
├─────────────────────────────────────────────────────────────────┤
│ L7   INFERENCE SERVICES (apps/api/app/services/)                │
│      ml_inference.py │ llm_guardrail.py │ signal_processing.py  │
├─────────────────────────────────────────────────────────────────┤
│ L6   MODEL ARTIFACTS (apps/api/models/*.joblib | *.pt)          │
│      RF/XGB × 2 variants │ LSTM Trend │ Drift Detector          │
├─────────────────────────────────────────────────────────────────┤
│ L5   FEATURE ENGINEERING (per-reading + per-session)            │
│      13 features (RF/XGB) │ 8 features × N sessions (LSTM)      │
├─────────────────────────────────────────────────────────────────┤
│ L4   RELIABILITY GATE  (quality_score, reliability_score, drift)│
├─────────────────────────────────────────────────────────────────┤
│ L3   DATA MODEL (SQLModel / Alembic)                            │
│      SensorReading │ DeviceCalibration │ PilotSession │ +NEW    │
├─────────────────────────────────────────────────────────────────┤
│ L2   SIGNAL PROCESSING (baseline subtraction, T/H compensation) │
├─────────────────────────────────────────────────────────────────┤
│ L1   FIRMWARE / SENSOR (ESP32 + TGS1820 + XGZP6847A + SHT31)    │
│      MQTT publish → /sensor/reading                             │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Data Flow (root → output)

```
[TGS1820 sensor] ─raw voltage─▶ [ESP32 signal cond.]
       │
       │ MQTT (topic: sensor/{device_id}/reading)
       ▼
[mosquitto broker] ─▶ [FastAPI /sensor/reading] ─▶ [SensorReading DB row]
                                                          │
   ┌──────────────────────────────────────────────────────┤
   │ signal_processing.py: acetone_delta, quality_score,  │
   │ reliability_score, temp/humidity comp, drift check   │
   ▼                                                       │
[Feature vector (13 per-reading)]                          │
   │                                                       │
   ├─▶ /ai/predict ─▶ ml_inference.predict_risk()          │
   │       Priority: Reliability Gate → XGB verif → RF     │
   │                 verif → Anderson rule                 │
   │       Output: {label, MRI, confidence, model_used}    │
   │                                                       │
   ├─▶ /ai/predict/lstm ─▶ (needs ≥7 sessions)            │
   │       ml_inference.predict_trend()                    │
   │       Output: {trend: stable|inc|dec|abnormal,        │
   │               confidence, sequence_length}            │
   │                                                       │
   ├─▶ /ai/trend ─▶ Linear regression on ppm history       │
   │       Output: {direction, slope_ppm_per_day, ...}     │
   │                                                       │
   ├─▶ /ai/drift ─▶ Compare calibration deltas             │
   │       Output: {drift_detected, severity, recc.}       │
   │                                                       │
   └─▶ /ai/chat ─▶ LLM + guardrail                        │
           Output: {reply, refusal_flag, disclaimer}       │
                                                           ▼
                                             [Frontend renders card]
                                             (see §7 UI Integration)
```

---

## 2. Data Model

### 2.1 Existing (Phase 5A migration `c8a9e0f1b2d3` — done)

| Table | Purpose |
|---|---|
| `sensor_readings` | Raw + processed reading (13 engineering fields + `acetone_delta`) |
| `device_calibrations` | Baseline ambient VOC per device, timestamped |
| `pilot_sessions` | Human pilot metadata (cohort, timepoint, BMI, BOHB) |

### 2.2 New (Phase 3 — LSTM Trend)

**Table: `trend_snapshots`**  (materialized session summaries used to build LSTM sequences)

| Column | Type | Purpose |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK users |
| `device_id` | UUID | FK devices |
| `session_idx` | int | 0-indexed session number per user (dense) |
| `session_start` | timestamptz | first reading of the session |
| `acetone_delta_mean` | float | mean over session |
| `pressure_mean` | float | mean breath pressure |
| `pressure_std` | float | std of breath pressure (effort consistency) |
| `breath_duration_mean` | float | mean measurement duration |
| `temp_c_mean` | float | ambient temp during session |
| `humidity_pct_mean` | float | ambient humidity |
| `quality_score_mean` | float | 0-100 |
| `reliability_score_mean` | float | 0-100 |
| `trend_label` | enum(stable, increasing, decreasing, abnormal, null) | filled by rule; null while sequence is too short |
| `created_at` | timestamptz | |

**Migration name**: `phase3_trend_snapshots.py` (Alembic)

**Index**: `(user_id, session_idx DESC)` — LSTM query needs last-N sessions per user fast.

### 2.3 Foreign relations
- `trend_snapshots` ← materialised by cron/hook from `sensor_readings`
- `LongitudinalSequence` = last-L rows of `trend_snapshots` for a single `user_id`

---

## 3. Feature Engineering

### 3.1 Per-reading features (13 for RF/XGB, Phase 2 spec)

| # | Feature | Origin | Unit | Leaky |
|---|---|---|---|---|
| 1 | acetone_delta | TGS1820 - baseline | ppm | ● |
| 2 | quality_score | signal_processing | 0-100 | |
| 3 | reliability_score | signal_processing | 0-100 | |
| 4 | ambient_voc | TGS1820 clean-air | ppm | |
| 5 | pressure_mean | XGZP6847A | kPa | |
| 6 | pressure_std | XGZP6847A | kPa | |
| 7 | breath_duration | firmware timer | s | |
| 8 | temperature | SHT31 | °C | |
| 9 | humidity | SHT31 | %RH | |
| 10 | environment_penalty | derived | 0-50 | |
| 11 | ketosis_index | derived | 0-1 | ● |
| 12 | metabolic_score | derived | 0-100 | ● |
| 13 | fat_burning_index | derived | 0-1 | ● |

- **Verification variant** uses all 13
- **Predictive variant** uses only 9 non-leaky (drop `acetone_delta`, `ketosis_index`, `metabolic_score`, `fat_burning_index`)

### 3.2 Per-session features (8 for LSTM Trend, Phase 3 spec — from sender's design doc)

Each `xₜ` in the sequence:
```
xₜ = [ΔVOCₜ, P^mean_t, P^std_t, D_t, T_t, H_t, Q_t, R_t]ᵀ
```

- `ΔVOC` = acetone_delta_mean per session (**เอา ΔVOC ตรง ๆ ได้** เพราะ trend label ไม่ได้ derive จาก ΔVOC ค่าเดี่ยว แต่จาก slope/variance ของทั้ง sequence)
- `P^mean, P^std` = pressure_mean, pressure_std
- `D` = breath_duration_mean
- `T, H` = temp, humidity
- `Q, R` = quality_score, reliability_score

**Sequence length L**: 7 sessions (minimum for meaningful slope), 14 sessions (nominal), 30 sessions (max deployed context)

### 3.3 Normalization
- **RF/XGB**: raw values (tree-based, ไม่ต้อง scale)
- **LSTM**: StandardScaler per-feature, fit only on train split
  - Save: `data/processed/scaler_lstm_trend_mean.npy` + `scaler_lstm_trend_scale.npy`

---

## 4. AI Models — รายละเอียดต่อ Component

### 4.1 Signal Processing (deterministic, no training)
- **Input**: raw sensor voltage from ESP32
- **Output**: 13-feature vector
- **File**: `apps/api/app/services/signal_processing.py`
- **Key formulas**:
  - `acetone_delta = (V_sensor - V_baseline) × gain + offset`
  - `VOC_comp = VOC_raw / [(1 + 0.015·ΔT) × (1 + 0.008·ΔH)]`
- **Status**: ✅ deployed

### 4.2 Reliability Gate (Priority 0)
- **Input**: reading with `quality_score` + `reliability_score`
- **Logic**: if `reliability_score < 40` → return `label="unreliable"`, block downstream ML
- **Threshold rationale**: 40 = quality below which sensor noise dominates signal
- **Status**: ✅ deployed

### 4.3 RF Classifier — Verification variant (Priority 1a)
- **Purpose**: reproduce Anderson threshold rule under sensor noise (**rule-consistency check**, NOT predictive validity)
- **Features**: all 13 including leaky
- **Labels**: 5-class Anderson (basal / light_ketosis / nutritional_ketosis / deep_ketosis / dka_risk)
- **Metrics** (Phase 2): Test acc = 0.9917, F1 = 0.9917, CV F1 = 0.9907 ± 0.0063
- **Artifact**: `apps/api/models/rf_classifier.joblib`
- **Status**: ✅ deployed

### 4.4 XGB Classifier — Verification variant (Priority 1b)
- **Same purpose/features/labels as 4.3**
- **Metrics**: Test acc = 0.9917, F1 = 0.9903, CV F1 = 0.9926 ± 0.0061
- **Artifact**: `apps/api/models/xgb_classifier.joblib`
- **Status**: ✅ deployed

### 4.5 RF Classifier — Predictive variant (reporting only, no serving)
- **Purpose**: honest baseline that quantifies how much of verification-variant score comes from label-feature circularity
- **Features**: 9 non-leaky (drop the 4 leaky ones)
- **Labels**: same Anderson 5-class
- **Metrics** (Phase 2): Test acc = **0.3958**, F1 = 0.3969 — sits at stratified chance (0.3783)
- **Artifact**: `apps/api/models/rf_classifier_predictive.joblib`
- **Serving**: not exposed via API; kept as baseline for the report and future comparison after pilot BOHB retrain
- **Status**: ✅ trained

### 4.6 XGB Classifier — Predictive variant (reporting only)
- **Same purpose/features/labels as 4.5**
- **Metrics**: Test acc = **0.4333**, F1 = 0.3737
- **Artifact**: `apps/api/models/xgb_classifier_predictive.joblib`
- **Status**: ✅ trained

### 4.7 LSTM Trend Classifier (Priority 3 — REDESIGN in Phase 3)
- **Purpose**: classify direction of a user's own baseline over time — NOT metabolic state, NOT diagnosis
- **Input**: sequence of 7-30 sessions × 8 features
- **Output**: 4-class softmax `[stable, increasing, decreasing, abnormal]`
- **Architecture** (per sender's §3-4):

  ```
  Input: (batch, L, 8)   L ∈ {7, 14, 30}
  ├── LSTM(input=8, hidden=64, batch_first=True)
  ├── Dropout(0.30)
  ├── LSTM(input=64, hidden=32, batch_first=True)
  ├── Dropout(0.30) (last time-step only)
  ├── Linear(32 → 16) + ReLU
  └── Linear(16 → 4) + Softmax
  ```
- **Loss**: CrossEntropyLoss (4-class)
- **Optimizer**: Adam, lr=1e-3, ReduceLROnPlateau(factor=0.5, patience=5)
- **Batch**: 16, Epochs: 150 max, EarlyStopping patience=15
- **Validation**: participant-wise (80/20 split by `user_id`, never within-user)
- **Label rule** (see §5.4)
- **Artifact**: `apps/api/models/lstm_trend.pt`
- **Fallback**: `sequence_length < 7` → return `insufficient_data`; other errors → return `unknown`
- **Status**: 🚧 to build in Phase 3

### 4.8 Drift Detector (Priority 4 — parallel, not in cascade)
- **Purpose**: detect sensor drift by comparing recent ambient VOC to first-calibration baseline
- **Model**: XGBoost trained on UCI Gas Drift (batch 1-10 acetone patterns)
- **Metrics**: acc = 0.9850, CV = 0.8418
- **Artifact**: `apps/api/models/drift_model.joblib`
- **Status**: ✅ deployed

### 4.9 Anderson Rule-Based Fallback (Priority 5 — always available)
- **Logic**: `label = anderson_label(acetone_delta)` — deterministic threshold lookup
- **Returns**: 5-class label
- **When triggered**: all ML models unavailable or gave low confidence
- **Status**: ✅ deployed

### 4.10 LLM Safety Guardrail (Priority 6 — every /ai/chat request)
- **Pre-screen**: user input against blocklist (drug dosage, diagnosis, deny-doctor, extreme fasting, self-harm)
- **Post-screen**: LLM output before returning
- **Disclaimer**: always appended TH + EN
- **Emergency referral**: "โปรดโทร 1669 หรือไปห้องฉุกเฉินทันที"
- **File**: `apps/api/app/services/llm_guardrail.py`
- **Status**: ✅ deployed

---

## 5. Training Pipeline

### 5.1 Data Sources (final list after Phase 1 cull)

| Dataset | Rows | Used By | Status |
|---|---|---|---|
| MetaBreath Demo (synthetic) | 1,199 | RF/XGB verification + predictive | Local CSV |
| eNose Diseases (Rizwan, breath) | 1,000 | Reference — TGS family alignment | Local CSV |
| UCI Gas Drift (Vergara) | 13,910 | Drift detector | Local (batch 1-10 acetone) |
| SmartBreath / Ziyatdinov | 58 samples × 300 steps | LSTM pretraining (optional Phase 3) | Local CSV |
| **Longitudinal Synthetic** (NEW Phase 3) | 100 pt × 14 sess = 1,400 seq | LSTM trend main train | To generate |
| Pilot BOHB (future) | 30+ subjects × 5+ sess | Real predictive retrain | Post-NSC |

### 5.2 Data Preparation Scripts

| Script | Purpose | Status |
|---|---|---|
| `apps/api/notebooks/01_prepare_data.ipynb` | Merge sources, feature engineering | ✅ existing |
| `apps/api/notebooks/train_models.py` | RF/XGB dual variant training | ✅ Phase 2 done |
| `apps/api/notebooks/03_xgboost_optuna.ipynb` | XGB Optuna tuning | ✅ existing |
| `apps/api/notebooks/generate_longitudinal_data.py` | **NEW**: synthetic longitudinal generator | 📅 Phase 3A |
| `apps/api/notebooks/05_lstm_trend.ipynb` | **NEW**: LSTM Trend Classifier training | 📅 Phase 3B |
| `apps/api/notebooks/06_smartbreath_pretrain.ipynb` | **OPTIONAL**: Ziyatdinov pretraining | 📅 Phase 3E (nice-to-have) |

### 5.3 Synthetic Longitudinal Generator — Design

```python
# generate_longitudinal_data.py — pseudo
N_PATIENTS = 100
SESSIONS_PER_PT = 14
TREND_TYPES = ["stable", "increasing", "decreasing", "abnormal"]

for pid in range(N_PATIENTS):
    trend = random.choice(TREND_TYPES)
    baseline_ppm = random.uniform(1.0, 3.0)   # each patient a unique baseline

    for s in range(SESSIONS_PER_PT):
        if trend == "stable":
            ppm = baseline_ppm + gauss(0, 0.4)
        elif trend == "increasing":
            ppm = baseline_ppm + s * 0.4 + gauss(0, 0.3)   # slope +0.4 ppm/session
        elif trend == "decreasing":
            ppm = baseline_ppm + 6 - s * 0.4 + gauss(0, 0.3)
        elif trend == "abnormal":
            ppm = baseline_ppm + gauss(0, 0.3)
            if s == 7: ppm += 15.0   # spike at midpoint

        # simulate other features (independent of ppm, realistic ranges)
        pressure_mean = gauss(115, 6)
        pressure_std = gauss(5, 1.5)
        breath_duration = gauss(28, 3)
        temperature = gauss(28, 2)
        humidity = gauss(60, 8)
        quality_score = gauss(90, 5)   # clip 0-100
        reliability_score = gauss(88, 6)
        yield {patient_id: pid, session_idx: s, ΔVOC: ppm, ...,
               trend_label: trend}
```
- **Output**: `data/processed/longitudinal_synthetic.csv`
- **Total rows**: 100 × 14 = 1,400
- **Total sequences (sliding window L=7)**: 100 × (14-7+1) = 800

### 5.4 Trend Label Rule (non-circular)

**Key insight**: label ต้อง derive จาก **derivative/pattern** ของทั้ง sequence ไม่ใช่จากค่าจุดเดียว — ถ้าใช้จุดเดียวจะกลับไปมี circularity เหมือน RF/XGB

```python
# apps/api/app/services/trend_label.py — pseudo

def compute_trend_label(sequence: list[float]) -> str:
    """
    sequence = list of ΔVOC across L sessions
    """
    from scipy.stats import linregress
    L = len(sequence)
    x = list(range(L))
    slope, intercept, r, p, se = linregress(x, sequence)

    diffs = [sequence[i+1] - sequence[i] for i in range(L-1)]
    max_jump = max(abs(d) for d in diffs)
    median_jump = median(abs(d) for d in diffs)

    # Abnormal takes precedence — a spike overrides any linear trend
    if max_jump > max(4.0, 3.0 * median_jump):
        return "abnormal"

    # Linear slope significance
    if p < 0.10:                       # slope stat. distinguishable from 0
        if slope > +0.3:  return "increasing"
        if slope < -0.3:  return "decreasing"

    return "stable"
```

- **Params tunable via `TREND_LABEL_CONFIG`** (env-driven for A/B testing)
- **Why this is non-circular**: label depends on `(slope, spike_magnitude)` — both are functions of the whole sequence, not a single feature. LSTM must learn to extract these signals from raw sequence.

### 5.5 Validation Strategy

| Model | Split | Reason |
|---|---|---|
| RF/XGB verification | Stratified 80/20 by class | Backward-compat with existing notebook |
| RF/XGB predictive | Same split as verification | Comparable metrics |
| LSTM Trend | **Participant-wise 80/20** by `user_id` | Prevent within-person leakage |
| LSTM Trend (secondary) | **Time-wise 80/20** by `session_idx` | Simulate deployment (past → future) |
| Drift Detector | Batch-aware split (UCI batches 1-8 train, 9-10 test) | Simulate real drift over time |

### 5.6 Model Artifacts Registry

| File | Size | Contents | Status | Serving |
|---|---|---|---|---|
| `rf_classifier.joblib` | ~1.2 MB | RF verification (13 feat) | ✅ | /ai/predict |
| `xgb_classifier.joblib` | ~0.8 MB | XGB verification (13 feat) | ✅ | /ai/predict |
| `rf_classifier_predictive.joblib` | ~1.0 MB | RF predictive (9 feat) | ✅ | reporting only |
| `xgb_classifier_predictive.joblib` | ~0.7 MB | XGB predictive (9 feat) | ✅ | reporting only |
| `lstm_model.pt` | ~0.5 MB | Legacy LSTM 3-class metabolic | ⚠️ deprecate after Phase 3 | /ai/predict/lstm (until phase 3 ships) |
| `lstm_trend.pt` | ~0.6 MB | **NEW**: LSTM 4-class trend | 📅 Phase 3 | /ai/predict/lstm (after) |
| `drift_model.joblib` | ~0.3 MB | XGB drift detector | ✅ | /ai/drift |
| `feature_columns.json` | <1 KB | Feature order + LabelEncoder | ✅ | shared |
| `training_metrics.json` | <2 KB | Verification + predictive metrics | ✅ | reporting |
| `scaler_lstm_mean.npy` / `_scale.npy` | <1 KB | Legacy LSTM scaler | ⚠️ | fallback |
| `scaler_lstm_trend_mean.npy` / `_scale.npy` | <1 KB | **NEW**: Trend LSTM scaler | 📅 Phase 3 | production |

---

## 6. Backend Integration (FastAPI)

### 6.1 `ml_inference.py` — Structure after Phase 3

```python
# Globals (loaded once at startup)
_rf_verif, _xgb_verif                        # verification models
_lstm_trend, _lstm_trend_scaler_mean/scale   # NEW trend model
_drift_model                                 # drift
_feature_columns, _label_classes             # RF/XGB metadata
TREND_LABELS = ["stable", "increasing", "decreasing", "abnormal"]

def predict_risk(features: dict) -> dict:
    """Priority cascade for single-reading Anderson class."""
    # 1. Reliability Gate
    if features["reliability_score"] < 40:
        return {"label": "unreliable", "model_used": "reliability_gate", ...}
    # 2. XGB verif → 3. RF verif → 4. Anderson rule
    ...

def predict_trend(sequence: list[dict]) -> dict:
    """NEW — LSTM trend classifier."""
    if len(sequence) < 7:
        return {"trend": None, "model_used": "insufficient_data",
                "sequence_length": len(sequence),
                "min_required": 7,
                "confidence": 0.0}
    # Normalize using scaler, run LSTM, softmax → argmax
    trend_idx, probs = _lstm_infer(sequence)
    return {"trend": TREND_LABELS[trend_idx],
            "confidence": float(probs[trend_idx]),
            "probabilities": {lbl: float(p) for lbl, p in zip(TREND_LABELS, probs)},
            "sequence_length": len(sequence),
            "model_used": "lstm_trend"}

def check_drift(calibration_history: list) -> dict: ...
```

### 6.2 API Endpoints (after Phase 3)

| Endpoint | Method | Input | Output |
|---|---|---|---|
| `/ai/predict` | POST | 13-feature reading | `{label, MRI, confidence, model_used, recalibration_needed}` |
| `/ai/predict/lstm` | POST | `sequence: list[dict]` (≥7 sessions) OR auto-load last-N | `{trend, confidence, probabilities, sequence_length, model_used}` |
| `/ai/trend` | GET | `device_id, days` | `{direction, slope_ppm_per_day, predicted_points, confidence}` |
| `/ai/drift` | GET | `device_id` | `{drift_detected, severity, drift_pct, recommendation}` |
| `/ai/chat` | POST | `{message, device_id}` | `{reply, refusal_flag, disclaimer}` |
| `/ai/flexibility` | POST | `{device_id, context, days}` | `{score, zone, breakdown, trend, message_th}` |

**Response schema change (Phase 3)**: `/ai/predict/lstm` response fields change from `{label, metabolic_risk_index, confidence_score}` → `{trend, confidence, probabilities, sequence_length}`. **Breaking change** — must be released with frontend simultaneously.

### 6.3 Priority Cascade (post-Phase 3)

```
Priority 0 — Reliability Gate           reliability_score < 40 → "unreliable"
Priority 1 — XGB Verification (deploy)  test/CV metrics: rule-verif high
Priority 2 — RF  Verification (deploy)  same-role, if XGB fails
Priority 3 — LSTM Trend (NEW)           requires sequence ≥ 7 sessions
                                        answers "which direction", not "which class"
                                        RUNS IN PARALLEL to Priority 1/2 —
                                        both are shown to user (per-reading + trend)
Priority 4 — Anderson Rule (final)      deterministic fallback
```

**Change from current**: LSTM used to be a fallback branch; in the new design **LSTM answers a different question** and runs alongside RF/XGB, not as a fallback. UI shows both cards.

### 6.4 Response Schema — `/ai/predict/lstm` (new)

```json
{
  "device_id": "uuid",
  "trend": "increasing",
  "confidence": 0.87,
  "probabilities": {
    "stable": 0.05,
    "increasing": 0.87,
    "decreasing": 0.03,
    "abnormal": 0.05
  },
  "sequence_length": 14,
  "min_required": 7,
  "model_used": "lstm_trend",
  "fallback_reason": null,
  "as_of": "2026-07-12T09:15:00Z"
}
```

---

## 7. Frontend Integration (Next.js / React)

### 7.1 API Client

- **Path**: `apps/web/src/lib/api/ai.ts` (create)
- **Functions**: `predictRisk()`, `predictTrend()`, `getDailyTrend()`, `getDrift()`, `chat()`
- **State**: TanStack Query, staleTime 60s for `/ai/predict`, 300s for `/ai/trend`

### 7.2 UI Pages / Components

| Page | Component | Data source | Purpose |
|---|---|---|---|
| `/home` | `TodayReadingCard.tsx` (NEW) | `/ai/predict` | ผลตรวจของวันนี้ + Anderson label |
| `/home` | `TrendMiniCard.tsx` (NEW) | `/ai/predict/lstm` | Trend badge (stable/inc/dec/abnormal) + progress ring |
| `/trends` | `TrendChart.tsx` (existing) | `/ai/trend` | Line chart 14 วัน + confidence band |
| `/trends` | `TrendClassificationBanner.tsx` (NEW) | `/ai/predict/lstm` | Full-width banner อธิบาย trend + คำแนะนำ |
| `/breathing` | `BreathSession.tsx` (existing) | `/sensor/reading` | Live session recording |
| `/breathing` | `PostSessionSummary.tsx` (NEW) | `/ai/predict` + `/ai/drift` | สรุปหลังจบ session พร้อม drift alert |
| `/chat` | `CoachChat.tsx` (existing) | `/ai/chat` | Guardrailed AI coach |
| `/log` | (existing) | direct DB | Manual log entry |
| `/me` | `ReliabilityCard.tsx` (NEW) | `/ai/drift` | Sensor health + last calibration |

### 7.3 Trend Badge Design

```tsx
// TrendMiniCard.tsx — visual spec
<Card>
  <Badge variant={{
    stable: "green",
    increasing: "amber",
    decreasing: "blue",
    abnormal: "red",
  }[trend]}>
    {t(`trend.${trend}`)}   {/* i18n */}
  </Badge>
  <ProgressRing value={confidence * 100} />
  <p>{t(`trend.${trend}.explainer`)}</p>
  <p className="text-muted">
    {t("trend.based_on_sessions", { n: sequence_length })}
  </p>
</Card>
```

**i18n keys to add** (`en.ts` + `th.ts`):
- `trend.stable` / `.increasing` / `.decreasing` / `.abnormal`
- `trend.stable.explainer` — "ค่า acetone ของคุณคงที่ในช่วง 14 วันที่ผ่านมา"
- `trend.increasing.explainer` — "ค่า acetone มีแนวโน้มสูงขึ้น — อาจสะท้อนการเปลี่ยนพฤติกรรม/อาหาร"
- `trend.decreasing.explainer` — "ค่า acetone มีแนวโน้มลดลง"
- `trend.abnormal.explainer` — "พบค่ากระโดดผิดปกติ — ตรวจซ้ำหรือปรึกษาผู้เชี่ยวชาญ"
- `trend.insufficient_data` — "ต้องมีการวัดอย่างน้อย 7 ครั้ง จึงจะประเมิน trend ได้"

### 7.4 Confidence & Reliability Display Rules

- confidence ≥ 0.80 → แสดงเต็ม + คำแนะนำ
- 0.60 ≤ conf < 0.80 → แสดงพร้อม caveat "ความน่าเชื่อถือปานกลาง"
- confidence < 0.60 → ไม่แสดง trend, แสดงข้อความ "ยังประเมินไม่ได้ ควรตรวจซ้ำ"
- `reliability_score < 40` → block ทั้ง cards, แสดง "session นี้ค่าไม่แม่นยำ" พร้อมปุ่ม "ตรวจใหม่"

---

## 8. Testing Plan

### 8.1 Unit tests (pytest, `apps/api/tests/`)

| Test file | Coverage |
|---|---|
| `test_ai_leakage_check.py` (NEW) | assert predictive-variant accuracy ≤ chance + 0.1 |
| `test_trend_label_rule.py` (NEW) | golden-set: known sequences → expected trend labels |
| `test_lstm_trend_inference.py` (NEW) | 4 canonical sequences (stable/inc/dec/abnormal) → correct class |
| `test_priority_cascade.py` (NEW) | mock each model failure → correct fallback path |
| `test_reliability_gate.py` (NEW) | reliability_score < 40 → "unreliable" always |
| `test_llm_guardrail.py` (existing) | block-list + emergency referral |

### 8.2 Integration tests

- `test_ai_endpoints.py` — round-trip HTTP call for all `/ai/*` endpoints against a test DB
- `test_lstm_short_sequence_fallback.py` — length < 7 must return `insufficient_data` cleanly

### 8.3 Simulation scenarios (for report §4.2)

| # | Scenario | Expected trend | Purpose |
|---|---|---|---|
| S1 | 14 days stable @ 0.8 ppm | stable | baseline confirmation |
| S2 | 14 days ramp 2→40 ppm | **increasing** | fixes L4 (was FAIL) |
| S3 | 14 days ramp 25→3 ppm | decreasing | keto-diet exit |
| S4 | 14 days stable + spike day 7 | abnormal | acute event detection |
| S5 | 6 sessions only | insufficient_data | short-sequence handling |
| S6 | 14 days but 3 sessions unreliable | drop unreliable, re-eval | reliability integration |

---

## 9. Roadmap — 5 Days to NSC + Post-NSC

### Day 1 (2026-07-12, ✅ done today)
- ✅ Phase 1 report fixes
- ✅ Phase 2 RF/XGB dual variant

### Day 2 (2026-07-13)
- 🎯 **Phase 3A**: Synthetic longitudinal generator (`generate_longitudinal_data.py`) → 1,400 rows
- 🎯 **Phase 3B**: Trend label rule → `apps/api/app/services/trend_label.py`
- 🎯 **Phase 3C**: New training notebook `05_lstm_trend.ipynb` → train `lstm_trend.pt`

### Day 3 (2026-07-14)
- 🎯 **Phase 3D**: Backend integration — `ml_inference.predict_trend()`, endpoint schema change
- 🎯 **Phase 3E**: `test_trend_label_rule.py` + `test_lstm_trend_inference.py`
- 🎯 **Phase 3F**: Update PDF §3.3 (LSTM arch), §4.2 (fix ramp FAIL), §7.1 L4 (mark addressed)

### Day 4 (2026-07-15)
- 🎯 **Phase 4A**: Frontend `/lib/api/ai.ts` client update
- 🎯 **Phase 4B**: `TrendMiniCard`, `TrendClassificationBanner`, `PostSessionSummary`, `ReliabilityCard`
- 🎯 **Phase 4C**: i18n keys (en/th)
- 🎯 **Phase 4D**: manual UI walkthrough — dev server + Chrome

### Day 5 (2026-07-16)
- ✅ **Phase 5A**: Full end-to-end simulation — S1..S6 scenarios via `simulate_scenarios.py` (6/6 PASS, JSON evidence saved)
- 🚧 **Phase 5B**: Rebuild PDF ✅, run pytest ✅ (23/23), **walk through UI + screenshot for report** ← pending
- ✅ **Phase 5C**: `NSC_DEFENSE_CHEATSHEET.md` — 12 Q+A + cheat card + section pointers
- 📅 **Phase 5D**: Final commit + tag `v1.0-nsc2026-submission` (awaiting owner sign-off)

### 2026-07-17 — NSC Submission

### Post-NSC (Aug-Sep 2026 — Phase 6)
- Pilot study: 30 volunteers × 5 sessions × 14 days
- Collect blood BOHB reference labels
- Retrain RF/XGB predictive using BOHB labels — **this closes L9**
- Retrain LSTM trend on real longitudinal — **this closes L1, L2, L3, L4**
- Publish updated report v2.0

### Q4 2026 (Phase 7)
- IRB submission for expanded pilot
- Certified clinical accuracy report
- App store submission (with medical disclaimer)

---

## 10. File Inventory

### 10.1 Backend — New files (Phase 3+)

```
apps/api/notebooks/generate_longitudinal_data.py   [NEW]
apps/api/notebooks/05_lstm_trend.ipynb             [NEW]
apps/api/notebooks/06_smartbreath_pretrain.ipynb   [NEW optional]
apps/api/app/services/trend_label.py               [NEW]
apps/api/alembic/versions/phase3_trend_snapshots.py [NEW migration]
apps/api/models/lstm_trend.pt                       [NEW artifact]
data/processed/scaler_lstm_trend_mean.npy           [NEW]
data/processed/scaler_lstm_trend_scale.npy          [NEW]
data/processed/longitudinal_synthetic.csv           [NEW]
apps/api/tests/test_ai_leakage_check.py             [NEW]
apps/api/tests/test_trend_label_rule.py             [NEW]
apps/api/tests/test_lstm_trend_inference.py         [NEW]
apps/api/tests/test_priority_cascade.py             [NEW]
apps/api/tests/test_reliability_gate.py             [NEW]
```

### 10.2 Backend — Files to modify

```
apps/api/app/services/ml_inference.py               [add predict_trend]
apps/api/app/routers/ai.py                          [new response schemas]
apps/api/app/models/health.py                       [TrendSnapshot model]
apps/api/notebooks/train_models.py                  [✅ done in Phase 2]
apps/api/scripts/generate_ai_research_pdf.py        [§3.3, §4.2, L4]
```

### 10.3 Frontend — New files

```
apps/web/src/lib/api/ai.ts                          [NEW client wrapper]
apps/web/src/components/cards/TrendMiniCard.tsx     [NEW]
apps/web/src/components/cards/TrendClassificationBanner.tsx [NEW]
apps/web/src/components/cards/PostSessionSummary.tsx [NEW]
apps/web/src/components/cards/ReliabilityCard.tsx   [NEW]
apps/web/src/components/cards/TodayReadingCard.tsx  [NEW]
```

### 10.4 Frontend — Files to modify

```
apps/web/src/app/(app)/home/page.tsx                [wire in TodayReading + TrendMini]
apps/web/src/app/(app)/trends/page.tsx              [wire in TrendClassificationBanner]
apps/web/src/app/(app)/breathing/page.tsx           [PostSessionSummary]
apps/web/src/app/(app)/me/page.tsx                  [ReliabilityCard]
apps/web/src/i18n/locales/en.ts                     [trend.* keys]
apps/web/src/i18n/locales/th.ts                     [trend.* keys]
```

### 10.5 Documentation

```
plan.md                                             [this file — v2.0]
plan_metabreath.md                                  [existing — companion]
plan_connect_ai.md                                  [existing — obsoleted by this plan]
MetaBreath_AI_Technical_Report_NSC2026.pdf          [update in Day 3+5]
NSC_DEFENSE_CHEATSHEET.md                           [NEW Day 5]
docs/architecture/ai_pipeline.md                    [NEW — mirror of §1-4 for CI/CD]
```

---

## 11. Risks & Mitigations

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | LSTM Trend synthetic data too easy → memorises trend patterns instead of learning slope | High | Add noise + participant-wise split + ramp/spike augmentation; monitor CV vs. train gap |
| R2 | Breaking API change on `/ai/predict/lstm` breaks live app during transition | Med | Version the endpoint: `/ai/predict/lstm/v2` (new schema) alongside `/v1` (legacy) until frontend cut-over |
| R3 | 5-day timeline slips (LSTM training or frontend takes longer) | High | Cut Phase 3E (SmartBreath pretraining) first, then trend rule tuning; Phase 4 UI can ship as read-only stubs if needed |
| R4 | Judge asks "why is your LSTM synthetic when eNose has real breath?" | Med | Prepared answer: eNose = single-timepoint per subject (no trend), Ziyatdinov = temporal but non-human. Longitudinal per-person is the missing piece; pilot phase collects that. |
| R5 | Trend label rule params (slope=0.3, spike=4.0 ppm) are arbitrary | Med | Document rationale in `trend_label.py` docstring + `plan.md §5.4`; treat as hypothesis to refine with pilot data |
| R6 | Frontend breaking on old cached data / trend_label enum mismatch | Low | Add explicit `insufficient_data` and `unknown` cases in UI; TypeScript union types force exhaustive handling |
| R7 | Predictive-variant models accidentally served instead of verification | Med | File-name convention `*_predictive.joblib` never loaded by `ml_inference.py`; add unit test that asserts loaded model path |
| R8 | Migration `phase3_trend_snapshots` deploys before backfill script → empty table blocks LSTM | Low | Ship backfill in same PR as migration; LSTM gracefully returns `insufficient_data` on empty history |

---

## 12. Success Criteria — NSC Submission (2026-07-17)

The submission is considered ready when **all** of the following are true:

- [x] PDF §4.1 shows verification + predictive + chance baseline (Phase 2 ✅)
- [x] PDF §7.1 L9 present with concrete numbers (Phase 2 ✅)
- [x] PDF §3.3 shows 4-class trend LSTM architecture (Phase 3F ✅ — rebuilt 2026-07-12 22:22)
- [x] PDF §4.2 ramp scenario shows PASS not FAIL (Phase 3F ✅)
- [x] `lstm_trend.pt` exists and unit tests pass (Phase 3C, 3E ✅ — 23/23 pytest)
- [x] `/ai/predict/lstm` returns new schema without error on real device data (Phase 3D ✅)
- [x] Frontend Home page shows `TrendClassCard` (combined MiniCard) (Phase 4B ✅)
- [x] Trends page shows `TrendClassCard` (combined Banner) (Phase 4B ✅)
- [x] Simulation script `simulate_scenarios.py` runs 6/6 PASS + writes JSON evidence (Phase 5A ✅)
- [ ] Manual walkthrough on Chrome: 6 simulation scenarios render correctly (Phase 5B)
- [x] `NSC_DEFENSE_CHEATSHEET.md` exists with answers to 12 anticipated questions (Phase 5C ✅)
- [ ] `git tag v1.0-nsc2026-submission` pushed (Phase 5D)

---

## Appendix A — Preserved Polish Items (from `plan.md` v1)

Below are polish items noted before this document was expanded. They remain **non-fundamental** and can be addressed after MVP. Keeping here to avoid loss:

1. **First-boot indicator** — ตอน user เพิ่งเสียบไฟใหม่ ใน 2-3 นาทีแรก readings จะ drift เยอะ ควรมีเตือนในแอปว่า "เพิ่งเปิดเครื่อง รอ 2 นาทีก่อนตรวจ"
2. **Quality score gate** — ถ้า quality < 60 หลัง session จบ ควรเตือนว่า "ค่าไม่แม่นยำ ลองเป่าใหม่" (โค้ดมี quality_score อยู่แล้ว แต่ยังไม่ได้ enforce) — **partly addressed** by Reliability Gate (§4.2); still need UI toast
3. **Sample rate ตอน recording** — ESP32 ส่งทุก 3 วิ = ~3 samples ต่อ 10 วิ ค่อนข้างน้อย ถ้าอยากได้ resolution สูงกว่านี้ ต้องส่ง MQTT command ให้ ESP32 publish เร็วขึ้น (1 วิ) ตอนอยู่ใน session

---

## Appendix B — Glossary

| Term | Meaning |
|---|---|
| **Anderson label** | 5-class breath acetone classification (basal / light_ket / nutritional_ket / deep_ket / dka_risk) from ppm thresholds |
| **Verification variant** | RF/XGB using all 13 features (includes leaky) — measures rule-consistency |
| **Predictive variant** | RF/XGB using 9 non-leaky features — measures independent predictive signal |
| **Leaky feature** | A feature whose value is used to derive the label (acetone_delta, ketosis_index, metabolic_score, fat_burning_index) |
| **Trend classifier** | LSTM predicting direction of the user's own baseline over a 7-30 session window |
| **Participant-wise split** | Train/test split by `user_id` so no single person appears in both — prevents within-person leakage |
| **Reliability Gate** | Priority-0 filter that blocks all downstream ML when `reliability_score < 40` |
| **Priority cascade** | Deterministic fallback chain: Gate → XGB → RF → LSTM (parallel) → Anderson rule |
| **BOHB** | β-hydroxybutyrate (blood ketone) — the independent clinical reference needed to break label-feature circularity |

---

## Change Log

| Date | Version | Change |
|---|---|---|
| pre-2026-07-12 | 1.0 | Polish item list (3 items, see Appendix A) |
| 2026-07-12 | 2.0 | Full rewrite — 12 sections + 2 appendices; incorporates Phase 1/2 results and Phase 3 Trend Classifier design from external spec |
