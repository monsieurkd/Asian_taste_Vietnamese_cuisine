#!/usr/bin/env python3
"""
Layout checks for docs/schema.svg — the things a structural check cannot see.

`check-schema-diagram.py` proves the file is well-formed and contains every
table. It does not prove the diagram is *readable*. These are the layout failures
that actually happen when a box moves:

  * two tables overlapping, so one hides the other
  * a table's text overflowing its box, so a column type is clipped
  * a relationship edge terminating in empty space because an anchor moved

    python3 scripts/check-schema-layout.py
"""

import re
import sys
from pathlib import Path

SVG = Path(__file__).resolve().parent.parent / "docs" / "schema.svg"
text = SVG.read_text()

failures = []


def check(label, ok, detail=""):
    print(f"  {'ok  ' if ok else 'FAIL'} {label}{(' — ' + detail) if detail and not ok else ''}")
    if not ok:
        failures.append(label)


# Recover the geometry the generator emitted, keyed on each table's HEADER rather
# than its rect.
#
# This matters: the SVG draws each table as a coloured header band, a header
# label, and two border rects (one before the rows, one after, so the band's
# corners are clean). Collecting rects and de-duplicating by (x, y) collapsed two
# tables that share coordinates into ONE box, which made an overlap invisible —
# a mutation moving `admin_users` on top of `orders` passed the overlap check.
# Anchoring on the white header text gives exactly one box per table.
boxes = []
for m in re.finditer(
    r'<text x="([\d.]+)" y="([\d.]+)" font-size="13" font-weight="700" '
    r'fill="#ffffff" text-anchor="middle">(\w+)</text>',
    text,
):
    cx, ty, name = float(m.group(1)), float(m.group(2)), m.group(3)
    # Recover the box from the label: centred, with the band starting 20px above.
    found = None
    for r in re.finditer(
        r'<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="7"', text
    ):
        x, y, w, h = (float(g) for g in r.groups())
        if abs((x + w / 2) - cx) < 1.5 and abs(y + 20 - ty) < 1.5:
            found = (x, y, w, h)
            break
    if found:
        boxes.append(found)

names = re.findall(
    r'font-size="13" font-weight="700" fill="#ffffff"[^>]*>(\w+)</text>', text
)
check("tables recovered from the SVG", len(boxes) >= 15, f"found {len(boxes)} boxes for {len(names)} headers")
check("every table header has a matching box", len(boxes) == len(names),
      f"{len(names)} headers vs {len(boxes)} boxes")

# 1. No two tables overlap. An overlap means one diagram is hiding another, and
#    it is invisible in a structural check.
overlaps = []
for i, (ax, ay, aw, ah) in enumerate(boxes):
    for bx, by, bw, bh in boxes[i + 1:]:
        if ax < bx + bw and bx < ax + aw and ay < by + bh and by < ay + ah:
            overlaps.append(f"({ax:.0f},{ay:.0f}) overlaps ({bx:.0f},{by:.0f})")
check("no two tables overlap", not overlaps, "; ".join(overlaps[:3]))

# 2. Every table fits inside the canvas.
vb = re.search(r'viewBox="([\d.\s]+)"', text)
cw, ch = (float(vb.group(1).split()[2]), float(vb.group(1).split()[3])) if vb else (0, 0)
outside = [
    f"({x:.0f},{y:.0f})"
    for x, y, w, h in boxes
    if x < 0 or y < 0 or x + w > cw + 1 or y + h > ch + 1
]
check("every table is fully inside the canvas", not outside, "; ".join(outside[:3]))

# 3. No type annotation overflows its table's right edge. A clipped type like
#    "DECIMAL(10," is worse than omitting the column, because it reads as a real
#    type rather than as truncation.
#
#    Only right-aligned text is examined — that is, the monospace type annotations
#    (they carry text-anchor="end"). Everything else is left-aligned and flows
#    rightward from its x, so measuring it with the same rule produced false
#    positives: the first version of this check reported "PK overlaps the name
#    column" for text that is drawn at x=51 with a 13px width, ending at 64, well
#    clear of the name column starting at 74.
overflow = []
tables = sorted({(x, y, w, h) for x, y, w, h in boxes}, key=lambda b: (b[1], b[0]))
for tx in re.finditer(
    r'<text x="([\d.]+)" y="([\d.]+)"[^>]*text-anchor="end"[^>]*>(.*?)</text>', text
):
    x, y, body = float(tx.group(1)), float(tx.group(2)), tx.group(3)
    label = re.sub(r"<[^>]+>", "", body)
    if not label.strip():
        continue
    # Monospace at 11.5px is ~6.6px per character; measure from the right edge
    # leftward, which is where right-aligned text grows.
    width = len(label) * 6.6
    for txx, tyy, tww, thh in tables:
        if tyy <= y <= tyy + thh and txx <= x <= txx + tww:
            # The name column occupies txx+34 onward; a type annotation must not
            # reach into it.
            if x - width < txx + 34:
                overflow.append(f"{label!r} spans {x-width:.0f}..{x:.0f}, name column starts at {txx+34:.0f}")
            break
check("no type annotation collides with its column name", not overflow, "; ".join(overflow[:3]))

# 4. Edges terminate on a table edge, not in whitespace. Each relationship path
#    ends at a coordinate that should sit on some box's border.
#
#    The relationship edges are the paths carrying the arrowhead marker. Scoping to
#    those matters: the <marker> definition and the header-band paths also use
#    <path>, so matching every path picked up 27 candidates for 11 relationships
#    and reported nonsense endpoints like (0,10) — the arrowhead's own geometry.
#
#    The route is emitted as "M x y [HV] …" commands, so the END POINT is not
#    simply the last two numbers: "M 308 328 H 344 V 290 H 380" ends at (380, 290),
#    not (290, 380). Taking the final pair reported three edges as dangling that
#    are correctly anchored. This walks the commands instead.
def path_end(d):
    x = y = 0.0
    for cmd, nums in re.findall(r"([MHV])\s*(-?[\d.]+(?:\s+-?[\d.]+)*)", d):
        vals = [float(v) for v in nums.split()]
        if cmd == "M":
            x, y = vals[0], vals[1]
        elif cmd == "H":
            x = vals[0]
        elif cmd == "V":
            y = vals[0]
    return x, y


paths = []
for tag in re.findall(r"<path [^>]*>", text):
    if 'marker-end="url(#ah)"' not in tag:
        continue
    d = re.search(r'd="([^"]*)"', tag)
    if not d:
        continue
    paths.append(path_end(d.group(1)))

check("relationship edges found to check", len(paths) >= 10, f"matched {len(paths)}")

dangling = []
for ex, ey in paths:
    on_edge = any(
        (
            (abs(ex - x) < 1.5 or abs(ex - (x + w)) < 1.5) and y - 1.5 <= ey <= y + h + 1.5
        )
        or (
            (abs(ey - y) < 1.5 or abs(ey - (y + h)) < 1.5) and x - 1.5 <= ex <= x + w + 1.5
        )
        for x, y, w, h in boxes
    )
    if not on_edge:
        dangling.append(f"ends at ({ex:.0f},{ey:.0f})")
check(f"every relationship edge lands on a table ({len(paths)} edges)", not dangling,
      "; ".join(dangling[:3]))

print()
if failures:
    print(f"FAILED: {len(failures)} check(s)")
    sys.exit(1)
print("PASS: the schema diagram layout is readable")
