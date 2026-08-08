# NSC 2026 Defense — Q&A Cheat Sheet
> **สำหรับ**: MetaBreath AI Pipeline — MetaBreath Health Platform
> **สร้าง**: 2026-07-12
> **ใช้เพื่อ**: เตรียมตอบคำถามกรรมการวันซ้อม/วันจริง
> **หลักการ**: ตอบตรง สั้น มีเลข อ้าง section ในรายงาน (`MetaBreath_AI_Technical_Report_NSC2026.pdf`)

---

## เตรียมพูดเปิด (30 วินาที)

> "MetaBreath เป็นระบบ AI 4 ชั้น (RF/XGB verification + predictive, LSTM Trend, Drift Detector, Anderson rule) ที่รับสัญญาณจาก TGS1820 sensor ผ่าน ESP32 เข้ามาแปลงเป็นข้อมูลสุขภาพให้ผู้ใช้ ทีมเราออกแบบมาโดยยึด 3 หลัก: (1) ตัวเลขที่รายงานต้องซื่อสัตย์เชิงวิทยาศาสตร์ ไม่ inflate, (2) แยกบทบาทโมเดล — RF/XGB ตอบว่า 'ตอนนี้อยู่โซนไหน' และ LSTM ตอบว่า 'แนวโน้มกำลังไปทางไหน' — ไม่ทำงานซ้ำกัน, (3) มี guardrail และ fallback ทุกชั้น รายงานฉบับนี้จึงมีทั้ง verification metrics (สูง 0.99 แต่บอกไว้ชัดเจนว่าคือ rule-consistency check) และ predictive baseline (0.40 ~ chance) เพื่อ quantify ปริมาณ leakage — ซึ่งเป็นสิ่งที่งาน biomedical AI จำนวนมากไม่ทำ"

---

## Q1: ทำไม RF/XGB ได้ Test Accuracy 0.99 — สูงเกินไปน่าสงสัย

**คำตอบสั้น (10 วินาที)**:
> "ตัวเลข 0.9917 คือ **rule-verification** ไม่ใช่ predictive validity เพราะ label ของเราสร้างจาก Anderson threshold บน `acetone_delta` ตรง ๆ และ `acetone_delta` ก็เป็น input feature — โมเดลเลยแค่ทายซ้ำกฎ เราจึงเทรน predictive variant ที่ตัด `acetone_delta` + 3 derived features ออก ได้ 0.40 ซึ่งใกล้ chance baseline 0.3783 → quantify การ leakage ตรง ๆ ในรายงาน §4.1 + §7.1 L9"

**คำตอบยาว (30 วินาที)**:
> "ที่กรรมการเห็นตัวเลข 0.99 ในตาราง §4.1 คอลัมน์แรก จะสังเกตว่าเรามีคอลัมน์ **Variant** ระบุชัดว่า 'verification (13 feat.)' ตรงข้ามกับ 'predictive (9 feat.)' — เรามีทั้ง 2 variant ในตารางเดียวกัน เพราะ label ของ Anderson threshold คือ deterministic function ของ `acetone_delta` ถ้าเราใส่ acetone_delta เป็น input โมเดลก็แค่ทายซ้ำกฎที่เราตั้งเอง เราถึงเรียกแบบนี้ว่า 'verification' คือทดสอบว่า pipeline ทำงานถูกต้องภายใต้ noise — ไม่ใช่ 'predictive' ถ้าเราตัด acetone_delta ออก (คอลัมน์ predictive 0.40) จะเห็นว่า model เหลือแค่ chance baseline (0.3783) นี่คือหลักฐานว่าตัวเลข 0.99 มา from circularity ทั้งหมด ที่รายงาน §4 Interpretation Note และ §7.1 L9 อธิบายไว้ครบ"

**เลขที่ต้องจำ**:
- RF verification = **0.9917** / XGB verification = **0.9917**
- RF predictive = **0.3958** / XGB predictive = **0.4333**
- Chance baseline (stratified 5-class) = **0.3783**

---

## Q2: ทำไมตัด CGM datasets (IoT Sensor Diabetes + GlucoBench) ออก

**คำตอบสั้น**:
> "เพราะ CGM วัดน้ำตาลในเลือด ไม่ใช่ acetone ในลมหายใจ เป็นคนละ modality คนละหน่วยวัด คนละกลไกสรีรวิทยา การเอาไป pretrain LSTM ข้ามโดเมนโดยไม่มีเหตุผลรองรับ ไม่ใช่ transfer learning ที่ยอมรับได้ทางวิชาการ — เราจึงตัดออกและ document การตัดใน §2.1 + refs [4],[5] เดิมถูกลบใน §10"

