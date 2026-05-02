#!/usr/bin/env python3
"""
Parse CAT/XAT HTML question papers and generate questions.json for the web app.
Run: python parse_questions.py
"""

from bs4 import BeautifulSoup
import json
import re
from pathlib import Path
from datetime import datetime

HTML_DIR = Path(__file__).parent / "html_outputs"
OUTPUT_DIR = Path(__file__).parent / "web"
OUTPUT_FILE = OUTPUT_DIR / "questions.json"


def get_file_metadata(filepath):
    name = Path(filepath).stem
    exam = "XAT" if "XAT" in name else "CAT"

    year_match = re.match(r"^(\d{4})", name)
    year = int(year_match.group(1)) if year_match else 0

    if "Quant" in name or "QADI" in name:
        section = "Quant"
    elif "VARC" in name:
        section = "VARC"
    elif "DILR" in name:
        section = "DILR"
    else:
        section = "Unknown"

    slot_match = re.search(r"Slot[_\s](\d+)", name)
    slot = int(slot_match.group(1)) if slot_match else 0

    return {"exam": exam, "year": year, "section": section, "slot": slot}


def detect_varc_subtype(text):
    t = text.lower()
    if "missing in the paragraph" in t or "sentence would best fit" in t or "where (option" in t:
        return "Para Completion"
    if "best captures the essence" in t or "alternate summaries" in t or "best summarizes" in t:
        return "Para Summary"
    if "jumbled up sentences" in t or "jumbled sentences" in t or "four of them can be put together" in t:
        if "odd sentence" in t or "identify the odd" in t:
            return "Odd Sentence Out"
        return "Para Jumbles"
    if "odd sentence" in t or "identify the odd" in t or "cannot be put together" in t:
        return "Odd Sentence Out"
    if "passage" in t and ("question" in t or "based on" in t or "accompanied by" in t):
        return "Reading Comprehension"
    return "Verbal Ability"


def extract_topic_from_h4(h4_text, section, exam="CAT"):
    text = h4_text.strip()
    parts = [p.strip() for p in text.split(" - ")]
    if section == "Quant":
        if len(parts) >= 3:
            topic = " - ".join(parts[2:])
            # Skip trivial Q.N labels from XAT papers
            if re.match(r'^Q\.\d+$', topic):
                return "QA DI" if exam == "XAT" else "QA"
            return topic
        if len(parts) == 2:
            topic = parts[1]
            if re.match(r'^Q\.\d+$', topic):
                return "QA DI" if exam == "XAT" else "QA"
            return topic
        return text
    if section == "VARC":
        return "VA RC"
    if section == "DILR":
        return "DI LR"
    return text


def parse_correct_answer(btn_group):
    """Returns (answer_index 0-3 or None, answer_text, is_tita bool)."""
    if not btn_group:
        return None, None, True

    for tooltip_div in btn_group.find_all("div", class_="tooltip", recursive=False):
        btn = tooltip_div.find("button")
        if not (btn and "Correct" in btn.get_text()):
            continue
        span = tooltip_div.find("span", class_="tooltiptext")
        if not span:
            continue

        # Flatten nested tooltiptext to get clean text
        inner_text = span.get_text(separator=" ").strip()

        choice_match = re.search(r"Choice\s+([A-D])", inner_text, re.IGNORECASE)
        if choice_match:
            idx = ord(choice_match.group(1).upper()) - ord("A")
            answer_text = re.sub(
                r"Choice\s+[A-D]\s*", "", inner_text, flags=re.IGNORECASE
            ).strip()
            return idx, answer_text, False

        # TITA: no choice letter, just a value
        return None, inner_text.strip(), True

    return None, None, True


def fix_mojibake(text):
    """Fix double-encoded UTF-8 (mojibake). Safe for all inputs:
    - ASCII → unchanged
    - Real Unicode → encode('latin-1') fails → return original
    - Double-encoded UTF-8 → fixed to correct characters
    """
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def fix_image_urls(html_str, base_url):
    """Rewrite relative figa/ image src to absolute CDN URLs."""
    if not base_url:
        return html_str
    base = base_url.rstrip("/")
    return re.sub(
        r'src=["\']?(figa/[^"\'>\s]+)["\']?',
        lambda m: f'src="{base}/{m.group(1)}"',
        html_str,
    )


