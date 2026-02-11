#!/usr/bin/env python3
"""
============================================================================
DATASET PIPELINE ENGINE — EXACT CONVERSION FROM JUPYTER NOTEBOOK
============================================================================
This script combines all blocks (1-9) from your notebook into a single
executable Python script that can be called from a Vite/Tauri UI.

Usage:
    python pipeline_engine.py <path_to_pdf_or_txt_file>
    
The script will:
1. Setup directories and check dependencies
2. Extract text from PDF (digital or OCR)
3. Clean the text
4. Chunk the text
5. Export datasets
6. Generate evaluation report
============================================================================
"""

import sys
import os
import subprocess
import shutil
from pathlib import Path
import json
import re
import warnings
import random
import statistics
from collections import Counter

# Suppress warnings
warnings.filterwarnings("ignore")

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def log(message):
    """Helper to send logs to the UI in real-time"""
    # Encode safely for Windows terminal (some systems can't handle emoji)
    try:
        print(f"LOG: {message}", flush=True)
    except UnicodeEncodeError:
        # Fallback: remove problematic emoji
        safe_message = message.encode('ascii', errors='replace').decode('ascii')
        print(f"LOG: {safe_message}", flush=True)

def save_json(obj, path: Path):
    """Write JSON with utf-8 and keep real unicode characters (no \\u escapes)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)

# ============================================================================
# MAIN PIPELINE FUNCTION
# ============================================================================

def run_pipeline(source_file_path):
    """
    Main pipeline execution function
    Combines Blocks 1-9 from the original notebook
    """
    
    source_path = Path(source_file_path)
    
    if not source_path.exists():
        log(f"[ERROR] File not found at {source_path}")
        return False

    # ========================================================================
    # BLOCK 1: DIRECTORY SETUP & PIPELINE GUARD
    # ========================================================================
    
    log("[START] Starting Dataset Pipeline")
    log("="*60)
    
    # Use the parent directory of the script to find the 'data' folder
    BASE_DIR = Path(__file__).parent.parent if hasattr(Path(__file__), 'parent') else Path.cwd()
    DATA_DIR = BASE_DIR / "data"
    CACHE_DIR = BASE_DIR / "cache"
    DATASET_DIR = BASE_DIR / "datasets"
    OUTPUT_DIR = BASE_DIR / "outputs"
    
    # Ensure folders exist
    for d in [DATA_DIR, CACHE_DIR, OUTPUT_DIR, DATASET_DIR]:
        d.mkdir(parents=True, exist_ok=True)
    
    log(f"[INFO] Working Directory: {BASE_DIR}")
    log(f"[INFO] Folders ready: data, cache, outputs, datasets")
    
    state_file = CACHE_DIR / "pipeline_state.json"
    state = {}
    
    if state_file.exists():
        state = json.loads(state_file.read_text())
    
        # Use uploaded file directly (no duplication into data/)
    target_pdf = source_path
    log(f"[INFO] Using source file directly: {target_pdf.name}")

    
    current_pdf = target_pdf.name
    last_pdf = state.get("pdf")
    
    log(f"[INFO] Current File: {current_pdf}")
    
    # Detect new vs old file
    if last_pdf == current_pdf:
        log("[OK] Same file as last run — keeping cache & outputs")
        CLEAN_REQUIRED = False
    else:
        log("[NEW] New file detected — cleaning old cache/datasets/outputs")
        
        for folder in [CACHE_DIR, DATASET_DIR, OUTPUT_DIR]:
            if folder.exists():
                for item in folder.iterdir():
                    if item != state_file:  # Don't delete state file yet
                        if item.is_file():
                            item.unlink()
                        else:
                            shutil.rmtree(item)
        
        CLEAN_REQUIRED = True
        state = {"pdf": current_pdf, "stage": "init"}
        CACHE_DIR.mkdir(exist_ok=True)
        state_file.write_text(json.dumps(state, indent=2))
    
    log("[OK] Pipeline guard check complete")
    
    # ========================================================================
    # BLOCK 2: ENVIRONMENT & DEPENDENCY CHECK
    # ========================================================================
    
    log("="*60)
    log("[CHECK] Checking dependencies...")
    
    # Poppler path config (for pdf2image fallback)
    poppler_paths = [
        r"C:\Program Files\poppler\Library\bin",
        r"C:\Program Files (x86)\poppler\Library\bin",
    ]
    
    poppler_found = False
    for path in poppler_paths:
        if os.path.exists(path):
            os.environ['PATH'] = path + ';' + os.environ['PATH']
            poppler_found = True
            log(f"   [OK] Poppler found at: {path}")
            break
    
    if not poppler_found:
        log("   [WARN] Poppler not found (optional — PyMuPDF still works)")
    
    # PaddleOCR check
    try:
        import paddleocr
        log("   [OK] PaddleOCR installed")
        paddle_ok = True
    except:
        log("   [WARN] PaddleOCR not installed (will use digital extraction only)")
        paddle_ok = False
    
    # Library checks
    required_libs = {
        'PyPDF2': 'PyPDF2',
        'nltk': 'nltk',
        'pandas': 'pandas',
        'pdf2image': 'pdf2image',
        'fitz': 'PyMuPDF',
    }
    
    log("[INFO] Library Status:")
    for lib_import, lib_name in required_libs.items():
        try:
            __import__(lib_import)
            log(f"   [OK] {lib_name} OK")
        except:
            log(f"   [WARN] {lib_name} missing")
    # ========================================================================
    # ========================================================================
    # BLOCK 3: PDF TEXT EXTRACTION (DIGITAL → PADDLE OCR FALLBACK) — FIXED
    # ========================================================================

    log("="*60)
    log("[EXTRACT] BLOCK 3 — Extracting text from file")

    pdf_path = target_pdf

    try:
        import fitz
    except:
        log("[ERROR] PyMuPDF (fitz) not installed")
        return False

    method_used = "unknown"

    if pdf_path.suffix.lower() == ".pdf":
        log("[INFO] Processing PDF file...")

        doc = fitz.open(pdf_path)
        digital_text_parts = []

        for page_num, page in enumerate(doc, start=1):
            blocks = page.get_text("blocks")
            blocks.sort(key=lambda b: (round(b[1],1), round(b[0],1)))

            page_lines = []
            for b in blocks:
                t = b[4].strip()
                if t:
                    page_lines.append(t)

            digital_text_parts.append("\n".join(page_lines))

        digital_text = "\n\n".join(digital_text_parts).strip()

        log(f"[INFO] Digital text length: {len(digital_text)} characters")

        DIGITAL_THRESHOLD = 1200
        use_ocr = len(digital_text) < DIGITAL_THRESHOLD

        if use_ocr and paddle_ok:
            log("[INFO] Digital text weak — switching to PaddleOCR fallback")
            try:
                from paddleocr import PaddleOCR
                from pdf2image import convert_from_path

                ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
                images = convert_from_path(pdf_path)

                ocr_parts = []

                for i, img in enumerate(images):
                    log(f"   [INFO] OCR page {i+1}/{len(images)}")
                    result = ocr.ocr(img, cls=True)

                    words = []
                    for line in result:
                        for w in line:
                            words.append(w[1][0])

                    ocr_parts.append(" ".join(words))

                final_text = "\n\n".join(ocr_parts)
                method_used = "paddle_ocr"

            except Exception as e:
                log(f"[WARN] OCR failed: {e}, using digital text")
                final_text = digital_text
                method_used = "digital_fallback"
        else:
            log("[OK] Using digital block extraction")
            final_text = digital_text
            method_used = "digital_block"

    else:
        log("[INFO] Reading text file...")
        try:
            final_text = pdf_path.read_text(encoding="utf-8", errors="replace")
            method_used = "text_file"
        except Exception as e:
            log(f"[ERROR] File Read Error: {e}")
            return False


    raw_path = DATASET_DIR / "raw_text.txt"
    raw_path.write_text(final_text, encoding="utf-8")

    log(f"[INFO] Saved: {raw_path.name}")
    log(f"[INFO] Method: {method_used}")
    log(f"[INFO] Final text length: {len(final_text)} characters")

    state = json.loads(state_file.read_text())
    state["stage"] = "text_extracted"
    state["method"] = method_used
    state_file.write_text(json.dumps(state, indent=2))

    log("[OK] BLOCK 3 COMPLETE — TEXT READY")

    # ========================================================================
    # BLOCK 4: SAFE CLEAN + DICTIONARY JOIN + SPLIT + DROPCAP + METRICS
    # ========================================================================

    log("="*60)
    log("[CLEAN] BLOCK 4 — Safe cleaning pipeline")

    text = raw_path.read_text(encoding="utf-8")
    original_length = len(text)

    # ------------------------------------------------------------------------
    # CHARACTER NORMALIZE
    # ------------------------------------------------------------------------

    ligatures = {'ﬁ':'fi','ﬂ':'fl','ﬀ':'ff','ﬃ':'ffi','ﬄ':'ffl'}
    for k,v in ligatures.items():
        text = text.replace(k, v)

    quotes = {'’':"'",'‘':"'",'“':'"','”':'"','–':'-','—':'-','−':'-'}
    for k,v in quotes.items():
        text = text.replace(k, v)

    # remove zero-width junk
    text = re.sub(r'[\u200B-\u200D\uFEFF]', '', text)

    # ------------------------------------------------------------------------
    # REMOVE SIMPLE ARTIFACTS
    # ------------------------------------------------------------------------

    text = re.sub(r'http[s]?://\S+', '', text)
    text = re.sub(r'www\.\S+', '', text)
    text = re.sub(r'Page \d+', '', text, flags=re.I)

    # ------------------------------------------------------------------------
    # SAFE WHITESPACE NORMALIZE
    # ------------------------------------------------------------------------

    text = re.sub(r'[ \t]+', ' ', text)
    text = re.sub(r' *\n *', '\n', text)

    # ------------------------------------------------------------------------
    # SAFE HYPHEN LINE-BREAK FIX ONLY
    # example: associ-
    #          ation → association
    # ------------------------------------------------------------------------

    text = re.sub(r'([a-z])-\n([a-z])', r'\1\2', text)

    # =====================================================================
    # LOAD DICTIONARY
    # =====================================================================

    dict_path = Path(__file__).parent / "dictionaries" / "frequency_dictionary_en_82_765.txt"
    word_set = set()

    if dict_path.exists():
        with open(dict_path, encoding="utf-8") as f:
            for line in f:
                w = line.strip().split()[0].lower()
                if w:
                    word_set.add(w)
        log(f"[DICT] Loaded words: {len(word_set):,}")
    else:
        log("[DICT] Not found — join/split disabled")

    # =====================================================================
    # SAFE SMALL WORD JOIN (t he → the)
    # only if merged form exists in dictionary
    # =====================================================================

    broken_pairs = 0
    joins = 0

    if word_set:

        tokens = text.split()
        fixed = []
        i = 0

        while i < len(tokens):

            if i+1 < len(tokens):
                a = tokens[i]
                b = tokens[i+1]

                if len(a) <= 2 and a.isalpha() and b.isalpha():
                    broken_pairs += 1
                    merged = (a + b).lower()

                    if merged in word_set:
                        fixed.append(a + b)
                        joins += 1
                        i += 2
                        continue

            fixed.append(tokens[i])
            i += 1

        text = " ".join(fixed)

    log(f"[REPAIR] Broken pairs detected: {broken_pairs}")
    log(f"[REPAIR] Dictionary joins applied: {joins}")

    # =====================================================================
    # SAFE DICTIONARY SPLIT (ina → in a, ashe → as he)
    # only when BOTH halves are valid words
    # =====================================================================

    split_fixes = 0

    if word_set:

        tokens = text.split()
        fixed = []

        for tok in tokens:

            low = tok.lower()

            if low in word_set or not tok.isalpha() or len(tok) < 4:
                fixed.append(tok)
                continue

            repaired = False

            for cut in range(1, len(tok)):
                left = low[:cut]
                right = low[cut:]

                if left in word_set and right in word_set:
                    fixed.append(left + " " + right)
                    split_fixes += 1
                    repaired = True
                    break

            if not repaired:
                fixed.append(tok)

        text = " ".join(fixed)

    log(f"[REPAIR] Dictionary splits applied: {split_fixes}")

    # =====================================================================
    # DROP-CAP FIX (n glancing → In glancing, t he → The he)
    # sentence/line start only — safe
    # =====================================================================

    log("[REPAIR] Drop-cap repair pass...")

    dropcap_fixes = 0

    pattern = re.compile(r'(^|[\n\.!\?]\s+)([a-z])\s+([a-z]+)')

    def _dropcap_repl(m):
        nonlocal dropcap_fixes   # ✅ correct for nested function
        dropcap_fixes += 1

        prefix = m.group(1)
        first = m.group(2)
        word = m.group(3)

        if first == "n":
            return prefix + "In " + word
        if first == "t":
            return prefix + "The " + word
        if first == "i":
            return prefix + "I " + word

        return prefix + first.upper() + " " + word

    text = pattern.sub(_dropcap_repl, text)

    log(f"[REPAIR] Drop-cap fixes applied: {dropcap_fixes}")



    # =====================================================================
    # METRICS
    # =====================================================================

    if broken_pairs:
        log(f"[REPAIR] Join confidence: {joins/broken_pairs:.2%}")

    log(f"[REPAIR] Total fixes: {joins + split_fixes + dropcap_fixes}")

    # =====================================================================
    # BOUNDARY PROTECTION (prevent accidental merges)
    # =====================================================================

    text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
    text = re.sub(r'([A-Za-z])(\d)', r'\1 \2', text)
    text = re.sub(r'(\d)([A-Za-z])', r'\1 \2', text)

    # =====================================================================
    # SAVE CLEAN
    # =====================================================================

    clean_path = DATASET_DIR / "clean_text.txt"
    clean_path.write_text(text, encoding="utf-8")

    log(f"[INFO] Saved: {clean_path.name}")
    log(f"[INFO] Cleaned length: {len(text):,}")
    log(f"[INFO] Reduction: {original_length - len(text):,}")

    state = json.loads(state_file.read_text())
    state["stage"] = "cleaned"
    state_file.write_text(json.dumps(state, indent=2))

    log("✅ BLOCK 4 COMPLETE — TEXT CLEANED")

    # ========================================================================
    # BLOCK 5 & 6: SENTENCE-BASED CHUNKING (COMBINED)
    # ========================================================================
    
    log("="*60)
    log("🧩 BLOCKS 5 & 6 — Starting Chunking Logic")
    
    clean_path = DATASET_DIR / "clean_text.txt"
    assert clean_path.exists(), "clean_text.txt missing"
    
    log("📖 Loading cleaned text...")
    text = clean_path.read_text(encoding="utf-8")
    
    # FIX: REMOVE UNICODE QUOTES & DASHES PRIOR TO CHUNKING
    text = text.replace('\u201c', '"').replace('\u201d', '"') \
               .replace('\u2018', "'").replace('\u2019', "'") \
               .replace('\u2014', "-").replace('\u2026', "...")
    
    # SENTENCE SPLIT (regex — no spaCy dependency)
    sentences = re.split(r'(?<=[.!?])\s+', text)
    
    # Remove noisy sentences
    good = []
    for s in sentences:
        s = s.strip()
        
        if len(s) < 40:
            continue
        
        # Drop OCR garbage heavy symbol ratio
        sym_ratio = sum(not c.isalnum() and not c.isspace() for c in s) / max(len(s), 1)
        if sym_ratio > 0.25:
            continue
        
        good.append(s)
    
    log(f"[INFO] Valid sentences kept: {len(good)}")
    
    # BUILD WORD-BOUND CHUNKS
    CHUNK_WORDS = 180
    OVERLAP_WORDS = 30
    
    chunks = []
    current_words = []
    
    for sent in good:
        w = sent.split()
        
        if len(current_words) + len(w) <= CHUNK_WORDS:
            current_words.extend(w)
        else:
            if len(current_words) > 80:
                chunks.append(" ".join(current_words))
            
            # Overlap tail
            current_words = current_words[-OVERLAP_WORDS:] + w
    
    # Last chunk
    if len(current_words) > 80:
        chunks.append(" ".join(current_words))
    
    log(f"[INFO] Total chunks created: {len(chunks)}")
    
    # Save chunks
    out_path = DATASET_DIR / "chunks.json"
    json.dump(chunks, open(out_path, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    
    log(f"💾 Saved → {out_path.name}")
    
    # Update state
    state = json.loads(state_file.read_text())
    state["stage"] = "chunked"
    state["chunks"] = len(chunks)
    state_file.write_text(json.dumps(state, indent=2))
    
    log("✅ BLOCKS 5 & 6 COMPLETE — CHUNKING DONE")
    
    if chunks:
        preview = chunks[0][:200] if len(chunks[0]) > 200 else chunks[0]
        log(f"🔍 Preview first chunk: {preview}...")
    
    # ========================================================================
    # BLOCK 8: UNIVERSAL DATASET EXPORT (MODEL-AGNOSTIC)
    # ========================================================================
    
    log("="*60)
    log("📦 BLOCK 8 — Universal Dataset Export")
    
    chunks_path = DATASET_DIR / "chunks.json"
    assert chunks_path.exists(), "chunks.json missing"
    
    # Load raw chunks
    raw_chunks = json.load(open(chunks_path, encoding="utf-8"))
    
    # FIX: REMOVE UNICODE QUOTES & DASHES
    chunks = []
    for c in raw_chunks:
        cleaned = c.replace('\u201c', '"').replace('\u201d', '"') \
                   .replace('\u2018', "'").replace('\u2019', "'") \
                   .replace('\u2014', "-")
        chunks.append(cleaned)
    
    log(f"📦 Loaded and cleaned {len(chunks)} chunks")
    
    # MASTER INDEXED DATASET
    records = []
    for i, c in enumerate(chunks):
        records.append({
            "id": i,
            "text": c,
            "word_count": len(c.split())
        })
    
    save_json(records, DATASET_DIR / "chunks_with_id.json")
    log("✅ chunks_with_id.json saved")
    
    # BERT / MLM CORPUS
    with open(DATASET_DIR / "corpus.txt", "w", encoding="utf-8") as f:
        for c in chunks:
            f.write(c + "\n\n")
    
    log("✅ corpus.txt saved")
    
    # LORA / QLORA INSTRUCTION STYLE
    instruct = []
    for r in records:
        instruct.append({
            "instruction": "Study the following passage and learn its content.",
            "input": "",
            "output": r["text"]
        })
    
    save_json(instruct, DATASET_DIR / "lora_instruct.json")
    log("✅ lora_instruct.json saved")
    
    # PAIR DATASET (NEXT-CHUNK POSITIVE PAIRS)
    pairs = []
    for i in range(len(chunks) - 1):
        pairs.append({
            "text_a": chunks[i],
            "text_b": chunks[i + 1],
            "label": 1
        })
    
    # Add simple negative pairs (only if we have at least 2 chunks)
    random.seed(42)
    if len(chunks) >= 2:
        for _ in range(len(chunks)):
            a, b = random.sample(chunks, 2)
            pairs.append({
                "text_a": a,
                "text_b": b,
                "label": 0
            })
    
    save_json(pairs, DATASET_DIR / "pairs.json")
    log("✅ pairs.json saved")
    
    # TRAIN/VAL/TEST SPLIT
    random.seed(42)
    shuffled = records.copy()
    random.shuffle(shuffled)
    
    n = len(shuffled)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)
    
    train_data = shuffled[:train_end]
    val_data = shuffled[train_end:val_end]
    test_data = shuffled[val_end:]
    
    save_json(train_data, DATASET_DIR / "train.json")
    save_json(val_data, DATASET_DIR / "val.json")
    save_json(test_data, DATASET_DIR / "test.json")
    
    log(f"✅ train.json saved ({len(train_data)} records)")
    log(f"✅ val.json saved ({len(val_data)} records)")
    log(f"✅ test.json saved ({len(test_data)} records)")
    
    # State update
    state = json.loads(state_file.read_text())
    state["stage"] = "datasets_exported"
    state_file.write_text(json.dumps(state, indent=2))
    
    log("✅ BLOCK 8 COMPLETE — DATASETS READY")
    
    # ========================================================================
    # BLOCK 9: DATASET EVALUATION REPORT
    # ========================================================================
    
    log("="*60)
    log("[REPORT] BLOCK 9 — Building dataset evaluation report")
    
    chunks = json.load(open(DATASET_DIR / "chunks.json", encoding="utf-8"))
    records = json.load(open(DATASET_DIR / "chunks_with_id.json", encoding="utf-8"))
    pairs = json.load(open(DATASET_DIR / "pairs.json", encoding="utf-8"))
    
    # BASIC STATS
    word_counts = [len(c.split()) for c in chunks]
    char_counts = [len(c) for c in chunks]
    
    report = {}
    
    report["total_chunks"] = len(chunks)
    report["total_records"] = len(records)
    
    # Handle empty datasets
    if word_counts:
        report["word_stats"] = {
            "min": min(word_counts),
            "max": max(word_counts),
            "mean": round(statistics.mean(word_counts), 2),
            "median": statistics.median(word_counts)
        }
        report["char_stats"] = {
            "min": min(char_counts),
            "max": max(char_counts),
            "mean": round(statistics.mean(char_counts), 2)
        }
    else:
        report["word_stats"] = {"min": 0, "max": 0, "mean": 0, "median": 0}
        report["char_stats"] = {"min": 0, "max": 0, "mean": 0}
    
    # QUALITY CHECKS
    short_chunks = sum(1 for w in word_counts if w < 80)
    report["short_chunks_under_80w"] = short_chunks
    
    # Duplicates
    dup_count = len(chunks) - len(set(chunks))
    report["duplicate_chunks"] = dup_count
    
    # Vocab size estimate
    vocab = set()
    for c in chunks:
        for w in c.lower().split():
            vocab.add(w)
    
    report["vocab_size_estimate"] = len(vocab)
    
    # PAIR BALANCE
    labels = Counter(p["label"] for p in pairs)
    report["pair_label_balance"] = dict(labels)
    
    # SPLIT SIZES
    def safe_len(p):
        return len(json.load(open(DATASET_DIR / p))) if (DATASET_DIR / p).exists() else 0
    
    report["splits"] = {
        "train": safe_len("train.json"),
        "val": safe_len("val.json"),
        "test": safe_len("test.json")
    }
    
    # SAVE REPORT
    OUTPUT_DIR.mkdir(exist_ok=True)
    
    json_path = OUTPUT_DIR / "dataset_report.json"
    txt_path = OUTPUT_DIR / "dataset_report.txt"
    
    save_json(report, json_path)
    
    with open(txt_path, "w", encoding="utf-8") as f:
        f.write("DATASET QUALITY REPORT\n")
        f.write("=" * 50 + "\n\n")
        
        for k, v in report.items():
            f.write(f"{k}:\n{v}\n\n")
        
        f.write("\nSAMPLE CHUNKS:\n")
        f.write("-" * 50 + "\n")
        for i, c in enumerate(chunks[:3]):
            preview = c[:400] if len(c) > 400 else c
            f.write(f"\n--- Sample {i} ---\n{preview}\n")
    
    log(f"✅ Report saved: {json_path.name}")
    log(f"✅ Report saved: {txt_path.name}")
    
    # State update
    state = json.loads(state_file.read_text())
    state["stage"] = "evaluation_done"
    state_file.write_text(json.dumps(state, indent=2))
    
    # Display summary
    log("="*60)
    log("📊 DATASET QUALITY SUMMARY")
    log("="*60)
    log(f"""
