#!/usr/bin/env python3
"""
Sanity-check docs/schema.svg.

A diagram that fails to parse, or that silently lost a table, is worse than no
diagram: it looks authoritative and is wrong. This asserts the structural things
that can break without anyone noticing — well-formed XML, every table in the
migrations present as a labelled box, and a sane viewBox.

    python3 scripts/check-schema-diagram.py

Kept separate from the generator so it can also run as a guardrail.
"""

import re
import sys
from pathlib import Path

# XML parsing is done with a hand-rolled scanner rather than xml.etree, because
# this machine's default python3 (Homebrew) is built without `pyexpat`, and
# ElementTree raises "No module named expat" there. A guardrail that only runs
# under one particular interpreter is a guardrail that stops being run.
#
# The checks below need very little from a parser: tag names, the viewBox, and
# rect geometry. Regex over a well-formed document is sufficient, and it works
# everywhere.

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "docs" / "schema.svg"
MIGRATIONS = ROOT / "src" / "AsianTaste.API" / "Data" / "Migrations"

failures = []


def check(label, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{(' — ' + detail) if detail and not ok else ''}")
    if not ok:
        failures.append(label)


text = SVG.read_text()

# 1. It is an SVG element and the document is closed. GitHub renders a truncated
#    or non-SVG file as nothing at all, which is a silent failure.
check("docs/schema.svg opens with an <svg> element", text.lstrip().startswith("<svg"))
check("the document is closed", text.rstrip().endswith("</svg>"))

# 2. Balanced tags for the elements we emit. Catches a generator bug that drops a
#    closing tag, which would make the whole diagram disappear.
for tag in ("svg", "g", "defs", "marker"):
    opens = len(re.findall(rf"<{tag}[\s>]", text))
    closes = len(re.findall(rf"</{tag}>", text))
    check(f"<{tag}> tags are balanced ({opens})", opens == closes, f"{opens} open vs {closes} close")

# 3. A usable viewBox — without one the diagram scales to nothing.
m = re.search(r'viewBox="([^"]+)"', text)
parts = m.group(1).split() if m else []
check("viewBox declares four numbers", len(parts) == 4, f"got {m.group(1) if m else None!r}")
try:
    w, h = float(parts[2]), float(parts[3])
    check("viewBox has non-zero width and height", w > 0 and h > 0, f"{w}x{h}")
except (IndexError, ValueError):
    w = h = 0
    check("viewBox has non-zero width and height", False, "unparseable")

# 4. Every table the migrations create is drawn. This is the check that catches
#    the real failure mode: someone adds a table, does not regenerate, and the
#    diagram quietly stops being the schema.
sql = "\n".join(p.read_text() for p in sorted(MIGRATIONS.glob("*.sql")))
created = set(re.findall(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)", sql))
labels = set(re.findall(r"<text[^>]*>([A-Za-z_][A-Za-z0-9_]*)</text>", text))
missing = sorted(created - labels)
check(f"all {len(created)} migrated tables appear in the diagram", not missing,
      f"missing: {', '.join(missing)}")

# 5. Foreign keys are drawn as edges, not merely listed.
edge_count = len(re.findall(r'marker-end="url\(#ah\)"', text))
check(f"relationship edges drawn ({edge_count})", edge_count >= 10,
      "expected at least 10; the ERD has lost its connecting lines")

# 6. Nothing drawn below the canvas — an invisible box is a silent omission.
overflow = []
for y_s, h_s in re.findall(r'<rect x="[\d.]+" y="([\d.]+)"[^>]*height="([\d.]+)"', text):
    if float(y_s) + float(h_s) > h + 1:
        overflow.append(f"y+h={float(y_s) + float(h_s):.0f} > {h:.0f}")
check("no box is drawn below the canvas", not overflow, "; ".join(overflow[:3]))

print()
if failures:
    print(f"FAILED: {len(failures)} check(s)")
    sys.exit(1)
print("PASS: the schema diagram is well-formed and covers every table")
