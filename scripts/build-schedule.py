#!/usr/bin/env python3
"""
Convert the interpreter schedule (.docx) into public/data/schedule.json

Usage:
    pip install python-docx
    python scripts/build-schedule.py "path/to/New_Updated_interpreter_Schedule.docx"

Privacy: student and faculty names are deliberately NOT copied into the JSON,
because the file is served publicly with the site. Only what is needed to
compute availability is kept (interpreter, day, start, end, course).
"""
import json
import re
import sys
from pathlib import Path

from docx import Document

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
TIME = re.compile(r"^\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m)?\s*$", re.I)


def clean(text):
    text = (text or "").replace("*", "")
    return re.sub(r"\s+", " ", text).strip()


def to_minutes(h, m, ap):
    h = int(h) % 12
    if ap == "pm":
        h += 12
    return h * 60 + int(m or 0)


def parse_range(text):
    """'8:00 Am - 9:30' -> (480, 570).  Handles missing am/pm on either side."""
    parts = re.split(r"\s*[-\u2013\u2014]\s*", text.strip())
    parts = [p for p in parts if p]
    if len(parts) != 2:
        raise ValueError(f"cannot split time range: {text!r}")
    a, b = (TIME.match(p) for p in parts)
    if not a or not b:
        raise ValueError(f"cannot read times: {text!r}")
    ap_a = (a.group(3) or "").lower() or None
    ap_b = (b.group(3) or "").lower() or None
    a_inferred, b_inferred = ap_a is None, ap_b is None
    if a_inferred and ap_b:
        ap_a = ap_b
    if b_inferred and ap_a:
        ap_b = ap_a
    start = to_minutes(a.group(1), a.group(2), ap_a)
    end = to_minutes(b.group(1), b.group(2), ap_b)
    if end <= start and a_inferred:
        start -= 12 * 60
    elif end <= start and b_inferred:
        end += 12 * 60
    if end <= start:
        raise ValueError(f"end before start: {text!r}")
    return start, end


def parse_time_cell(text):
    """A cell may hold two ranges separated by '/'."""
    return [parse_range(chunk) for chunk in re.split(r"\s*/\s*", clean(text)) if chunk.strip()]


def hhmm(minutes):
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def main(path):
    doc = Document(path)
    table = doc.tables[0]
    day = None
    assignments, unassigned, warnings = [], [], []

    for row in table.rows[1:]:
        cells = [clean(c.text) for c in row.cells]
        if len(cells) < 6:
            continue
        d, course, _location, time_text, _student, interpreter = cells[:6]
        if d:
            match = next((x for x in DAYS if x.lower() == d.lower()), None)
            if not match:
                warnings.append(f"Unknown day {d!r}")
                continue
            day = match
        if not course and not time_text:
            continue  # blank spacer row
        if not time_text:
            warnings.append(f"{day}: {course!r} has no time, skipped")
            continue
        try:
            ranges = parse_time_cell(time_text)
        except ValueError as err:
            warnings.append(f"{day}: {course!r}: {err}")
            continue

        name = interpreter if re.search(r"[A-Za-z]", interpreter) else None
        for start, end in ranges:
            item = {"day": day, "start": hhmm(start), "end": hhmm(end), "course": course}
            if name:
                assignments.append({"interpreter": name.title(), **item})
            else:
                unassigned.append(item)

    interpreters = sorted({a["interpreter"] for a in assignments})
    out = {
        "interpreters": interpreters,
        "assignments": assignments,
        "unassigned": unassigned,
    }
    target = Path(__file__).resolve().parent.parent / "public" / "data" / "schedule.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")

    print(f"Interpreters: {', '.join(interpreters)}")
    print(f"Assignments: {len(assignments)}   Unassigned classes: {len(unassigned)}")
    for w in warnings:
        print("WARNING:", w)
    print(f"Wrote {target}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