📦 DATA SIZE
   Total Chunks   : {report['total_chunks']}
   Total Records  : {report['total_records']}

📝 WORD STATS (per chunk)
   Min Words      : {report['word_stats']['min']}
   Max Words      : {report['word_stats']['max']}
   Mean Words     : {report['word_stats']['mean']}
   Median Words   : {report['word_stats']['median']}

🔤 CHARACTER STATS
   Min Chars      : {report['char_stats']['min']}
   Max Chars      : {report['char_stats']['max']}
   Mean Chars     : {report['char_stats']['mean']}

🧹 QUALITY CHECKS
   Short Chunks   : {report['short_chunks_under_80w']}
   Duplicates     : {report['duplicate_chunks']}
   Vocab Size     : {report['vocab_size_estimate']}
""")
    
    log("🔗 PAIR LABEL BALANCE")
    for k, v in report["pair_label_balance"].items():
        label = "Positive" if str(k) == "1" else "Negative"
        log(f"   {label:9} : {v}")
    
    log("\n📂 DATA SPLITS")
    for k, v in report["splits"].items():
        log(f"   {k.capitalize():5} : {v}")
    
    log("\n✅ BLOCK 9 COMPLETE — EVALUATION DONE")
    log("="*60)
    log("🎯 PIPELINE COMPLETE — ALL DATASETS READY!")
    log("="*60)
    
    return True


# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    if len(sys.argv) > 1:
        input_file = sys.argv[1]
        
        try:
            success = run_pipeline(input_file)
            if success:
                sys.exit(0)
            else:
                sys.exit(1)
        except Exception as e:
            log(f"[ERROR] PIPELINE ERROR: {e}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
    else:
        print("LOG: ❌ No input file provided to Python script", flush=True)
        print("Usage: python pipeline_engine.py <path_to_pdf_or_txt_file>", flush=True)
        sys.exit(1)