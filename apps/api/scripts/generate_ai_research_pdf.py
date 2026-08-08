"""
Generate research-grade PDF: MetaBreath AI Pipeline Technical Report
Addresses NSC judge feedback: LSTM theoretical vs. trained distinction,
real data provenance, actual performance metrics.
"""
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os, sys

# ── Register Thai-capable fonts ──────────────────────────────────────────────
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
                print(f"Registered Thai font: {p}")
                break
            except Exception:
                pass
    if THAI_FONT:
        break

BASE_FONT = THAI_FONT if THAI_FONT else "Helvetica"
BASE_FONT_BOLD = THAI_FONT if THAI_FONT else "Helvetica-Bold"

# ── Color palette ─────────────────────────────────────────────────────────────
C_PRIMARY   = colors.HexColor("#1B4F72")   # dark navy
C_ACCENT    = colors.HexColor("#2E86C1")   # medium blue
C_LIGHT     = colors.HexColor("#D6EAF8")   # very light blue
C_GREEN     = colors.HexColor("#1E8449")
C_ORANGE    = colors.HexColor("#CA6F1E")
C_RED       = colors.HexColor("#922B21")
C_GREY      = colors.HexColor("#717D7E")
C_GREY_LITE = colors.HexColor("#F2F3F4")
C_WARNING   = colors.HexColor("#FDEBD0")
C_WARN_BDR  = colors.HexColor("#E59866")

W, H = A4

def build_styles():
    ss = getSampleStyleSheet()
    def S(name, fontName=None, **kw):
        fn = fontName if fontName else BASE_FONT
        return ParagraphStyle(name, fontName=fn, **kw)

    return {
        "cover_title": S("cover_title", fontName=BASE_FONT_BOLD, fontSize=20, leading=26,
                         textColor=C_PRIMARY, alignment=TA_CENTER),
        "cover_sub":   S("cover_sub",   fontSize=13, leading=18,
                         textColor=C_ACCENT,  alignment=TA_CENTER),
        "cover_meta":  S("cover_meta",  fontSize=10, leading=14,
                         textColor=C_GREY,    alignment=TA_CENTER),
        "h1":  S("h1", fontName=BASE_FONT_BOLD, fontSize=14, leading=20,
                 spaceBefore=16, spaceAfter=6, textColor=C_PRIMARY),
        "h2":  S("h2", fontName=BASE_FONT_BOLD, fontSize=12, leading=16,
                 spaceBefore=12, spaceAfter=4, textColor=C_ACCENT),
        "h3":  S("h3", fontSize=11, leading=14, spaceBefore=8, spaceAfter=3,
                 textColor=C_PRIMARY),
        "body": S("body", fontSize=10, leading=15, spaceAfter=4,
                  alignment=TA_JUSTIFY),
        "bullet": S("bullet", fontSize=10, leading=15, spaceAfter=3,
                    leftIndent=14, firstLineIndent=-10),
        "note":  S("note",  fontSize=9,  leading=13, textColor=C_GREY,
                   alignment=TA_JUSTIFY),
        "warn":  S("warn",  fontSize=10, leading=14, textColor=C_ORANGE),
        "code":  S("code",  fontName="Courier", fontSize=8, leading=12,
                   textColor=colors.HexColor("#2C3E50"), backColor=C_GREY_LITE,
                   leftIndent=8),
        "caption": S("caption", fontSize=9, leading=12, textColor=C_GREY,
                     alignment=TA_CENTER, spaceAfter=8),
        "tbl_hdr": S("tbl_hdr", fontName=BASE_FONT_BOLD, fontSize=9, leading=12,
                     textColor=colors.white, alignment=TA_CENTER),
        "tbl_cell":   S("tbl_cell",   fontSize=9, leading=12, alignment=TA_LEFT),
        "tbl_cell_c": S("tbl_cell_c", fontSize=9, leading=12, alignment=TA_CENTER),
        "good":  S("good",  fontName=BASE_FONT_BOLD, fontSize=9, leading=12,
                   textColor=C_GREEN, alignment=TA_CENTER),
        "bad":   S("bad",   fontName=BASE_FONT_BOLD, fontSize=9, leading=12,
                   textColor=C_RED,   alignment=TA_CENTER),
    }

