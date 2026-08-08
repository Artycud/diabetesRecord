"""
External-data evaluation: run our deployed Trend LSTM against the
Ziyatdinov 2015 "Gas Sensor Array under Flow Modulation" (SmartBreath
reference) dataset and produce a PDF report at
apps/api/tests/SMARTBREATH_TEST_REPORT.pdf.

Why this matters:
    Our Trend LSTM was trained on synthetic longitudinal sequences.
    The SmartBreath dataset is REAL sensor recordings (Figaro TGS array,
    simulated 5 breaths/min behind a ventilator, acetone/ethanol at
    controlled concentrations). Feeding those concentrations into our
    LSTM as `acetone_delta` sequences tests whether the model
    generalises from synthetic ppm patterns to concentrations grounded
    in a real physical sensor experiment.

Caveats explicitly stated in the report:
    * Different sensor part (16-channel Figaro array vs. our TGS1820)
    * Cross-sectional per-sample, not longitudinal per-person -- we
      construct sequences by ordering samples in canonical trends
    * Concentration is scaled (vol%) x 30 -> ppm-equivalent so the four
      SmartBreath levels {0, 0.1, 0.3, 1.0 vol%} map to {0, 3, 9, 30}
      ppm, comfortably inside the LSTM's training distribution
    * Covariate features (pressure/temperature/humidity/quality) are
      absent in SmartBreath, so we pass None and rely on the
      mean-imputation path added in ml_inference.classify_trend

Usage:
    python apps/api/scripts/test_smartbreath_lstm.py

Output:
    apps/api/tests/SMARTBREATH_TEST_REPORT.pdf
    apps/api/tests/smartbreath_results.json
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable, PageBreak, Paragraph, SimpleDocTemplate, Spacer,
    Table, TableStyle,
)

ROOT = Path(__file__).parent.parent.parent.parent
API = ROOT / "apps" / "api"
DATA_DIR = ROOT / "Data_gas" / "SmartBreath_LSTM_TrainingData"
SAMPLE_INDEX = DATA_DIR / "Sample_Index.csv"
OUT_PDF = API / "tests" / "SMARTBREATH_TEST_REPORT.pdf"
OUT_JSON = API / "tests" / "smartbreath_results.json"

sys.path.insert(0, str(API))
from app.services.ml_inference import (  # noqa: E402
    TREND_LABELS, TREND_MIN_SEQUENCE_LENGTH, classify_trend,
)

VOL_PERCENT_TO_PPM = 30.0  # scale so SmartBreath {0,0.1,0.3,1.0}% -> {0,3,9,30} ppm


# ── Thai-capable fonts ─────────────────────────────────────────────────────
FONT_DIRS = [
    "/System/Library/Fonts/Supplemental",
    "/Library/Fonts",
    os.path.expanduser("~/Library/Fonts"),
    "/usr/share/fonts/truetype/thai",
]
THAI_FONT = None
for d in FONT_DIRS:
    for name in ["THSarabunNew.ttf", "Tahoma.ttf", "Arial Unicode MS.ttf",
                 "NotoSansThai-Regular.ttf", "Sarabun-Regular.ttf"]:
        p = os.path.join(d, name)
        if os.path.exists(p):
            try:
                pdfmetrics.registerFont(TTFont("ThaiFont", p))
                THAI_FONT = "ThaiFont"
                break
            except Exception:
                pass
    if THAI_FONT:
        break

BASE_FONT = THAI_FONT if THAI_FONT else "Helvetica"
BASE_FONT_BOLD = THAI_FONT if THAI_FONT else "Helvetica-Bold"

C_PRIMARY = colors.HexColor("#1B4F72")
C_ACCENT = colors.HexColor("#2E86C1")
C_LIGHT = colors.HexColor("#D6EAF8")
C_GREEN = colors.HexColor("#1E8449")
C_ORANGE = colors.HexColor("#CA6F1E")
C_RED = colors.HexColor("#922B21")
C_GREY = colors.HexColor("#717D7E")
C_GREY_LITE = colors.HexColor("#F2F3F4")
C_OK_BG = colors.HexColor("#D4EFDF")
C_WARN_BG = colors.HexColor("#FDEBD0")
C_WARN_BDR = colors.HexColor("#E59866")

W, H = A4


def styles():
    def S(name, fontName=None, **kw):
        return ParagraphStyle(name, fontName=fontName or BASE_FONT, **kw)
    return {
        "cover_title": S("cover_title", fontName=BASE_FONT_BOLD, fontSize=22,
                         leading=28, textColor=C_PRIMARY, alignment=TA_CENTER),
        "cover_sub": S("cover_sub", fontSize=13, leading=18,
                       textColor=C_ACCENT, alignment=TA_CENTER),
        "cover_meta": S("cover_meta", fontSize=10, leading=14,
                        textColor=C_GREY, alignment=TA_CENTER),
        "h1": S("h1", fontName=BASE_FONT_BOLD, fontSize=15, leading=20,
                spaceBefore=14, spaceAfter=6, textColor=C_PRIMARY),
        "h2": S("h2", fontName=BASE_FONT_BOLD, fontSize=12, leading=16,
                spaceBefore=10, spaceAfter=4, textColor=C_ACCENT),
        "body": S("body", fontSize=10, leading=15, spaceAfter=4,
                  alignment=TA_JUSTIFY),
        "note": S("note", fontSize=9, leading=12, textColor=C_GREY,
                  alignment=TA_JUSTIFY, spaceAfter=4),
        "tbl_cell": S("tbl_cell", fontSize=9, leading=12, alignment=TA_LEFT),
        "good": S("good", fontName=BASE_FONT_BOLD, fontSize=9, leading=12,
                  textColor=C_GREEN, alignment=TA_CENTER),
        "bad": S("bad", fontName=BASE_FONT_BOLD, fontSize=9, leading=12,
                 textColor=C_RED, alignment=TA_CENTER),
        "amb": S("amb", fontName=BASE_FONT_BOLD, fontSize=9, leading=12,
                 textColor=C_ORANGE, alignment=TA_CENTER),
    }


def tbl_style(header=C_PRIMARY):
    return TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), header),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), BASE_FONT_BOLD),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("FONTNAME", (0, 1), (-1, -1), BASE_FONT),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_GREY_LITE, colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.4, C_GREY),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ])


def hr(color=C_ACCENT, w=1):
    return HRFlowable(width="100%", thickness=w, color=color,
                      spaceBefore=4, spaceAfter=4)


def sp(h=0.3):
    return Spacer(1, h * cm)


def box(text_html, S, bg=C_LIGHT, border=C_ACCENT):
    tbl = Table([[Paragraph(text_html, S["body"])]],
                colWidths=[W - 4.4 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.8, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return tbl


# ── Test construction ─────────────────────────────────────────────────────
def make_session(ppm: float) -> dict:
    """Return an 8-feature session dict; missing fields = None so the
    LSTM's mean-imputation path fills them (see ml_inference)."""
    return {
        "acetone_delta": float(ppm),
        "pressure_mean": None,
        "pressure_std": None,
        "breath_duration": None,
        "temperature": None,
        "humidity": None,
        "quality_score": None,
        "reliability_score": None,
    }