def parse_html_file(filepath):
    meta = get_file_metadata(filepath)

    with open(filepath, "rb") as f:
        raw = f.read()
    content = raw.decode("utf-8", errors="replace")
    content = fix_mojibake(content)

    soup = BeautifulSoup(content, "html.parser")

    canonical = soup.find("link", rel="canonical")
    base_url = canonical.get("href", "").rstrip("/") if canonical else ""

    # Find deepest <ol class="ques"> — some files nest them
    all_ques = soup.find_all("ol", class_=re.compile(r"\bques\b"))
    ques_ol = None
    for ol in all_ques:
        # Prefer the one that directly contains <li> children
        if ol.find("li", recursive=False):
            ques_ol = ol
            break
    if not ques_ol and all_ques:
        ques_ol = all_ques[-1]  # fall back to last found
    if not ques_ol:
        print(f"    WARNING: No question list in {Path(filepath).name}")
        return []

    questions = []
    current_context = None
    q_num = 0

    for child in ques_ol.children:
        if not hasattr(child, "name") or not child.name:
            continue

        if child.name == "p":
            ctx = str(child)
            current_context = fix_image_urls(ctx, base_url)
            continue

        if child.name != "li":
            continue

        q_num += 1

        h4 = child.find("h4")
        h4_text = h4.get_text() if h4 else ""
        topic = extract_topic_from_h4(h4_text, meta["section"], meta["exam"])

        # Question HTML: first <p> after the h4
        question_html = ""
        past_h4 = False
        for elem in child.children:
            if not hasattr(elem, "name") or not elem.name:
                continue
            if elem.name == "h4":
                past_h4 = True
                continue
            if past_h4 and elem.name == "p":
                question_html = fix_image_urls(str(elem), base_url)
                break

        # Options
        choice_ol = child.find("ol", class_=re.compile(r"\bchoice\b"))
        options = []
        if choice_ol:
            for li in choice_ol.find_all("li", recursive=False):
                options.append(str(li))

        # Correct answer
        btn_group = child.find("div", class_="btn-group")
        answer_index, answer_value, is_tita = parse_correct_answer(btn_group)

        if not options:
            is_tita = True
            answer_index = None

        # Refine VARC topic using question content
        if meta["section"] == "VARC":
            q_text = BeautifulSoup(question_html, "html.parser").get_text()
            ctx_text = BeautifulSoup(current_context or "", "html.parser").get_text()
            topic = detect_varc_subtype(q_text + " " + ctx_text)

        q_id = f"{meta['exam']}_{meta['year']}_S{meta['slot']}_{meta['section']}_Q{q_num:03d}"

        questions.append(
            {
                "id": q_id,
                "year": meta["year"],
                "exam": meta["exam"],
                "section": meta["section"],
                "slot": meta["slot"],
                "topic": topic,
                "questionHtml": question_html,
                "options": options if options else None,
                "correctIndex": answer_index,
                "correctAnswer": answer_value,
                "isTITA": is_tita,
                "context": current_context,
                "source": Path(filepath).stem,
            }
        )

    return questions


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    html_files = sorted(HTML_DIR.glob("*.html"))
    print(f"Found {len(html_files)} HTML files\n")

    all_questions = []
    for filepath in html_files:
        print(f"  Parsing {filepath.name}...")
        qs = parse_html_file(str(filepath))
        print(f"    -> {len(qs)} questions")
        all_questions.extend(qs)

    # Build topic index
    topic_map = {}
    for q in all_questions:
        key = (q["section"], q["topic"])
        if key not in topic_map:
            topic_map[key] = {
                "section": q["section"],
                "topic": q["topic"],
                "count": 0,
                "years": set(),
            }
        topic_map[key]["count"] += 1
        topic_map[key]["years"].add(q["year"])

    topics = [
        {
            "section": t["section"],
            "topic": t["topic"],
            "count": t["count"],
            "years": sorted(t["years"]),
        }
        for t in sorted(topic_map.values(), key=lambda x: (x["section"], -x["count"]))
    ]

    output = {
        "questions": all_questions,
        "topics": topics,
        "total": len(all_questions),
        "generated": datetime.now().isoformat(),
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nTotal: {len(all_questions)} questions -> {OUTPUT_FILE}")
    print(f"\nTopics ({len(topics)}):")
    for t in topics:
        yrs = ", ".join(map(str, t["years"]))
        print(f"  [{t['section']:5s}] {t['topic']:<40s} {t['count']:3d} questions  ({yrs})")


if __name__ == "__main__":
    main()