**คำถามต่อ**: "ถ้าตัดออกแล้วเหลือ dataset อะไร?"
> "1) MetaBreath Demo (synthetic Anderson-based) 1,199 rows — RF/XGB training, 2) eNose Diseases (Rizwan) 1,000 rows breath จาก 545 diabetic + 455 normal — reference สำหรับ TGS family alignment (ยังไม่ merge เข้า pipeline เพราะเหตุผลใน §2.1), 3) UCI Gas Drift 13,910 rows — Drift Detector, 4) Longitudinal Synthetic 1,400 rows — LSTM Trend รวม 16,109 rows ตรงกับ Total row ใน §2.1"

---

## Q3: eNose dataset ในรายงานบอกว่าเป็น breath จาก 1,000 คน — ตรวจแล้วจริงไหม

**คำตอบ**:
> "ตรวจแล้ว เปิดไฟล์ CSV จริง `Data_gas/enose_dataset_to_predict_human_/enose_dataset_to_predict_human_disease.csv` มี columns TGS2600/TGS2602/TGS2611/TGS2610/TGS2620/TGS826 + คอลัมน์ `Subjek` = 'Diabetes' หรือ 'Normal' ยืนยันว่า **เป็นข้อมูลลมหายใจจริงจากคน** ไม่ใช่ lab gas ตามที่ Kaggle description บอก และตรงกับ paper Taspinar (2025) ที่วิเคราะห์ dataset เดียวกัน หลังตรวจ เราแก้ Type column ใน §2.1 จาก 'Lab gas' → 'Human breath (545 diabetic / 455 normal)'"

---

## Q4: LSTM ของทีมนี้เทรนบน synthetic data ทำไมไม่ใช้ eNose ที่เป็น breath จริง

**คำตอบ**:
> "เพราะ eNose เก็บลมหายใจ **จุดเดียวต่อคน 1 subject** ไม่มี longitudinal per-person แต่ Trend Classifier ของเราต้องการ **sequence 7-30 sessions ต่อคน** เพื่อเรียนรู้ pattern การเปลี่ยนแปลงตามเวลา ณ ตอนนี้ไม่มี dataset สาธารณะที่เก็บ breath acetone ต่อเนื่อง 2 สัปดาห์ต่อคน 100+ คน เราจึงสร้าง synthetic longitudinal data (100 pt × 14 sess) จาก Anderson baseline + realistic covariates + 4 canonical trend patterns เพื่อฝึก architecture ก่อน ตัว pilot phase (§7.2) จะเก็บ real longitudinal + BOHB reference มาแทน และเรามี hooks (`app/services/trend_label.py`, `train_lstm_trend.py`) พร้อมให้ retrain ทันทีที่ได้ข้อมูล"

**ประเด็นเสริม**:
- ทีมเราไม่ได้ overclaim: PDF §3.5 warn box + §7.1 L1 บอกชัดว่า "synthetic dataset" — เราไม่แอบซ่อน

---

## Q5: Trend Classifier แค่หา slope ก็ได้ ทำไมต้อง LSTM

**คำตอบ**:
> "เพราะ (1) slope ตัวเดียวไม่สามารถแยก 'ค่อย ๆ ขึ้นจริง' จาก 'ค่ากระโดดที่ทำให้ slope บวกเทียม' ได้ (2) slope ไม่รู้ว่า sensor คุณภาพต่ำหรือ ambient rush ทำให้ค่าคลาดเคลื่อน แต่ LSTM ดูทั้ง 8 features รวม `quality_score`, `pressure_std`, `humidity` ประกอบ (3) ในระบบเรา rule-based slope เป็น **fallback** อยู่แล้ว (`_classify_trend_rule_fallback` ใน `ml_inference.py`) ถ้า LSTM หลุด rule จะคว้ามา แต่ default LSTM ให้ผลลัพธ์ที่คำนึงถึงหลาย features และ noise pattern พร้อมกัน"

**เลขประกอบ**:
- LSTM val_acc = **0.9500**, F1_weighted = 0.9495
- Rule fallback ให้ confidence ตายตัว 0.70 (แต่ LSTM ให้ probability distribution จริงจากซอฟต์แมกซ์)

---

## Q6: ทำไมต้อง Participant-wise split ไม่ใช่ random split

**คำตอบ**:
> "เพราะ random split แบบ scikit-learn จะเลือก sample แบบสุ่มจากทั้ง dataset ซึ่งใน longitudinal data 1 คนมีหลาย sessions — random split จะทำให้ session ของคนคนเดียวกันไปโผล่ทั้งใน train และ val → เกิด within-person leakage โมเดลจะได้ acc สูงเทียมเพราะจำ pattern เฉพาะคน ไม่ใช่ generalize เราใช้ 80 patients เข้า train, 20 patients เข้า val — set of patients disjoint กัน 100% (assert ใน train script) เห็นได้ที่ตัวเลข val_acc = 0.95 ไม่ใช่ 1.0 → หลักฐานว่าไม่จำ"