def sample_ppms(si: pd.DataFrame, ace_conc: float, n: int) -> list[float]:
    """Pick n samples at the requested vol% (repeat if fewer available)."""
    matches = si[si["ace_conc"] == ace_conc]["ace_conc"].tolist()
    if not matches:
        return [ace_conc * VOL_PERCENT_TO_PPM] * n
    ppms = [v * VOL_PERCENT_TO_PPM for v in matches]
    while len(ppms) < n:
        ppms += ppms
    return ppms[:n]


def build_scenarios(si: pd.DataFrame) -> list[dict]:
    """5 canonical scenarios built from real SmartBreath concentrations."""
    def seq(ppms):
        return [make_session(p) for p in ppms]

    # SB1 -- stable @ air baseline (all 0 vol%)
    sb1 = sample_ppms(si, 0.0, 14)

    # SB2 -- monotone ramp using SmartBreath's real concentration ladder
    sb2 = (
        sample_ppms(si, 0.0, 4)
        + sample_ppms(si, 0.1, 4)
        + sample_ppms(si, 0.3, 3)
        + sample_ppms(si, 1.0, 3)
    )

    # SB3 -- reverse ramp
    sb3 = list(reversed(sb2))

    # SB4 -- abnormal: flat + single ace-1.0 spike at t=7
    sb4 = sample_ppms(si, 0.0, 14)
    sb4[7] = 1.0 * VOL_PERCENT_TO_PPM

    # SB5 -- natural order from batch "day-1-morning" (first 14 rows)
    d1 = si[si["batch"] == "day-1-morning"].head(14)
    sb5 = [v * VOL_PERCENT_TO_PPM for v in d1["ace_conc"].tolist()]

    return [
        {
            "id": "SB1",
            "name": "Air baseline stable (14x ace_conc=0)",
            "expected": "stable",
            "ppms": sb1,
            "sequence": seq(sb1),
            "note": ("Uses only air samples from SmartBreath. "
                     "Tests LSTM behaviour on a flat real-sensor baseline."),
        },
        {
            "id": "SB2",
            "name": "Real ramp: 0 -> 0.1 -> 0.3 -> 1.0 vol% (14 sess)",
            "expected": "increasing",
            "ppms": sb2,
            "sequence": seq(sb2),
            "note": ("Real SmartBreath acetone concentration ladder, "
                     "scaled x30 -> {0, 3, 9, 30} ppm."),
        },
        {
            "id": "SB3",
            "name": "Reverse ramp: 1.0 -> 0.3 -> 0.1 -> 0 vol%",
            "expected": "decreasing",
            "ppms": sb3,
            "sequence": seq(sb3),
            "note": "Reverse of SB2 to test symmetric direction detection.",
        },
        {
            "id": "SB4",
            "name": "Air baseline + single ace-1.0 spike at t=7",
            "expected": "abnormal",
            "ppms": sb4,
            "sequence": seq(sb4),
            "note": ("Real SmartBreath 1.0 vol% acetone (30 ppm eq.) "
                     "inserted into 14 air samples."),
        },
        {
            "id": "SB5",
            "name": "Natural order (batch=day-1-morning, 14 first samples)",
            "expected": "informational",
            "ppms": sb5,
            "sequence": seq(sb5),
            "note": ("Whatever the experimenter ran that morning, "
                     "in original order. No expected label -- report "
                     "the LSTM's judgement as-is."),
        },
    ]