def tbl_style(header_bg=C_PRIMARY, alt=True):
    base = [
        ("BACKGROUND", (0,0), (-1,0), header_bg),
        ("TEXTCOLOR",  (0,0), (-1,0), colors.white),
        ("FONTNAME",   (0,0), (-1,0), BASE_FONT_BOLD),
        ("FONTSIZE",   (0,0), (-1,0), 9),
        ("ALIGN",      (0,0), (-1,0), "CENTER"),
        ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
        ("FONTNAME",   (0,1), (-1,-1), BASE_FONT),
        ("FONTSIZE",   (0,1), (-1,-1), 9),
        ("ROWBACKGROUNDS", (0,1), (-1,-1),
         [C_GREY_LITE, colors.white] if alt else [colors.white]),
        ("GRID",  (0,0), (-1,-1), 0.4, C_GREY),
        ("TOPPADDING",    (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING",   (0,0), (-1,-1), 6),
        ("RIGHTPADDING",  (0,0), (-1,-1), 6),
    ]
    return TableStyle(base)

def hr(color=C_ACCENT, thickness=1):
    return HRFlowable(width="100%", thickness=thickness, color=color,
                      spaceBefore=4, spaceAfter=4)

def sp(h=0.3):
    return Spacer(1, h*cm)

def build_pdf(out_path: str):
    doc = SimpleDocTemplate(
        out_path,
        pagesize=A4,
        leftMargin=2.2*cm, rightMargin=2.2*cm,
        topMargin=2.2*cm,  bottomMargin=2.2*cm,
        title="MetaBreath AI Technical Report — NSC 2026",
        author="MetaBreath / MetaBreath Research Team",
    )

    S = build_styles()
    story = []

    # ═══════════════════════════════════════════════════════════════════
    # COVER PAGE
    # ═══════════════════════════════════════════════════════════════════
    story += [
        sp(2),
        Paragraph("MetaBreath AI Pipeline", S["cover_title"]),
        sp(0.3),
        Paragraph("Technical Research Report", S["cover_sub"]),
        sp(0.2),
        Paragraph("Breath-Acetone Metabolic Risk Classification System", S["cover_sub"]),
        sp(1.5),
        hr(C_PRIMARY, 2),
        sp(0.5),
        Paragraph("NSC 2026 — MetaBreath Health Platform", S["cover_meta"]),
        Paragraph("Version 1.0  |  Report Date: 2026-07-12", S["cover_meta"]),
        sp(0.3),
        Paragraph(
            "Status: Production Demo — Models Trained &amp; Deployed on FastAPI",
            ParagraphStyle("st", fontName=BASE_FONT_BOLD, fontSize=10,
                           textColor=C_GREEN, alignment=TA_CENTER)),
        sp(2),
    ]

    # Abstract box
    abs_data = [[
        Paragraph(
            "<b>Abstract</b><br/>"
            "This report documents the complete AI pipeline of the MetaBreath device — "
            "a breath-acetone metabolic risk monitoring system targeting diabetes management. "
            "Four machine learning models are described: Random Forest (RF), XGBoost (XGB), "
            "a two-layer LSTM classifier, and a sensor drift detector. "
            "All models are trained, serialised, and deployed as REST API endpoints. "
            "This document explicitly addresses the distinction between trained "
            "production models and components requiring future pilot data, "
            "and presents full training provenance, hyperparameters, and "
            "quantitative performance metrics.",
            S["body"])
    ]]
    abs_tbl = Table(abs_data, colWidths=[W - 4.4*cm])
    abs_tbl.setStyle(TableStyle([
        ("BOX",        (0,0), (-1,-1), 1.2, C_ACCENT),
        ("BACKGROUND", (0,0), (-1,-1), C_LIGHT),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
    ]))
    story.append(abs_tbl)
    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 1 — System Overview
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("1. System Overview", S["h1"]))
    story.append(hr())
    story.append(Paragraph(
        "The MetaBreath AI pipeline translates raw TGS1820 metal-oxide sensor "
        "readings from an ESP32 microcontroller into a clinically meaningful "
        "metabolic risk classification. The pipeline consists of four independent "
        "model components operating in a priority cascade, plus an LLM safety "
        "guardrail layer for the AI coaching interface.",
        S["body"]))
    story.append(sp())

    story.append(Paragraph("1.1 Architecture Overview", S["h2"]))
    arch_rows = [
        [Paragraph("<b>Layer</b>", S["tbl_hdr"]),
         Paragraph("<b>Component</b>", S["tbl_hdr"]),
         Paragraph("<b>Training Status</b>", S["tbl_hdr"]),
         Paragraph("<b>Input</b>", S["tbl_hdr"]),
         Paragraph("<b>Output</b>", S["tbl_hdr"])],
        [Paragraph("1", S["tbl_cell_c"]),
         Paragraph("Signal Processing Pipeline", S["tbl_cell"]),
         Paragraph("N/A (deterministic)", S["tbl_cell_c"]),
         Paragraph("Raw sensor voltage (V)", S["tbl_cell"]),
         Paragraph("Normalised 13 features", S["tbl_cell"])],
        [Paragraph("2A", S["tbl_cell_c"]),
         Paragraph("XGBoost Classifier", S["tbl_cell"]),
         Paragraph("TRAINED ✓", S["good"]),
         Paragraph("13-feature snapshot", S["tbl_cell"]),
         Paragraph("5-class label + confidence", S["tbl_cell"])],
        [Paragraph("2B", S["tbl_cell_c"]),
         Paragraph("Random Forest Classifier", S["tbl_cell"]),
         Paragraph("TRAINED ✓", S["good"]),
         Paragraph("13-feature snapshot", S["tbl_cell"]),
         Paragraph("5-class label + confidence", S["tbl_cell"])],
        [Paragraph("3", S["tbl_cell_c"]),
         Paragraph("LSTM Temporal Classifier", S["tbl_cell"]),
         Paragraph("TRAINED ✓*", S["good"]),
         Paragraph("Sequence of 5 readings × 8 features", S["tbl_cell"]),
         Paragraph("3-class → refined 5-class", S["tbl_cell"])],
        [Paragraph("4", S["tbl_cell_c"]),
         Paragraph("Drift Detector", S["tbl_cell"]),
         Paragraph("TRAINED ✓", S["good"]),
         Paragraph("Calibration history (ambient VOC)", S["tbl_cell"]),
         Paragraph("Drift %, severity, recommendation", S["tbl_cell"])],
        [Paragraph("5", S["tbl_cell_c"]),
         Paragraph("Anderson Rule-Based (fallback)", S["tbl_cell"]),
         Paragraph("Deterministic", S["tbl_cell_c"]),
         Paragraph("Acetone delta (ppm)", S["tbl_cell"]),
         Paragraph("5-class label", S["tbl_cell"])],
        [Paragraph("6", S["tbl_cell_c"]),
         Paragraph("LLM Safety Guardrail", S["tbl_cell"]),
         Paragraph("Regex + prompt eng.", S["tbl_cell_c"]),
         Paragraph("User / LLM message text", S["tbl_cell"]),
         Paragraph("Block/pass + disclaimer", S["tbl_cell"])],
    ]
    arch_tbl = Table(arch_rows, colWidths=[1.0*cm, 4.0*cm, 2.8*cm, 4.0*cm, 4.0*cm])
    arch_tbl.setStyle(tbl_style())
    story += [arch_tbl, sp(0.2),
              Paragraph("*LSTM trained on surrogate lab data; "
                        "real-world pilot data collection planned post-NSC.",
                        S["note"])]

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 2 — Training Data Provenance
    # ═══════════════════════════════════════════════════════════════════
    story.append(sp())
    story.append(Paragraph("2. Training Data Provenance", S["h1"]))
    story.append(hr())

    # --- Honesty warning box ---
    warn_data = [[Paragraph(
        "<b>Important Disclosure (Addressing Reviewer Feedback)</b><br/>"
        "The current training dataset does NOT contain breath samples measured "
        "with the MetaBreath device itself. Data sources are: "
        "(1) a synthetic demo dataset generated from Anderson 2015 clinical thresholds "
        "(primary RF/XGB training), "
        "(2) a Kaggle eNose dataset containing real breath measurements from 1,000 "
        "human subjects (545 diabetic, 455 normal) using TGS-family sensors — "
        "referenced for TGS family response alignment, and "
        "(3) UCI Gas Drift data for drift detector training. "
        "A controlled pilot study with MetaBreath hardware and real participants is "
        "the planned next phase. This limitation is explicitly stated to enable "
        "honest feasibility assessment.",
        S["warn"])]]
    warn_tbl = Table(warn_data, colWidths=[W - 4.4*cm])
    warn_tbl.setStyle(TableStyle([
        ("BOX",        (0,0), (-1,-1), 1.5, C_WARN_BDR),
        ("BACKGROUND", (0,0), (-1,-1), C_WARNING),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
    ]))
    story += [warn_tbl, sp()]

    story.append(Paragraph("2.1 Dataset Summary", S["h2"]))
    ds_rows = [
        [Paragraph("<b>Dataset</b>", S["tbl_hdr"]),
         Paragraph("<b>Source</b>", S["tbl_hdr"]),
         Paragraph("<b>Rows</b>", S["tbl_hdr"]),
         Paragraph("<b>License</b>", S["tbl_hdr"]),
         Paragraph("<b>Used For</b>", S["tbl_hdr"]),
         Paragraph("<b>Type</b>", S["tbl_hdr"])],
        [Paragraph("MetaBreath Demo", S["tbl_cell"]),
         Paragraph("NSC 2026 official synthetic dataset", S["tbl_cell"]),
         Paragraph("1,199", S["tbl_cell_c"]),
         Paragraph("NSC Internal", S["tbl_cell_c"]),
         Paragraph("RF / XGB primary training", S["tbl_cell"]),
         Paragraph("Synthetic", S["tbl_cell_c"])],
        [Paragraph("eNose Diseases (Kaggle)", S["tbl_cell"]),
         Paragraph("Muhammad Rizwan (Apache-2.0)", S["tbl_cell"]),
         Paragraph("1,000", S["tbl_cell_c"]),
         Paragraph("Apache-2.0", S["tbl_cell_c"]),
         Paragraph("Reference — TGS family response alignment (not merged in current pipeline)", S["tbl_cell"]),
         Paragraph("Human breath (545 diabetic / 455 normal)", S["tbl_cell_c"])],
        [Paragraph("UCI Gas Drift", S["tbl_cell"]),
         Paragraph("UCI ML Repo / Vergara (CC BY 4.0)", S["tbl_cell"]),
         Paragraph("13,910", S["tbl_cell_c"]),
         Paragraph("CC BY 4.0", S["tbl_cell_c"]),
         Paragraph("Drift Detector training (Acetone gas type 5)", S["tbl_cell"]),
         Paragraph("Lab gas", S["tbl_cell_c"])],
        [Paragraph("<b>Total</b>", S["tbl_cell"]),
         Paragraph("", S["tbl_cell"]),
         Paragraph("<b>16,109</b>", S["tbl_cell_c"]),
         Paragraph("", S["tbl_cell_c"]),
         Paragraph("", S["tbl_cell"]),
         Paragraph("", S["tbl_cell_c"])],
    ]
    ds_tbl = Table(ds_rows, colWidths=[3.2*cm, 4.2*cm, 1.4*cm, 1.8*cm, 3.8*cm, 1.5*cm])
    ds_tbl.setStyle(tbl_style())
    story += [ds_tbl, sp()]

    story.append(Paragraph("2.2 Label System — Anderson 2015 Five-Class", S["h2"]))
    story.append(Paragraph(
        "All models converge on the Anderson 2015 five-pattern breath-acetone "
        "classification (doi:10.1002/oby.21242). The threshold system provides "
        "a deterministic ground-truth label from any acetone-ppm measurement, "
        "enabling unified label mapping across heterogeneous datasets.",
        S["body"]))
    story.append(sp(0.3))

    label_rows = [
        [Paragraph("<b>Class</b>", S["tbl_hdr"]),
         Paragraph("<b>Acetone Range (ppm)</b>", S["tbl_hdr"]),
         Paragraph("<b>Clinical Meaning</b>", S["tbl_hdr"]),
         Paragraph("<b>Integer Index</b>", S["tbl_hdr"])],
        ["basal",           "0.5 – 2.0",  "Standard diet, basal ketosis",           "0"],
        ["light_ketosis",   "2.0 – 4.0",  "Mild caloric restriction",               "1"],
        ["nutritional_ketosis", "4.0 – 30.0", "HFLC/keto diet, BOHB 0.5–3 mM",    "2"],
        ["deep_ketosis",    "30.0 – 75.0", "Fasting / extended restriction",         "3"],
        ["dka_risk",        "≥ 75.0",      "DKA range — medical attention required", "4"],
    ]
    for i, row in enumerate(label_rows[1:], 1):
        label_rows[i] = [Paragraph(str(c), S["tbl_cell_c"] if j != 2 else S["tbl_cell"])
                         for j, c in enumerate(row)]
    lt = Table(label_rows, colWidths=[3.5*cm, 3.5*cm, 7.0*cm, 2.0*cm])
    lt.setStyle(tbl_style())
    story += [lt, sp(0.2),
              Paragraph("Source: Anderson JC. Obesity (2015) 23:2327–2334.", S["note"])]

    story.append(Paragraph("2.3 Baseline Construction", S["h2"]))
    story.append(Paragraph(
        "The sensor baseline (ambient VOC) is established at device boot via a "
        "10-second clean-air calibration cycle on the TGS1820 sensor. "
        "The acetone_delta feature is computed as:",
        S["body"]))
    story.append(Paragraph(
        "acetone_delta = (sensor_voltage − baseline_voltage) × gain + offset",
        S["code"]))
    story.append(Paragraph(
        "where gain and offset are per-device calibration coefficients stored in flash. "
        "Temperature and humidity compensation from SHT31 sensor is applied as:",
        S["body"]))
    story.append(Paragraph(
        "VOC_comp = VOC_raw / [(1 + 0.015·ΔT) × (1 + 0.008·ΔH)]",
        S["code"]))
    story.append(Paragraph(
        "where ΔT = T − 20°C and ΔH = H − 65%RH (TGS1820 datasheet coefficients). "
        "In the training datasets, baseline is treated as the minimum VOC reading "
        "over the first 3 calibration epochs per session.",
        S["body"]))
    story.append(sp(0.2))
    story.append(Paragraph("2.4 Train/Test Split", S["h2"]))

    split_rows = [
        [Paragraph("<b>Model</b>", S["tbl_hdr"]),
         Paragraph("<b>Total Rows</b>", S["tbl_hdr"]),
         Paragraph("<b>Train</b>", S["tbl_hdr"]),
         Paragraph("<b>Test</b>", S["tbl_hdr"]),
         Paragraph("<b>Split Method</b>", S["tbl_hdr"]),
         Paragraph("<b>Stratified</b>", S["tbl_hdr"])],
        ["RF / XGB", "2,199", "1,759 (80%)", "440 (20%)", "train_test_split, seed=42", "Yes"],
        ["LSTM Classifier", "2,199*", "~1,870 (85%)", "~330 (15%)", "train_test_split, seed=42", "Yes"],
        ["Drift Detector", "3,009 (acetone rows)", "~2,407 (80%)", "~602 (20%)", "batch-aware split", "N/A"],
    ]
    for i, row in enumerate(split_rows[1:], 1):
        split_rows[i] = [Paragraph(str(c), S["tbl_cell_c"]) for c in row]
    spt = Table(split_rows, colWidths=[3.0*cm, 2.0*cm, 2.5*cm, 2.0*cm, 4.0*cm, 2.0*cm])
    spt.setStyle(tbl_style())
    story += [spt, sp(0.2),
              Paragraph("*LSTM uses same merged dataset; sequences are constructed with a 5-reading sliding window.",
                        S["note"])]

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 3 — Model Specifications
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("3. Model Specifications", S["h1"]))
    story.append(hr())

    # 3.1 Random Forest
    story.append(Paragraph("3.1 Random Forest Classifier", S["h2"]))
    rf_rows = [
        [Paragraph("<b>Hyperparameter</b>", S["tbl_hdr"]),
         Paragraph("<b>Value</b>", S["tbl_hdr"]),
         Paragraph("<b>Rationale</b>", S["tbl_hdr"])],
        ["n_estimators", "200", "Balance bias-variance; avoids overfitting small dataset"],
        ["max_depth", "8", "Constrain tree depth to prevent memorisation"],
        ["min_samples_leaf", "5", "Minimum 5 samples per leaf for generalisation"],
        ["class_weight", "'balanced'", "Compensate class imbalance across 5-class output"],
        ["random_state", "42", "Reproducibility"],
        ["n_jobs", "-1", "All CPU cores for parallel tree training"],
    ]
    for i, row in enumerate(rf_rows[1:], 1):
        rf_rows[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    rft = Table(rf_rows, colWidths=[3.5*cm, 2.5*cm, 9.8*cm])
    rft.setStyle(tbl_style())
    story += [rft, sp()]

    # 3.2 XGBoost
    story.append(Paragraph("3.2 XGBoost Classifier (Optuna-tuned)", S["h2"]))
    story.append(Paragraph(
        "XGBoost hyperparameters were found via Optuna Bayesian optimisation "
        "over 50 trials (5-fold CV F1-weighted objective, timeout 300s).",
        S["body"]))
    story.append(sp(0.2))
    xgb_rows = [
        [Paragraph("<b>Hyperparameter</b>", S["tbl_hdr"]),
         Paragraph("<b>Search Space</b>", S["tbl_hdr"]),
         Paragraph("<b>Best Value Found</b>", S["tbl_hdr"])],
        ["n_estimators",     "100 – 500",             "Optuna-selected"],
        ["max_depth",        "3 – 10",                "Optuna-selected"],
        ["learning_rate",    "0.01 – 0.30 (log)",     "Optuna-selected"],
        ["subsample",        "0.5 – 1.0",             "Optuna-selected"],
        ["colsample_bytree", "0.5 – 1.0",             "Optuna-selected"],
        ["reg_alpha",        "1e-4 – 10.0 (log)",     "Optuna-selected"],
        ["reg_lambda",       "1e-4 – 10.0 (log)",     "Optuna-selected"],
        ["scale_pos_weight", "class freq. ratio",      "Auto from training labels"],
        ["eval_metric",      "—",                      "logloss"],
        ["random_state",     "—",                      "42"],
        ["Optuna trials",    "—",                      "50 (timeout 300 s)"],
        ["CV strategy",      "—",                      "5-fold, stratified, F1-weighted"],
    ]
    for i, row in enumerate(xgb_rows[1:], 1):
        xgb_rows[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    xgbt = Table(xgb_rows, colWidths=[4.0*cm, 4.5*cm, 7.3*cm])
    xgbt.setStyle(tbl_style())
    story += [xgbt, sp()]

    # 3.3 LSTM
    story.append(Paragraph("3.3 LSTM Temporal Classifier", S["h2"]))

    # Status banner
    lstm_warn = [[Paragraph(
        "<b>LSTM Training Status: TRAINED (surrogate data) — Pilot Data Required</b><br/>"
        "The LSTM model file (lstm_model.pt) is trained and deployed in production. "
        "However, training used lab-controlled surrogate data, not breath samples from "
        "real patients. The model classifies 5-reading sequences correctly for "
        "stable low/high patterns (F1=0.9722, val_acc=0.9565) but shows weakness "
        "in detecting ramping/transitional sequences — a known limitation from the "
        "absence of real-world transition-pattern training examples.",
        S["warn"])]]
    lstm_warn_tbl = Table(lstm_warn, colWidths=[W - 4.4*cm])
    lstm_warn_tbl.setStyle(TableStyle([
        ("BOX",        (0,0), (-1,-1), 1.5, C_WARN_BDR),
        ("BACKGROUND", (0,0), (-1,-1), C_WARNING),
        ("TOPPADDING",    (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
    ]))
    story += [lstm_warn_tbl, sp(0.4)]

    story.append(Paragraph("3.3.1 Architecture (PyTorch)", S["h3"]))
    lstm_arch = [
        [Paragraph("<b>Layer</b>", S["tbl_hdr"]),
         Paragraph("<b>Type</b>", S["tbl_hdr"]),
         Paragraph("<b>Configuration</b>", S["tbl_hdr"])],
        ["Input", "—", "Shape (batch, 5, 8) — 5 readings × 8 features"],
        ["Layer 1", "LSTM", "input_size=8, hidden_size=64, batch_first=True"],
        ["Dropout 1", "Dropout", "p=0.30"],
        ["Layer 2", "LSTM", "input_size=64, hidden_size=32, batch_first=True"],
        ["Dropout 2", "Dropout", "p=0.30 (applied to last time-step only)"],
        ["FC 1", "Linear", "in=32, out=16"],
        ["Activation", "ReLU", "—"],
        ["FC 2 (output)", "Linear", "in=16, out=3 (low / moderate / high)"],
        ["Total parameters", "—", "~37,000 trainable parameters"],
    ]
    for i, row in enumerate(lstm_arch[1:], 1):
        lstm_arch[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    lat = Table(lstm_arch, colWidths=[2.5*cm, 2.5*cm, 10.8*cm])
    lat.setStyle(tbl_style())
    story += [lat, sp(0.3)]

    story.append(Paragraph("3.3.2 Training Configuration", S["h3"]))
    lstm_cfg = [
        [Paragraph("<b>Parameter</b>", S["tbl_hdr"]),
         Paragraph("<b>Value</b>", S["tbl_hdr"]),
         Paragraph("<b>Notes</b>", S["tbl_hdr"])],
        ["Loss function", "CrossEntropyLoss", "3-class: low / moderate / high"],
        ["Optimiser", "Adam", "lr=1e-3, default β₁=0.9, β₂=0.999"],
        ["Epochs", "100 (max)", "EarlyStopping: patience=10, restore_best=True"],
        ["Batch size", "64", "—"],
        ["LR scheduler", "ReduceLROnPlateau", "factor=0.5, patience=5"],
        ["Validation split", "15%", "Random split from training set, seed=42"],
        ["Input features (8)", "acetone_delta, quality_score, reliability_score, ketosis_index,\n"
                               "metabolic_score, pressure_mean, temperature, humidity", ""],
        ["Preprocessing", "StandardScaler", "Fit on training split; saved as scaler_lstm_mean.npy + scale.npy"],
        ["Sequence length", "5 readings", "Minimum 5 to invoke LSTM; <5 falls back to XGBoost"],
        ["Class mapping", "0=low, 1=moderate, 2=high", "Refined post-hoc to 5-class via Anderson threshold"],
        ["Framework", "PyTorch", "Model saved as lstm_model.pt"],
    ]
    for i, row in enumerate(lstm_cfg[1:], 1):
        lstm_cfg[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    lct = Table(lstm_cfg, colWidths=[3.2*cm, 4.2*cm, 8.4*cm])
    lct.setStyle(tbl_style())
    story += [lct, sp(0.3)]

    story.append(Paragraph("3.3.3 LSTM Feature Details", S["h3"]))
    feat_rows = [
        [Paragraph("<b>Feature</b>", S["tbl_hdr"]),
         Paragraph("<b>Source</b>", S["tbl_hdr"]),
         Paragraph("<b>Unit</b>", S["tbl_hdr"]),
         Paragraph("<b>Description</b>", S["tbl_hdr"])],
        ["acetone_delta", "TGS1820 + calibration", "ppm", "Primary metabolic signal; baseline-subtracted VOC"],
        ["quality_score", "Signal processing", "0–100", "Reading quality from voltage, pressure, env. conditions"],
        ["reliability_score", "Signal processing", "0–100", "Combines quality, drift, and calibration age"],
        ["ketosis_index", "Derived", "0–1", "Normalised ketosis proximity score"],
        ["metabolic_score", "Derived", "0–100", "Composite metabolic activity score"],
        ["pressure_mean", "XGZP6847A", "kPa", "Mean breath differential pressure during measurement"],
        ["temperature", "SHT31", "°C", "Ambient temperature for compensation"],
        ["humidity", "SHT31", "%RH", "Ambient humidity for compensation"],
    ]
    for i, row in enumerate(feat_rows[1:], 1):
        feat_rows[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    ftt = Table(feat_rows, colWidths=[2.8*cm, 3.0*cm, 1.5*cm, 8.5*cm])
    ftt.setStyle(tbl_style())
    story += [ftt, sp()]

    # 3.4 Drift Detector
    story.append(Paragraph("3.4 Sensor Drift Detector", S["h2"]))
    story.append(Paragraph(
        "The drift detector quantifies sensor calibration degradation over time. "
        "It operates in parallel with the risk classifier and provides recalibration "
        "recommendations. The primary mechanism compares recent ambient VOC readings "
        "against a 3-reading baseline established at first calibration.",
        S["body"]))
    story.append(sp(0.2))
    drift_rows = [
        [Paragraph("<b>Drift %</b>", S["tbl_hdr"]),
         Paragraph("<b>Severity</b>", S["tbl_hdr"]),
         Paragraph("<b>Recommendation</b>", S["tbl_hdr"]),
         Paragraph("<b>Training Data Source</b>", S["tbl_hdr"])],
        ["< 10%", "none", "ok", "UCI Gas Drift — Acetone (batch 1–10)"],
        ["10% – 25%", "mild", "recalibrate_soon", "UCI Gas Drift — batch 7–8 degradation pattern"],
        ["> 25%", "severe", "recalibrate_now", "UCI Gas Drift — batch 9–10 degradation pattern"],
    ]
    for i, row in enumerate(drift_rows[1:], 1):
        drift_rows[i] = [Paragraph(str(c), S["tbl_cell_c"] if j != 3 else S["tbl_cell"])
                         for j, c in enumerate(row)]
    drt = Table(drift_rows, colWidths=[2.5*cm, 2.5*cm, 3.5*cm, 7.3*cm])
    drt.setStyle(tbl_style())
    story += [drt, sp()]

    # ─── 3.5 LSTM Trend Classifier (Phase 3) ────────────────────────────────
    story.append(Paragraph("3.5 LSTM Trend Classifier (Phase 3 Redesign)", S["h2"]))

    trend_intro = [[Paragraph(
        "<b>Phase 3 Redesign — LSTM as Trend Classifier</b><br/>"
        "The legacy per-reading LSTM (§3.3) duplicated the RF/XGB Anderson rule "
        "and shared the same label-feature circularity (L9). Phase 3 reframes the "
        "LSTM's task to what a temporal model is uniquely suited for: classifying "
        "the <b>direction of the user's own baseline over time</b>, not a "
        "per-reading class. Output is 4-class softmax "
        "<i>[stable, increasing, decreasing, abnormal]</i>. Labels are derived "
        "from an OLS slope + spike-vs-median rule applied to the whole sequence "
        "(<i>app/services/trend_label.py</i>), so no single input feature is a "
        "deterministic function of the label — breaking the circularity that "
        "still applies to §3.3.",
        S["warn"])]]
    trend_intro_tbl = Table(trend_intro, colWidths=[W - 4.4*cm])
    trend_intro_tbl.setStyle(TableStyle([
        ("BOX",        (0,0), (-1,-1), 1.5, C_WARN_BDR),
        ("BACKGROUND", (0,0), (-1,-1), C_WARNING),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
    ]))
    story += [trend_intro_tbl, sp(0.3)]

    story.append(Paragraph("3.5.1 Architecture (PyTorch)", S["h3"]))
    trend_arch = [
        [Paragraph("<b>Layer</b>", S["tbl_hdr"]),
         Paragraph("<b>Type</b>", S["tbl_hdr"]),
         Paragraph("<b>Configuration</b>", S["tbl_hdr"])],
        ["Input", "—", "Shape (batch, L, 8) — L ∈ {7, 14, 30}"],
        ["Layer 1", "LSTM", "input_size=8, hidden_size=64, batch_first=True"],
        ["Dropout 1", "Dropout", "p=0.30"],
        ["Layer 2", "LSTM", "input_size=64, hidden_size=32, batch_first=True"],
        ["Dropout 2", "Dropout", "p=0.30 (last time-step only)"],
        ["FC 1", "Linear + ReLU", "in=32, out=16"],
        ["FC 2 (output)", "Linear", "in=16, out=4 (stable / increasing / decreasing / abnormal)"],
        ["Total parameters", "—", "~38,000 trainable parameters"],
    ]
    for i, row in enumerate(trend_arch[1:], 1):
        trend_arch[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    tat = Table(trend_arch, colWidths=[2.5*cm, 2.5*cm, 10.8*cm])
    tat.setStyle(tbl_style())
    story += [tat, sp(0.3)]

    story.append(Paragraph("3.5.2 Training Configuration", S["h3"]))
    trend_cfg = [
        [Paragraph("<b>Parameter</b>", S["tbl_hdr"]),
         Paragraph("<b>Value</b>", S["tbl_hdr"]),
         Paragraph("<b>Notes</b>", S["tbl_hdr"])],
        ["Loss function", "CrossEntropyLoss", "4-class trend"],
        ["Optimiser", "Adam", "lr=1e-3, β₁=0.9, β₂=0.999"],
        ["LR scheduler", "ReduceLROnPlateau", "factor=0.5, patience=5"],
        ["Batch size", "16", "—"],
        ["Epochs", "150 max", "EarlyStopping patience=15 on val_loss"],
        ["Input features (8)",
         "ΔVOC, pressure_mean, pressure_std, breath_duration, temperature, "
         "humidity, quality_score, reliability_score", ""],
        ["Preprocessing", "StandardScaler", "fit on TRAIN patients only"],
        ["Sequence length", "14 sessions (min 7)", "runtime accepts 7–30; <7 → insufficient_data"],
        ["Label rule",
         "OLS slope + max-jump / median-jump ratio",
         "slope>0.30 → increasing; slope<−0.30 → decreasing; "
         "abs jump>4 ppm and >3× median → abnormal; else stable"],
        ["Framework", "PyTorch", "saved as lstm_trend.pt"],
    ]
    for i, row in enumerate(trend_cfg[1:], 1):
        trend_cfg[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    tct = Table(trend_cfg, colWidths=[3.2*cm, 4.2*cm, 8.4*cm])
    tct.setStyle(tbl_style())
    story += [tct, sp(0.3)]

    story.append(Paragraph("3.5.3 Validation Strategy — Participant-wise Split", S["h3"]))
    story.append(Paragraph(
        "Training patients and validation patients are DISJOINT sets — "
        "80/20 stratified split by <i>patient_id</i>. This differs from the "
        "random within-patient split used by §3.3 and prevents the model from "
        "memorising per-person quirks and reporting them as generalisation. "
        "Synthetic dataset: 100 virtual patients × 14 sessions/patient = 1,400 rows "
        "(balanced 25/25/25/25 across trend classes). See <i>plan.md §5.3</i> for "
        "the generation rules and <i>tests/test_lstm_trend_inference.py</i> for "
        "canonical-pattern assertions.",
        S["body"]))
    story.append(sp())

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 4 — Performance Metrics
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("4. Model Performance Metrics", S["h1"]))
    story.append(hr())
    story.append(Paragraph(
        "The following metrics are from training runs on the merged surrogate dataset. "
        "Metrics represent model performance on the held-out test split (20% / 15% depending on model). "
        "Cross-validation (CV) scores reflect 5-fold stratified CV on the training split only.",
        S["body"]))
    story.append(sp(0.3))

    # --- Interpretation Note (label-feature circularity disclosure) ---
    interp_data = [[Paragraph(
        "<b>Interpretation Note — Rule-Verification vs. Predictive Validity</b><br/>"
        "Training labels are derived by applying the Anderson 2015 threshold rule "
        "directly to <i>acetone_delta</i>, which is itself one of the model input "
        "features. Two RF/XGB variants are therefore trained and reported side-by-side: "
        "(a) a <b>verification variant</b> that keeps all 13 features and measures how "
        "reliably the classifier reproduces the Anderson rule under sensor noise; "
        "and (b) a <b>predictive variant</b> in which <i>acetone_delta</i> and its "
        "three derived features (<i>ketosis_index</i>, <i>metabolic_score</i>, "
        "<i>fat_burning_index</i>) are removed, so no feature is a function of the "
        "label. On the current synthetic dataset the verification variant scores 0.99 "
        "and the predictive variant collapses to 0.40 — essentially the stratified "
        "chance baseline of 0.3783 — which precisely quantifies the label-feature "
        "circularity. Independent predictive validity can only be established after "
        "retraining with a label that is not a function of <i>acetone_delta</i>, "
        "such as blood BOHB / GC-MS collected during the pilot phase (Section 7, L9).",
        S["warn"])]]
    interp_tbl = Table(interp_data, colWidths=[W - 4.4*cm])
    interp_tbl.setStyle(TableStyle([
        ("BOX",        (0,0), (-1,-1), 1.5, C_WARN_BDR),
        ("BACKGROUND", (0,0), (-1,-1), C_WARNING),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 12),
        ("RIGHTPADDING",  (0,0), (-1,-1), 12),
    ]))
    story += [interp_tbl, sp()]

    story.append(Paragraph("4.1 Summary Performance Table", S["h2"]))
    perf_rows = [
        [Paragraph("<b>Model</b>", S["tbl_hdr"]),
         Paragraph("<b>Variant</b>", S["tbl_hdr"]),
         Paragraph("<b>Test Accuracy</b>", S["tbl_hdr"]),
         Paragraph("<b>F1-weighted (test)</b>", S["tbl_hdr"]),
         Paragraph("<b>CV F1 Mean ± SD</b>", S["tbl_hdr"]),
         Paragraph("<b>n_train</b>", S["tbl_hdr"]),
         Paragraph("<b>n_test</b>", S["tbl_hdr"])],
        ["Random Forest",  "verification (13 feat.)", "0.9917", "0.9917", "0.9907 ± 0.0063", "959", "240"],
        ["XGBoost",        "verification (13 feat.)", "0.9917", "0.9903", "0.9926 ± 0.0061", "959", "240"],
        ["Random Forest",  "predictive (9 feat.)",    "0.3958", "0.3969", "0.3725 ± 0.0456", "959", "240"],
        ["XGBoost",        "predictive (9 feat.)",    "0.4333", "0.3737", "0.3848 ± 0.0043", "959", "240"],
        ["Chance baseline", "stratified 5-class",     "0.3783", "—",      "—",               "—",   "240"],
        ["LSTM (legacy)",  "per-reading 3-class",     "0.9722", "0.9722", "val_acc = 0.9565 *", "~1,870", "~330"],
        ["LSTM Trend",     "4-class trend (Phase 3)", "0.9500", "0.9495", "val (participant) *", "80 pt", "20 pt"],
        ["Drift Detector", "drift",                   "0.9850", "0.9850", "0.8418 *",          "~2,407", "~602"],
    ]
    for i, row in enumerate(perf_rows[1:], 1):
        perf_rows[i] = [Paragraph(str(c), S["tbl_cell_c"]) for c in row]
    pt = Table(perf_rows,
               colWidths=[3.0*cm, 3.5*cm, 2.2*cm, 2.5*cm, 3.2*cm, 1.4*cm, 1.4*cm])
    pt.setStyle(tbl_style())
    # Row-level accents: verification (yellow tint), predictive (green tint),
    # chance baseline (grey), LSTM (light blue)
    pt.setStyle(TableStyle([
        ("BACKGROUND", (0,1), (-1,2), colors.HexColor("#FEF9E7")),  # verification rows
        ("BACKGROUND", (0,3), (-1,4), colors.HexColor("#EAF7EE")),  # predictive rows
        ("BACKGROUND", (0,5), (-1,5), colors.HexColor("#F2F3F4")),  # chance baseline
        ("BACKGROUND", (0,6), (-1,6), colors.HexColor("#EAF2F8")),  # LSTM legacy
        ("BACKGROUND", (0,7), (-1,7), colors.HexColor("#E8DAEF")),  # LSTM trend (Phase 3)
    ]))
    story += [pt, sp(0.2),
              Paragraph(
                  "<b>Reading this table.</b> Verification-variant metrics quantify how "
                  "reliably the deployed classifier reproduces the Anderson threshold rule "
                  "given noisy inputs; they are not evidence of independent predictive "
                  "validity (see Interpretation Note above and L9 in Section 7.1). "
                  "Predictive-variant metrics remove <i>acetone_delta</i>, <i>ketosis_index</i>, "
                  "<i>metabolic_score</i>, and <i>fat_burning_index</i> — the four features "
                  "that are either the label source or deterministic functions of it — and "
                  "measure whether the remaining sensor/environment features carry any "
                  "independent signal for Anderson classes. Predictive-variant accuracy "
                  "(0.40–0.43) sits at the stratified chance baseline (0.3783), which is the "
                  "expected outcome on the current synthetic dataset and quantifies exactly "
                  "how much of the verification-variant score is attributable to circularity. "
                  "* LSTM CV = validation-set accuracy (15% split), not 5-fold CV. "
                  "Drift detector CV = held-out batch performance.",
                  S["note"]),
              sp()]

    story.append(Paragraph("4.2 LSTM Temporal Test Scenarios (System-Level)", S["h2"]))
    story.append(Paragraph(
        "In addition to model-level metrics, the full pipeline was tested through "
        "15 simulation scenarios covering clinical edge cases:",
        S["body"]))
    story.append(sp(0.2))

    lstm_test_rows = [
        [Paragraph("<b>Scenario</b>", S["tbl_hdr"]),
         Paragraph("<b>Input Sequence</b>", S["tbl_hdr"]),
         Paragraph("<b>Expected</b>", S["tbl_hdr"]),
         Paragraph("<b>Got</b>", S["tbl_hdr"]),
         Paragraph("<b>Confidence</b>", S["tbl_hdr"]),
         Paragraph("<b>Result</b>", S["tbl_hdr"])],
        # Legacy per-reading LSTM (kept for continuity of the report; the
        # ramping FAIL that motivated Phase 3 is preserved here)
        ["Legacy — stable healthy (5 days)", "0.5–0.9 ppm", "low", "low", "0.999", "PASS"],
        ["Legacy — ramping into ketosis", "2→40 ppm", "not low", "low", "0.630", "FAIL †"],
        ["Legacy — consistently high risk", "80–100 ppm", "high", "high", "1.000", "PASS"],
        ["Legacy — short sequence (2)", "<5 readings", "fallback", "xgb_fallback", "—", "PASS"],
        # Phase 3 — Trend LSTM re-tested on the same canonical scenarios
        ["Trend — stable 14 days", "0.5–2 ppm × 14", "stable", "stable", "0.952", "PASS"],
        ["Trend — ramping 2→41 ppm", "2 + 3·t × 14", "increasing", "increasing", "0.950", "PASS ‡"],
        ["Trend — decreasing 28→2 ppm", "28 − 2·t × 14", "decreasing", "decreasing", "0.709", "PASS"],
        ["Trend — spike at day 7 (+15)", "stable + 1 spike", "abnormal", "abnormal", "0.885", "PASS"],
        ["Trend — short sequence (5)", "<7 sessions", "insufficient_data", "insufficient_data", "—", "PASS"],
    ]
    for i, row in enumerate(lstm_test_rows[1:], 1):
        cells = []
        for j, c in enumerate(row):
            if j == 5:
                style = S["good"] if c == "PASS" else S["bad"]
            else:
                style = S["tbl_cell_c"]
            cells.append(Paragraph(str(c), style))
        lstm_test_rows[i] = cells
    ltt = Table(lstm_test_rows, colWidths=[3.5*cm, 3.0*cm, 2.0*cm, 2.0*cm, 2.5*cm, 2.8*cm])
    ltt.setStyle(tbl_style())
    story += [ltt, sp(0.2),
              Paragraph(
                  "† FAIL preserved for transparency: the legacy per-reading LSTM "
                  "classified a ramping 2→40 ppm sequence as 'low' because its "
                  "training data lacked gradual-transition examples. "
                  "‡ RESOLVED in Phase 3: the new Trend LSTM (Section 3.5) reframes "
                  "the LSTM's task from per-reading classification to 4-class trend "
                  "detection over a 7–30 session window; the same ramp is now "
                  "correctly labelled 'increasing' at confidence 0.95. Limitation "
                  "L4 (Section 7.1) is therefore addressed.",
                  S["note"]),
              sp()]

    story.append(Paragraph("4.3 Full Pipeline Simulation (5-Day Patient)", S["h2"]))
    sim_rows = [
        [Paragraph("<b>Day</b>", S["tbl_hdr"]),
         Paragraph("<b>Acetone (ppm)</b>", S["tbl_hdr"]),
         Paragraph("<b>Anderson Label</b>", S["tbl_hdr"]),
         Paragraph("<b>XGBoost</b>", S["tbl_hdr"]),
         Paragraph("<b>LSTM</b>", S["tbl_hdr"]),
         Paragraph("<b>Confidence</b>", S["tbl_hdr"]),
         Paragraph("<b>Match?</b>", S["tbl_hdr"])],
        ["0", "0.6",  "basal", "low", "low", "1.000", "YES"],
        ["1", "2.5",  "light_ketosis", "low", "low", "1.000", "YES"],
        ["2", "8.0",  "nutritional_ketosis", "low", "low", "1.000", "YES"],
        ["3", "25.0", "nutritional_ketosis", "low", "low", "1.000", "YES"],
        ["4", "55.0", "deep_ketosis", "moderate", "moderate", "1.000", "YES"],
    ]
    for i, row in enumerate(sim_rows[1:], 1):
        sim_rows[i] = [Paragraph(str(c), S["tbl_cell_c"]) for c in row]
    simt = Table(sim_rows, colWidths=[1.2*cm, 2.8*cm, 3.8*cm, 2.2*cm, 2.2*cm, 2.5*cm, 1.8*cm])
    simt.setStyle(tbl_style())
    story += [simt, sp(0.2),
              Paragraph("XGBoost and LSTM predictions matched 5/5 days. "
                        "Note: 3-class LSTM output maps to different labels than 5-class Anderson — "
                        "both 'low' values here represent labels in the 0–30 ppm Anderson range.",
                        S["note"])]

    story.append(Paragraph("4.4 Drift Detection Performance", S["h2"]))
    drift_perf_rows = [
        [Paragraph("<b>Scenario</b>", S["tbl_hdr"]),
         Paragraph("<b>Drift %</b>", S["tbl_hdr"]),
         Paragraph("<b>Expected Severity</b>", S["tbl_hdr"]),
         Paragraph("<b>Got</b>", S["tbl_hdr"]),
         Paragraph("<b>Result</b>", S["tbl_hdr"])],
        ["Stable sensor",         "0.23%",  "none",              "none",              "PASS"],
        ["Mild drift (+15%)",     "15.12%", "mild",              "mild",              "PASS"],
        ["Severe drift (+40%)",   "44.19%", "severe",            "severe",            "PASS"],
        ["Insufficient data (1)", "—",      "insufficient_data", "insufficient_data", "PASS"],
    ]
    for i, row in enumerate(drift_perf_rows[1:], 1):
        cells = []
        for j, c in enumerate(row):
            if j == 4:
                style = S["good"]
            else:
                style = S["tbl_cell_c"]
            cells.append(Paragraph(str(c), style))
        drift_perf_rows[i] = cells
    dprt = Table(drift_perf_rows, colWidths=[3.5*cm, 2.5*cm, 3.5*cm, 3.5*cm, 2.8*cm])
    dprt.setStyle(tbl_style())
    story += [dprt]

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 5 — 13 Features Details
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("5. Feature Engineering (13 Features for RF/XGB)", S["h1"]))
    story.append(hr())
    story.append(Paragraph(
        "Features marked ● in the last column are excluded from the "
        "<b>predictive variant</b> (§4.1). These four are either the label source "
        "(<i>acetone_delta</i>) or deterministic functions of it "
        "(<i>ketosis_index</i>, <i>metabolic_score</i>, <i>fat_burning_index</i>); "
        "keeping them creates label–feature circularity (see §7.1 L9).",
        S["body"]))
    story.append(sp(0.2))

    feat13_rows = [
        [Paragraph("<b>#</b>", S["tbl_hdr"]),
         Paragraph("<b>Feature Name</b>", S["tbl_hdr"]),
         Paragraph("<b>Sensor / Origin</b>", S["tbl_hdr"]),
         Paragraph("<b>Unit</b>", S["tbl_hdr"]),
         Paragraph("<b>Description</b>", S["tbl_hdr"]),
         Paragraph("<b>Missing</b>", S["tbl_hdr"]),
         Paragraph("<b>Leaky</b>", S["tbl_hdr"])],
        ["1",  "acetone_delta",       "TGS1820",          "ppm",   "Primary signal: baseline-subtracted VOC, env-compensated", "Default 0",   "●"],
        ["2",  "quality_score",       "Signal processing","0–100", "Composite reading quality (voltage, pressure, env.)",       "Default 100", ""],
        ["3",  "reliability_score",   "Signal processing","0–100", "Quality + drift penalty + calibration age",                "Default 100", ""],
        ["4",  "ambient_voc",         "TGS1820 (clean air)","ppm","Baseline ambient VOC (calibrated pre-measurement)",        "Default 0",   ""],
        ["5",  "pressure_mean",       "XGZP6847A",        "kPa",   "Mean breath differential pressure",                       "Default 0",   ""],
        ["6",  "pressure_std",        "XGZP6847A",        "kPa",   "Std dev of breath pressure (effort consistency)",         "Default 0",   ""],
        ["7",  "breath_duration",     "Firmware timer",   "s",     "Duration of breath measurement cycle",                    "Default 3",   ""],
        ["8",  "temperature",         "SHT31",            "°C",    "Ambient temperature",                                     "Default 20",  ""],
        ["9",  "humidity",            "SHT31",            "%RH",   "Ambient relative humidity",                               "Default 65",  ""],
        ["10", "environment_penalty", "Derived",          "0–50",  "Distance from ideal env. (20°C, 65%RH)",                  "Computed",    ""],
        ["11", "ketosis_index",       "Derived",          "0–1",   "Normalised proximity to nutritional ketosis zone",        "Default 0",   "●"],
        ["12", "metabolic_score",     "Derived",          "0–100", "Composite from acetone + quality + context",              "Default 0",   "●"],
        ["13", "fat_burning_index",   "Derived",          "0–1",   "Estimated fat-oxidation intensity from acetone delta",    "Default 0",   "●"],
    ]
    for i, row in enumerate(feat13_rows[1:], 1):
        feat13_rows[i] = [Paragraph(str(c), S["tbl_cell_c"] if j in (0, 3, 6) else S["tbl_cell"])
                          for j, c in enumerate(row)]
    f13t = Table(feat13_rows,
                 colWidths=[0.6*cm, 2.8*cm, 2.6*cm, 1.2*cm, 5.2*cm, 1.7*cm, 1.2*cm])
    f13t.setStyle(tbl_style())
    # Highlight leaky-feature rows in a light red tint (rows 1, 11, 12, 13 in the data)
    f13t.setStyle(TableStyle([
        ("BACKGROUND", (0, 1),  (-1, 1),  colors.HexColor("#FDEDEC")),  # acetone_delta
        ("BACKGROUND", (0, 11), (-1, 11), colors.HexColor("#FDEDEC")),  # ketosis_index
        ("BACKGROUND", (0, 12), (-1, 12), colors.HexColor("#FDEDEC")),  # metabolic_score
        ("BACKGROUND", (0, 13), (-1, 13), colors.HexColor("#FDEDEC")),  # fat_burning_index
    ]))
    story += [f13t]

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 6 — Inference Priority Cascade
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("6. Inference Priority Cascade", S["h1"]))
    story.append(hr())
    story.append(Paragraph(
        "The system uses a priority cascade to maximise robustness. "
        "At each tier, if the model is unavailable or returns low confidence, "
        "the system falls through to the next tier.",
        S["body"]))
    story.append(sp(0.3))

    cascade_rows = [
        [Paragraph("<b>Priority</b>", S["tbl_hdr"]),
         Paragraph("<b>Model</b>", S["tbl_hdr"]),
         Paragraph("<b>Trigger Condition</b>", S["tbl_hdr"]),
         Paragraph("<b>Fallback Trigger</b>", S["tbl_hdr"])],
        ["0 (gate)", "Reliability Gate",     "Always first — blocks low-quality readings", "reliability_score < 40 → return 'unreliable'"],
        ["1",        "XGBoost",              "Model loaded + reliability ≥ 40",            "model None or exception → try RF"],
        ["2",        "Random Forest",        "XGBoost unavailable",                        "model None or exception → rule-based"],
        ["3 (LSTM)", "LSTM (temporal)",      "≥5 readings available via /ai/predict/lstm", "< 5 readings or model None → XGBoost_fallback"],
        ["4",        "Anderson Rule-Based",  "All ML models failed/missing",               "Final deterministic fallback — always returns"],
    ]
    for i, row in enumerate(cascade_rows[1:], 1):
        cascade_rows[i] = [Paragraph(str(c), S["tbl_cell_c"] if j == 0 else S["tbl_cell"])
                           for j, c in enumerate(row)]
    casc = Table(cascade_rows, colWidths=[1.8*cm, 3.0*cm, 5.5*cm, 5.5*cm])
    casc.setStyle(tbl_style())
    story += [casc, sp()]

    story.append(Paragraph(
        "Confidence threshold: any model returning confidence < 0.60 produces label = 'unreliable' "
        "and sets recalibration_needed = True. The 0.60 threshold was chosen to maintain precision "
        "at the cost of recall on ambiguous readings, consistent with clinical conservatism.",
        S["body"]))

    story.append(sp())
    story.append(Paragraph("6.1 API Endpoints", S["h2"]))
    api_rows = [
        [Paragraph("<b>Endpoint</b>", S["tbl_hdr"]),
         Paragraph("<b>Method</b>", S["tbl_hdr"]),
         Paragraph("<b>Model</b>", S["tbl_hdr"]),
         Paragraph("<b>Input</b>", S["tbl_hdr"]),
         Paragraph("<b>Response Fields</b>", S["tbl_hdr"])],
        ["/ai/predict",       "POST", "XGBoost → RF → rule-based",
         "Single reading (13 features)", "label, metabolic_risk_index, confidence_score, model_used"],
        ["/ai/predict/lstm",  "POST", "LSTM → XGBoost_fallback",
         "Sequence of ≥5 readings",    "label, metabolic_risk_index, confidence_score, sequence_length"],
        ["/ai/predict/trend", "POST", "LSTM Trend → rule fallback",
         "Sequence of ≥7 sessions",    "trend, confidence, probabilities, sequence_length"],
        ["/ai/trend",         "GET",  "Linear regression",
         "≥3 historical readings",     "trend_direction, slope_ppm_per_day, predicted_points, confidence"],
        ["/ai/drift",         "GET",  "Heuristic + XGBoost drift model",
         "Calibration history",        "drift_detected, severity, drift_pct, recommendation"],
        ["/ai/chat",          "POST", "LLM + guardrail",
         "User message + sensor data", "ai_response (filtered), disclaimer"],
    ]
    for i, row in enumerate(api_rows[1:], 1):
        api_rows[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    apit = Table(api_rows, colWidths=[2.8*cm, 1.5*cm, 3.5*cm, 3.0*cm, 5.0*cm])
    apit.setStyle(tbl_style())
    story += [apit]

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 7 — Limitations and Future Work
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("7. Limitations and Future Work", S["h1"]))
    story.append(hr())

    story.append(Paragraph("7.1 Current Limitations", S["h2"]))

    lim_rows = [
        [Paragraph("<b>#</b>", S["tbl_hdr"]),
         Paragraph("<b>Limitation</b>", S["tbl_hdr"]),
         Paragraph("<b>Impact</b>", S["tbl_hdr"]),
         Paragraph("<b>Mitigation</b>", S["tbl_hdr"])],
        ["L1", "No real human breath data",
         "High — training on surrogate data; clinical validity unproven",
         "Planned pilot study with human participants"],
        ["L2", "No real participant count",
         "High — cannot claim clinical sensitivity/specificity",
         "Pilot: target 30+ subjects with confirmed metabolic states"],
        ["L3", "Threshold-based ground truth",
         "Medium — labels derived from Anderson thresholds, not GC-MS verification",
         "Require blood ketone / GC-MS co-measurement in pilot"],
        ["L4", "LSTM ramp detection weak (legacy §3.3)",
         "ADDRESSED in Phase 3 — the new Trend LSTM (§3.5) reframes the task "
         "as 4-class trend classification over 7–30 sessions; the 2→40 ppm "
         "ramp is now correctly labelled 'increasing' at confidence 0.95 "
         "(§4.2). Legacy per-reading LSTM row retained for continuity.",
         "Real longitudinal per-participant data from pilot phase will replace "
         "the synthetic dataset used to train the current Trend LSTM (§7.2)."],
        ["L5", "No DKA range data (>75 ppm)",
         "High — no training examples for highest-risk class",
         "Cannot resolve without clinical data; flag as unvalidated range"],
        ["L6", "Drift model = heuristic fallback",
         "Low — XGBoost drift model trained but feature mismatch with real sensor",
         "Retrain drift model after pilot with real MetaBreath calibration logs"],
        ["L7", "No Confusion Matrix published",
         "Medium — reviewer cannot fully assess per-class errors",
         "See Section 4 for F1-scores; confusion matrix plots in model output files"],
        ["L8", "No ROC-AUC for 5-class",
         "Low — standard ROC-AUC requires binary or OvR",
         "Report macro-averaged OvR AUC in next version after pilot"],
        ["L9", "Label–feature circularity (RF / XGB)",
         "High — labels are computed by applying the Anderson threshold to "
         "acetone_delta, which is also a model input feature. Verification-variant "
         "accuracy (RF=0.9917, XGB=0.9917) therefore measures rule-consistency, "
         "not independent predictive validity. The predictive variant "
         "(RF=0.3958, XGB=0.4333) sits at the stratified chance baseline (0.3783), "
         "quantifying the drop.",
         "Predictive variant already trained and reported in §4.1 as an honest "
         "baseline. Independent predictive validity requires retraining with a "
         "non-circular label (blood BOHB / GC-MS) collected during the pilot "
         "phase (§7.2)."],
    ]
    for i, row in enumerate(lim_rows[1:], 1):
        lim_rows[i] = [Paragraph(str(c), S["tbl_cell_c"] if j == 0 else S["tbl_cell"])
                       for j, c in enumerate(row)]
    limt = Table(lim_rows, colWidths=[0.6*cm, 4.0*cm, 4.5*cm, 6.7*cm])
    limt.setStyle(tbl_style())
    story += [limt, sp()]

    story.append(Paragraph("7.2 Pilot Study Plan (Next Phase)", S["h2"]))
    pilot_rows = [
        [Paragraph("<b>Item</b>", S["tbl_hdr"]),
         Paragraph("<b>Details</b>", S["tbl_hdr"])],
        ["Target participants",
         "≥30 volunteers; mix of healthy, keto-diet, and Type-2 diabetic (supervised)"],
        ["Sessions per participant",
         "≥5 breath measurements at different metabolic states (fasting, post-meal, post-exercise)"],
        ["Reference standard",
         "Concurrent blood ketone (Precision Xtra) + urine strip (Ketostix) per session"],
        ["Sensor validation",
         "Compare MetaBreath acetone_delta against laboratory GC-MS reference (subset)"],
        ["Labels",
         "Ground-truth from blood BOHB: <0.5 mM=basal, 0.5–3 mM=nutritional_ketosis, >3 mM=deep"],
        ["LSTM re-training",
         "Collect 5+ consecutive daily readings per participant for temporal sequence training"],
        ["Ethics",
         "IRB approval required; no clinical diagnosis made from device during pilot"],
        ["Target timeline",
         "Post-NSC 2026; Phase 6 of MetaBreath development roadmap"],
    ]
    for i, row in enumerate(pilot_rows[1:], 1):
        pilot_rows[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    pilt = Table(pilot_rows, colWidths=[4.5*cm, 11.3*cm])
    pilt.setStyle(tbl_style())
    story += [pilt]

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 8 — LLM Safety Guardrail
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("8. LLM Safety Guardrail — MetaBreath AI Coach", S["h1"]))
    story.append(hr())
    story.append(Paragraph(
        "The MetaBreath AI Coach uses an LLM (Claude) for natural-language interpretation "
        "of sensor readings. A mandatory safety guardrail layer pre-screens both user "
        "input and LLM output for medically dangerous content.",
        S["body"]))
    story.append(sp(0.3))

    guard_rows = [
        [Paragraph("<b>Category</b>", S["tbl_hdr"]),
         Paragraph("<b>Examples Blocked (EN)</b>", S["tbl_hdr"]),
         Paragraph("<b>Examples Blocked (TH)</b>", S["tbl_hdr"])],
        ["Drug dosage", "\"adjust insulin dose\", \"how much metformin\"",
         "\"ปรับยา\", \"ฉีดอินซูลินเท่าไหร่\""],
        ["Diagnosis", "\"you have diabetes\", \"DKA\"",
         "\"คุณเป็นเบาหวาน\", \"เป็น DKA\""],
        ["Deny medical need", "\"don't need a doctor\"",
         "\"ไม่ต้องไปหาหมอ\""],
        ["Extreme fasting", "\"fast for 7 days\"",
         "\"อดอาหาร 7 วัน\""],
        ["Self-harm", "\"kill myself\", \"self-harm\"",
         "\"อยากตาย\", \"ฆ่าตัวตาย\""],
    ]
    for i, row in enumerate(guard_rows[1:], 1):
        guard_rows[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    gt = Table(guard_rows, colWidths=[3.0*cm, 6.5*cm, 6.3*cm])
    gt.setStyle(tbl_style())
    story += [gt, sp(0.2),
              Paragraph("All responses include a mandatory medical disclaimer in Thai and English. "
                        "Emergency symptoms trigger immediate referral: \"โปรดโทร 1669 หรือไปห้องฉุกเฉินทันที\".",
                        S["body"])]

    story.append(PageBreak())

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 9 — File Inventory
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("9. Model File Inventory", S["h1"]))
    story.append(hr())

    inv_rows = [
        [Paragraph("<b>File</b>", S["tbl_hdr"]),
         Paragraph("<b>Size</b>", S["tbl_hdr"]),
         Paragraph("<b>Contents</b>", S["tbl_hdr"]),
         Paragraph("<b>Status</b>", S["tbl_hdr"])],
        ["apps/api/models/rf_classifier.joblib",             "~1.2 MB", "RF verification variant (13 feat.) — deployed", "Production"],
        ["apps/api/models/xgb_classifier.joblib",            "~0.8 MB", "XGB verification variant (13 feat.) — deployed", "Production"],
        ["apps/api/models/rf_classifier_predictive.joblib",  "~1.0 MB", "RF predictive variant (9 feat., leakage-free) — reporting only", "Baseline"],
        ["apps/api/models/xgb_classifier_predictive.joblib", "~0.7 MB", "XGB predictive variant (9 feat., leakage-free) — reporting only", "Baseline"],
        ["apps/api/models/lstm_model.pt",             "~0.5 MB", "Legacy per-reading LSTM (3-class metabolic)",    "Production*"],
        ["apps/api/models/lstm_trend.pt",             "~0.6 MB", "Trend LSTM (4-class trend, Phase 3, participant-wise validated)", "Production"],
        ["apps/api/models/lstm_trend_metrics.json",   "<1 KB",   "Trend LSTM val metrics + confusion matrix",   "Reference"],
        ["data/processed/scaler_lstm_trend_mean.npy", "<1 KB",   "Trend LSTM StandardScaler mean",   "Required"],
        ["data/processed/scaler_lstm_trend_scale.npy","<1 KB",   "Trend LSTM StandardScaler scale",  "Required"],
        ["data/processed/longitudinal_synthetic.csv", "~100 KB", "Synthetic longitudinal dataset (100 pt × 14 sess)", "Reproducible"],
        ["apps/api/models/drift_model.joblib",        "~0.3 MB", "Trained drift detector (XGBoost)",     "Production"],
        ["apps/api/models/feature_columns.json",      "<1 KB",   "Feature order + label encoder classes","Required"],
        ["apps/api/models/training_metrics.json",     "<1 KB",   "RF/XGB training metrics snapshot",     "Reference"],
        ["data/processed/scaler_lstm_mean.npy",       "<1 KB",   "LSTM StandardScaler mean",             "Required"],
        ["data/processed/scaler_lstm_scale.npy",      "<1 KB",   "LSTM StandardScaler scale",            "Required"],
        ["apps/api/notebooks/01_prepare_data.ipynb",  "—",       "Data merging + feature engineering",   "Reproducible"],
        ["apps/api/notebooks/02_random_forest.ipynb", "—",       "RF training + evaluation",             "Reproducible"],
        ["apps/api/notebooks/03_xgboost_optuna.ipynb","—",       "XGBoost + Optuna tuning",              "Reproducible"],
        ["apps/api/notebooks/04_lstm_temporal.ipynb", "—",       "LSTM training + evaluation",           "Reproducible"],
    ]
    for i, row in enumerate(inv_rows[1:], 1):
        inv_rows[i] = [Paragraph(str(c), S["tbl_cell"]) for c in row]
    invt = Table(inv_rows, colWidths=[6.5*cm, 1.5*cm, 5.5*cm, 2.3*cm])
    invt.setStyle(tbl_style())
    story += [invt, sp(0.2),
              Paragraph("* LSTM in production but trained on surrogate data. "
                        "Refresh required after pilot study.",
                        S["note"])]

    story.append(sp())

    # ═══════════════════════════════════════════════════════════════════
    # SECTION 10 — References
    # ═══════════════════════════════════════════════════════════════════
    story.append(Paragraph("10. References", S["h1"]))
    story.append(hr())

    refs = [
        "[1] Anderson JC. \"Measuring breath acetone for monitoring fat loss.\" "
        "Obesity (2015) 23(12):2327-2334. doi:10.1002/oby.21242",
        "[2] Rizwan M. \"eNose Sensor Dataset for Predicting Human Diseases.\" "
        "Kaggle (2022). License: Apache-2.0.",
        "[3] Vergara A, et al. \"Chemical gas sensor drift compensation using classifier ensembles.\" "
        "UCI Gas Sensor Array Drift Dataset (2012). CC BY 4.0.",
        "[4] Chen T, Guestrin C. \"XGBoost: A Scalable Tree Boosting System.\" "
        "KDD 2016. doi:10.1145/2939672.2939785",
        "[5] Hochreiter S, Schmidhuber J. \"Long Short-Term Memory.\" "
        "Neural Computation (1997) 9(8):1735-1780.",
        "[6] Akiba T, et al. \"Optuna: A Next-generation Hyperparameter Optimization Framework.\" "
        "KDD 2019. doi:10.1145/3292500.3330701",
        "[7] Figaro Engineering Inc. \"TGS1820 Product Information.\" "
        "Figaro USA, 2020.",
        "[8] Sensirion AG. \"SHT31 Datasheet.\" Sensirion, 2021.",
    ]
    for ref in refs:
        story.append(Paragraph(ref, S["note"]))
        story.append(sp(0.1))

    # Footer
    story += [sp(1), hr(C_GREY, 0.5),
              Paragraph(
                  "MetaBreath AI Technical Report — NSC 2026 | MetaBreath Health Platform | "
                  "Generated 2026-07-12 | This report is for academic/competition purposes only. "
                  "Not for clinical use.",
                  ParagraphStyle("footer", fontName=BASE_FONT, fontSize=8,
                                 textColor=C_GREY, alignment=TA_CENTER))]

    doc.build(story)
    print(f"\nPDF saved: {out_path}")

if __name__ == "__main__":
    out = os.path.join(
        os.path.dirname(__file__),
        "../../../MetaBreath_AI_Technical_Report_NSC2026.pdf"
    )
    out = os.path.abspath(out)
    build_pdf(out)