**ประเด็นเสริม**:
- ผลของ split ที่ถูกต้อง: confusion matrix ที่ §3.5.3 อ้างถึง โชว์ abnormal recall = 0.80 (1 miss ใน 5) — ตัวเลขที่ realistic ไม่ artificial

---

## Q7: Trend label rule (slope + spike) ตั้ง threshold เอง 0.3 กับ 4.0 arbitrary ไหม

**คำตอบ**:
> "ตอนนี้ยัง arbitrary ครับ เราเลือกจาก 2 เกณฑ์: (1) slope 0.3 ppm/session = คิดง่าย ๆ 2 สัปดาห์ต้องขึ้น ≥4 ppm ถึงจะเรียกว่าแนวโน้ม (2) spike 4.0 ppm มาจาก Anderson threshold ชั้นแรก 0.5→2.0 ppm ซึ่ง ~2 ppm width จึง 2× width = 4 ppm เป็น 'jump ที่ข้าม 2 zone' — เราเปิด `TrendLabelConfig` ให้ tunable ผ่าน env และมี test coverage ครบ (ที่ `tests/test_trend_label_rule.py`) ค่า arbitrary นี้เป็น hypothesis ที่จะปรับหลัง pilot จริงมา"

---

## Q8: LLM Guardrail — ป้องกันจริงไหม ถ้าคน jailbreak ล่ะ

**คำตอบ**:
> "เรามี 2 ชั้น: (1) **pre-screen** user input ด้วย regex + keyword blocklist ก่อนส่งเข้า LLM (2) **post-screen** LLM output ก่อนส่งกลับ user — ทั้ง 5 category ที่ §8 บล็อก: drug dosage, diagnosis, deny-doctor, extreme fasting, self-harm ทั้ง TH + EN ทุก response append `disclaimer` อัตโนมัติ และถ้าเจอ emergency symptoms → force referral 1669 เราไม่ปฏิเสธว่ามี jailbreak edge cases — เป็นเรื่อง defense in depth ไม่ใช่ perfect wall — แต่ 3 ชั้น (pre + LLM + post) ยากที่ user จะ bypass ผ่านครบ"

---

## Q9: ระบบ deploy ยังไง ใช้จริงได้ไหม

**คำตอบ**:
> "Full stack ใช้งานได้แล้ว: (1) ESP32 firmware ส่ง MQTT ไปที่ mosquitto broker → FastAPI /sensor/reading เก็บลง Postgres (2) FastAPI 5 endpoints /ai/predict, /ai/predict/lstm (legacy), /ai/predict/trend (Phase 3 ใหม่), /ai/trend, /ai/drift, /ai/chat (3) Next.js app show ผลบน /home, /trends, /breathing มี TrendClassCard เชื่อม /ai/predict/trend อยู่ทั้ง 2 หน้า Docker compose พร้อม deploy — infra/nginx.conf + docker-compose.yml"

---

## Q10: ถ้ากรรมการถามว่า 'Phase 6 pilot จะเริ่มเมื่อไหร่'

**คำตอบ**:
> "ตามแผน `plan.md §9`: หลัง NSC submission 17 กค. เข้า Phase 6 สิงหาคม 2026 เก็บ 30 volunteers × 5 sessions × 14 days พร้อม blood BOHB (Precision Xtra) + urine strip (Ketostix) เป็น reference — ถ้า BOHB ตรงกับ ΔVOC ที่ MetaBreath วัด ก็จะ retrain RF/XGB predictive ด้วย label ใหม่ที่ **ไม่เป็นฟังก์ชันของ acetone_delta** อีกต่อไป → break the label-feature circularity → รายงาน predictive validity ที่แท้จริงได้ในรอบต่อไป"

---

## Q11 (Trap): ถ้ากรรมการชี้ว่า "ตัว predictive variant 0.40 ก็ยังไม่ perfect เหมือน 0.99"