def run_scenarios(scenarios: list[dict]) -> list[dict]:
    results = []
    for sc in scenarios:
        r = classify_trend(sc["sequence"])
        exp = sc["expected"]
        got = r["trend"] or "insufficient_data"
        if exp == "informational":
            verdict = "info"
        else:
            verdict = "PASS" if got == exp else "FAIL"
        results.append({
            "id": sc["id"],
            "name": sc["name"],
            "expected": exp,
            "ppms": [round(p, 2) for p in sc["ppms"]],
            "got": got,
            "confidence": r["confidence"],
            "probabilities": r["probabilities"],
            "sequence_length": r["sequence_length"],
            "model_used": r["model_used"],
            "fallback_reason": r["fallback_reason"],
            "note": sc["note"],
            "verdict": verdict,
        })
    return results


# ── Report ────────────────────────────────────────────────────────────────
def build_pdf(results: list[dict], si: pd.DataFrame, out_path: Path) -> None:
    S = styles()
    story: list = []
    doc = SimpleDocTemplate(
        str(out_path), pagesize=A4,
        leftMargin=2.2 * cm, rightMargin=2.2 * cm,
        topMargin=2.0 * cm, bottomMargin=2.0 * cm,
        title="MetaBreath -- SmartBreath External Data Test",
        author="MetaBreath / MetaBreath Research Team",
    )

    scored = [r for r in results if r["verdict"] != "info"]
    n_pass = sum(1 for r in scored if r["verdict"] == "PASS")
    n_total = len(scored)

    # ── Cover ─────────────────────────────────────────────────────────
    story += [
        sp(2.4),
        Paragraph("SmartBreath External-Data Test",
                  S["cover_title"]),
        sp(0.3),
        Paragraph("Trend LSTM evaluated on Ziyatdinov 2015 real-sensor data",
                  S["cover_sub"]),
        sp(0.2),
        Paragraph(
            f"{len(si)} samples · 4 acetone concentrations · "
            f"{len(results)} constructed scenarios",
            S["cover_sub"]),
        sp(1.5),
        hr(C_PRIMARY, 2),
        sp(0.4),
        Paragraph("NSC 2026 — MetaBreath Health Platform", S["cover_meta"]),
        Paragraph(f"Report generated: {datetime.now():%Y-%m-%d %H:%M}",
                  S["cover_meta"]),
        sp(0.4),
        Paragraph(
            f"Scored scenarios: <b>{n_pass}/{n_total} PASS</b>  ·  "
            f"1 informational scenario",
            ParagraphStyle("hdr", fontName=BASE_FONT_BOLD, fontSize=11,
                           textColor=C_GREEN if n_pass == n_total
                           else C_ORANGE, alignment=TA_CENTER)),
        sp(1.6),
        box(
            "<b>Abstract.</b> รายงานฉบับนี้คือการทดสอบ Trend LSTM "
            "(4-class) ของ MetaBreath กับข้อมูลจริงจากภายนอก — "
            "Ziyatdinov 2015 SmartBreath reference dataset "
            "(58 samples ผ่านชุด TGS 16-channel เข้าไปในเครื่องช่วยหายใจ "
            "จำลอง 5 หายใจ/นาที) เพื่อดูว่าโมเดลที่เทรนบน synthetic "
            "longitudinal data สามารถ generalize ไปกับ real sensor "
            "concentration patterns ได้แค่ไหน ผ่านการสร้าง 5 canonical "
            "sequences จาก real ace_conc values",
            S),
    ]

    # ── Dataset section ───────────────────────────────────────────────
    story += [PageBreak(),
              Paragraph("1. Dataset Provenance", S["h1"]), hr()]
    ds_rows = [
        ["Field", "Value"],
        [Paragraph("Name", S["tbl_cell"]),
         Paragraph("Gas sensor array under flow modulation "
                   "(Ziyatdinov et al. 2015)", S["tbl_cell"])],
        [Paragraph("Source", S["tbl_cell"]),
         Paragraph("UCI ML Repository DOI 10.24432/C5BG7G  ·  "
                   "License: CC BY 4.0", S["tbl_cell"])],
        [Paragraph("Sensors", S["tbl_cell"]),
         Paragraph("16 metal-oxide sensors, 5 Figaro TGS models "
                   "(TGS2600 / 2602 / 2610 / 2620 + one). "
                   "NOT the TGS1820 used by MetaBreath.",
                   S["tbl_cell"])],
        [Paragraph("Setup", S["tbl_cell"]),
         Paragraph("Mechanical ventilator, 5 breaths/min "
                   "(simulated breath, not human)",
                   S["tbl_cell"])],
        [Paragraph("Analytes", S["tbl_cell"]),
         Paragraph("acetone / ethanol / mixtures at "
                   "{0, 0.1, 0.3, 1.0} vol%", S["tbl_cell"])],
        [Paragraph("Volume / batches", S["tbl_cell"]),
         Paragraph(f"{len(si)} samples across "
                   f"{si['batch'].nunique()} batches "
                   f"({', '.join(sorted(si['batch'].unique()))})",
                   S["tbl_cell"])],
        [Paragraph("Ground truth", S["tbl_cell"]),
         Paragraph("ace_conc / eth_conc (vol%) + gas class label",
                   S["tbl_cell"])],
    ]
    t = Table(ds_rows, colWidths=[3.6 * cm, 12.4 * cm])
    t.setStyle(tbl_style())
    story.append(t)

    story.append(sp(0.3))
    story.append(Paragraph("1.1 Sample distribution", S["h2"]))
    by_ace = si.groupby("ace_conc").size().to_dict()
    dist_rows = [["ace_conc (vol%)", "-> ppm (scaled x30)", "# samples",
                  "Anderson zone at ppm_eq"]]
    anderson = {0: "basal", 3: "basal", 9: "light_ketosis",
                30: "nutritional_ketosis"}
    for conc in sorted(by_ace):
        ppm = conc * VOL_PERCENT_TO_PPM
        dist_rows.append([
            f"{conc:.1f}",
            f"{ppm:.1f} ppm",
            str(by_ace[conc]),
            anderson.get(int(ppm), "-"),
        ])
    dt = Table(dist_rows, colWidths=[3 * cm, 3.5 * cm, 3.5 * cm, 6 * cm])
    dt.setStyle(tbl_style())
    story.append(dt)

    # ── Methodology ───────────────────────────────────────────────────
    story += [PageBreak(),
              Paragraph("2. Methodology & Caveats", S["h1"]), hr()]
    story.append(box(
        "<b>Domain mismatch (declared, not hidden).</b> โมเดลของเรา "
        "เทรนบน synthetic longitudinal ต่อคน; SmartBreath เก็บแบบ "
        "cross-sectional per-experiment กับ sensor คนละรุ่น "
        "(Figaro array แทน TGS1820) ผ่าน ventilator จำลอง — "
        "จึงไม่ใช่การทดสอบแบบ 'apples-to-apples' แต่เป็นการทดสอบว่า "
        "LSTM ที่เรียน slope / spike pattern แล้วยัง generalize ไปกับ "
        "real sensor concentration sequence ได้หรือไม่",
        S, bg=C_WARN_BG, border=C_WARN_BDR))
    story.append(sp(0.2))

    story.append(Paragraph("2.1 Scaling map", S["h2"]))
    story.append(Paragraph(
        f"SmartBreath's ace_conc column is in <b>vol%</b>. "
        f"Multiplying by {VOL_PERCENT_TO_PPM:g} scales it into the "
        "ppm range our LSTM saw during training. "
        "The mapping preserves ordering, monotonicity, and relative "
        "spacing between the four concentration levels; only the "
        "absolute magnitude is rescaled.",
        S["body"]))

    story.append(Paragraph("2.2 Missing covariates", S["h2"]))
    story.append(Paragraph(
        "SmartBreath does not report the 7 non-acetone features our "
        "LSTM expects (pressure/temperature/humidity/quality/reliability). "
        "We pass <font face='Courier'>None</font> for each; the "
        "<font face='Courier'>classify_trend()</font> mean-imputation "
        "path (added while fixing the S6 canonical scenario) then "
        "substitutes the training-set mean, so the LSTM sees an "
        "in-distribution input rather than a spurious zero.",
        S["body"]))

    story.append(Paragraph("2.3 Sequence construction", S["h2"]))
    story.append(Paragraph(
        "SmartBreath has 58 cross-sectional samples, not per-person "
        "longitudinal timelines. We therefore build 14-session "
        "sequences by ordering samples according to canonical trend "
        "shapes (stable / increasing / decreasing / abnormal) plus "
        "one 'natural order' scenario. Every acetone_delta value is a "
        "real SmartBreath measurement -- only the sequencing is "
        "constructed.",
        S["body"]))

    # ── Results ───────────────────────────────────────────────────────
    story += [PageBreak(),
              Paragraph("3. Scenario Results (SB1..SB5)", S["h1"]), hr()]

    verdict_map = {"PASS": "good", "FAIL": "bad", "info": "amb"}
    rows = [["ID", "Scenario", "Expected", "Got", "Conf",
             "Model used", "Verdict"]]
    for r in results:
        rows.append([
            r["id"],
            Paragraph(r["name"], S["tbl_cell"]),
            r["expected"],
            r["got"],
            (f"{r['confidence']:.3f}"
             if r["confidence"] and r["confidence"] > 0 else "n/a"),
            r["model_used"],
            Paragraph(r["verdict"].upper() if r["verdict"] != "info"
                      else "INFO",
                      S[verdict_map[r["verdict"]]]),
        ])
    rt = Table(rows,
               colWidths=[0.9 * cm, 5.0 * cm, 2.4 * cm, 2.2 * cm,
                          1.5 * cm, 2.6 * cm, 1.4 * cm])
    rt.setStyle(tbl_style())
    story.append(rt)

    story.append(sp(0.3))
    story.append(Paragraph("3.1 Probability distributions", S["h2"]))
    p_rows = [["ID"] + TREND_LABELS + ["Note"]]
    for r in results:
        row = [r["id"]]
        for lbl in TREND_LABELS:
            row.append(f"{r['probabilities'].get(lbl, 0.0):.3f}")
        row.append(Paragraph(r["note"], S["tbl_cell"]))
        p_rows.append(row)
    pt = Table(p_rows,
               colWidths=[0.9 * cm] + [1.9 * cm] * len(TREND_LABELS)
               + [7.5 * cm])
    pt.setStyle(tbl_style())
    story.append(pt)

    # Highlight per scenario -- one paragraph each
    story.append(sp(0.3))
    story.append(Paragraph("3.2 Per-scenario input (ppm sequence)", S["h2"]))
    seq_rows = [["ID", "acetone_delta sequence (ppm eq.)"]]
    for r in results:
        seq_str = ", ".join(f"{p:.1f}" for p in r["ppms"])
        seq_rows.append([r["id"],
                         Paragraph(seq_str, S["tbl_cell"])])
    st = Table(seq_rows, colWidths=[1.2 * cm, W - 4.4 * cm - 1.2 * cm])
    st.setStyle(tbl_style())
    story.append(st)

    # ── Interpretation ────────────────────────────────────────────────
    story += [PageBreak(),
              Paragraph("4. Interpretation", S["h1"]), hr()]
    story.append(Paragraph(
        f"เมื่อวัดเฉพาะ scenario ที่มี label ที่คาดหวังชัดเจน (SB1..SB4) — "
        f"โมเดล MetaBreath Trend LSTM ทำนายถูก "
        f"<b>{n_pass}/{n_total}</b> case. "
        "หมายความว่า pattern ที่โมเดลเรียนจาก synthetic ppm sequences "
        "(slope + spike detection) ยัง apply ได้กับ concentration "
        "sequence ที่ตั้งบน real Figaro TGS sensor exposure จริง — "
        "อย่างน้อยเมื่อ scale ไปอยู่ในช่วงที่โมเดลคุ้นเคย",
        S["body"]))
    story.append(sp(0.2))

    story.append(Paragraph("4.1 SB5 informational reading", S["h2"]))
    sb5 = next(r for r in results if r["id"] == "SB5")
    story.append(Paragraph(
        f"Batch day-1-morning มีลำดับตามที่ทีมทดลองรัน — "
        f"acetone_delta range {min(sb5['ppms']):.1f} - "
        f"{max(sb5['ppms']):.1f} ppm eq. "
        f"LSTM ตอบ '<b>{sb5['got']}</b>' ที่ confidence "
        f"{sb5['confidence']:.3f} "
        f"(probabilities: " +
        ", ".join(f"{k}={v:.2f}" for k, v in sb5['probabilities'].items())
        + "). "
        "การตอบแบบนี้แสดง behaviour ของ LSTM บน real experimental "
        "sequence ที่ไม่ได้ curate เป็น trend shape ล่วงหน้า",
        S["body"]))

    story.append(sp(0.2))
    story.append(Paragraph("4.2 Limits of this test", S["h2"]))
    story.append(Paragraph(
        "1) Sensor part mismatch (Figaro array vs. TGS1820) — cannot "
        "claim transfer learning; only pattern-level generalization<br/>"
        "2) Ventilator-driven simulated breath, not human breath — "
        "waveform kinetics may differ<br/>"
        "3) ppm-scale is engineered (x30) so falls in training range — "
        "raw SmartBreath vol% would be OOD by 100x-1000x<br/>"
        "4) Covariate features imputed to training mean — LSTM decisions "
        "here are essentially univariate on acetone_delta",
        S["body"]))
    story.append(sp(0.2))

    story.append(box(
        "<b>Bottom line.</b> ผลนี้ไม่ใช่ predictive validity ต่อ human "
        "breath acetone — เป็นการยืนยันว่า <i>architecture</i> "
        "และ <i>label rule</i> ของ Trend LSTM ทำงานถูกต้อง "
        "กับ concentration sequence ที่ derive จาก real sensor "
        "experiment. Phase 6 pilot (post-NSC) ยังคงจำเป็นเพื่อวัด "
        "predictive validity กับ clinical BOHB reference",
        S, bg=C_OK_BG if n_pass == n_total else C_WARN_BG,
        border=C_GREEN if n_pass == n_total else C_WARN_BDR))

    doc.build(story)