**คำตอบ**:
> "ครับ 0.40 ไม่ใช่ผลสำเร็จ — เป็น **honest baseline** ครับ มัน quantify ว่า ถ้าไม่ได้ดู acetone_delta ตรง ๆ features อื่น (pressure/temp/humidity/quality) แทบไม่มีสัญญาณเกี่ยวกับ metabolic state จริง ๆ ในชุด synthetic นี้ — ซึ่งก็เป็น expected เพราะ synthetic generator ตั้งใจสุ่ม features เหล่านั้นเป็น independent ของ ppm นี่คือหลักฐานเชิงลบที่มีค่า มันบอกว่า pipeline ปัจจุบันพึ่ง acetone_delta อย่างเดียว → Phase 6 pilot ต้องยืนยันว่า acetone_delta จริงจากคนจริงมี clinical validity ต่อ BOHB จริงหรือไม่ ถ้าใช่ Anderson label + LSTM Trend classifier + Drift Detector ทำงานได้ตามที่ออกแบบ"

---

## Q12 (Trap): "ทีมอื่นได้ 0.99 หมด ทำไมพวกคุณลด scope ลงมา"

**คำตอบ**:
> "หลาย ๆ ทีมยังใช้ label ที่มาจาก feature ตัวเดียวกันแล้วรายงาน accuracy — ผลลัพธ์แบบนั้นถูก inflate ทีมเราเลือก reproduce ปัญหานี้ให้กรรมการเห็น ผ่านการเทรน 2 variant + chance baseline ในตารางเดียวกัน (§4.1) เพื่อ demonstrate ว่าจริง ๆ แล้ว 0.99 ของเราเท่ากับ 0.40 (ที่ chance ~ 0.38) มัน 'ดูสวย' แค่ตราบเท่าที่ตัด context ทิ้ง — เราเลือก show context ครบ ให้กรรมการเชื่อได้จริง ๆ ว่าเราเข้าใจ ML methodology"

---

## Escape hatches — ถ้าไม่รู้จะตอบ

- **"ตรงนี้ผมไม่แน่ใจ ต้องขอกลับไปตรวจ [ไฟล์ X, บรรทัด Y]"** — แสดงความ awareness ของ codebase
- **"ประเด็นนี้อยู่ใน L1-L9 ของ §7.1 เรายอมรับ limitation นี้ตรง ๆ"** — ชี้ไป PDF
- **"ตรงกับที่ plan.md § X ระบุไว้แล้ว จะมี follow-up ใน Phase 6"** — โยงกับ roadmap

---

## Cheat card — ตัวเลขที่ต้องรู้ทันที

```
                          Test Acc    F1_w      CV F1
RF verification         : 0.9917    0.9917    0.9907 ± 0.0063
XGB verification        : 0.9917    0.9903    0.9926 ± 0.0061
RF predictive           : 0.3958    0.3969    0.3725 ± 0.0456
XGB predictive          : 0.4333    0.3737    0.3848 ± 0.0043
Chance (stratified 5c)  : 0.3783
LSTM legacy (3-class)   : 0.9722    0.9722    val_acc = 0.9565
LSTM Trend (Phase 3)    : 0.9500    0.9495    val (participant)
Drift Detector          : 0.9850    0.9850    0.8418

Datasets: MetaBreath Demo 1,199 + eNose 1,000 + UCI Drift 13,910
         + Longitudinal Synthetic (100 pt × 14 sess) = 1,400
Total: 16,109  (removed IoT Sensor Diabetes 4,981 + GlucoBench 15,731)

Trend LSTM: 100 patients synthetic, 80/20 participant-wise split
            4 classes: stable / increasing / decreasing / abnormal
            8 features per session, sequence L = 14 (min 7)
```

---

## Report section pointers (ตอบไว)

| ประเด็น | Section |
|---|---|
| ข้อมูล synthetic | §2 disclosure box + §2.1 table |
| Label-feature circularity | §4 Interpretation Note + §7.1 L9 |
| Verification vs Predictive | §4.1 table + reading note |
| Leaky features flagged | §5 (dot ● column) + tinted rows |
| LSTM Trend architecture | §3.5.1 + §3.5.2 + §3.5.3 |
| Ramp scenario FAIL→PASS | §4.2 legacy + trend rows + footnote ‡ |
| L4 addressed | §7.1 L4 (Impact column) |
| Pilot plan | §7.2 |
| Guardrail | §8 |
| Model files | §9 |

---

## Final rehearsal note

- อย่ารีบพูดตัวเลข — พูดชื่อ variant ก่อน ("verification variant ได้..." ไม่ใช่ "ได้ 0.99")
- เมื่อกรรมการ interrupt ให้พยักหน้าและปรับคำตอบตรงจุดที่ถาม อย่ายืดคำอธิบายเดิม
- ตอนเจอคำถามที่เตรียมมา อย่าตอบตรงเป๊ะ verbatim — ปรับให้ธรรมชาติ
- ตอน demo — โชว์ TrendClassCard บน /home หรือ /trends เพื่อ prove ว่าระบบทำงานถึง UI

**พร้อม!** 🎯