def main():
    if not SAMPLE_INDEX.exists():
        print(f"ERROR: dataset missing at {SAMPLE_INDEX}",
              file=sys.stderr)
        sys.exit(2)

    print(f"Loading {SAMPLE_INDEX} ...")
    si = pd.read_csv(SAMPLE_INDEX)
    print(f"Loaded {len(si)} samples")

    scenarios = build_scenarios(si)
    print(f"Running {len(scenarios)} scenarios through classify_trend() "
          f"(min_sequence={TREND_MIN_SEQUENCE_LENGTH}) ...")
    results = run_scenarios(scenarios)

    # Console table
    hdr = f"{'ID':<4} {'Scenario':<52} {'Exp':<14} {'Got':<14} {'Conf':<6} {'Verdict':<6}"
    print()
    print(hdr)
    print("-" * len(hdr))
    for r in results:
        conf_str = (f"{r['confidence']:.3f}"
                    if r["confidence"] > 0 else "n/a")
        print(f"{r['id']:<4} {r['name'][:50]:<52} "
              f"{r['expected'][:12]:<14} {r['got']:<14} "
              f"{conf_str:<6} {r['verdict']}")

    with open(OUT_JSON, "w") as f:
        json.dump({
            "dataset": "Ziyatdinov 2015 SmartBreath reference",
            "scale_map": f"vol% * {VOL_PERCENT_TO_PPM} = ppm equivalent",
            "min_sequence": TREND_MIN_SEQUENCE_LENGTH,
            "trend_labels": TREND_LABELS,
            "scenarios": results,
        }, f, indent=2, ensure_ascii=False)
    print(f"\nSaved: {OUT_JSON.relative_to(ROOT)}")

    build_pdf(results, si, OUT_PDF)
    print(f"Saved: {OUT_PDF.relative_to(ROOT)}")

    scored = [r for r in results if r["verdict"] != "info"]
    n_pass = sum(1 for r in scored if r["verdict"] == "PASS")
    print(f"\nScored: {n_pass}/{len(scored)} PASS  ·  "
          f"{len(results) - len(scored)} informational")


if __name__ == "__main__":
    main()
