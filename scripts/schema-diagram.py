#!/usr/bin/env python3
"""
Generate docs/schema.svg — the ERD the README displays.

Why a generator rather than a checked-in PNG: the diagram is derived from the
migrations, so it goes stale the moment a column is added. Keeping the generator
in the repo means the picture can be regenerated instead of redrawn by hand and
quietly becoming wrong — which is what a schema diagram does if nothing forces it
to stay honest.

    python3 scripts/schema-diagram.py

It emits SVG because GitHub renders SVG inline in a README: it stays crisp at any
zoom, and it diffs as text rather than as a binary blob.

The layout is hand-placed rather than auto-generated. Tables are grouped into
domains (menu / order / customer / sync / config) because that grouping is the
thing a reader needs, and a generic graph layout throws it away.
"""

from pathlib import Path
import html

OUT = Path(__file__).resolve().parent.parent / "docs" / "schema.svg"

INK = "#1f2328"
MUTED = "#6b7280"
CANVAS = "#ffffff"

# Colour encodes domain, not decoration: a reader should be able to tell the menu
# side from the money side without reading a single label.
DOMAINS = {
    "menu": {"fill": "#eef6ff", "stroke": "#4a7fb5", "label": "Menu catalogue"},
    "order": {"fill": "#fff4e8", "stroke": "#b5762f", "label": "Order & payment"},
    "customer": {"fill": "#eefaf1", "stroke": "#2f8f55", "label": "Customer"},
    "sync": {"fill": "#f4eefc", "stroke": "#7a4fb5", "label": "POS & webhook"},
    "config": {"fill": "#f2f4f7", "stroke": "#6b7280", "label": "Configuration"},
}

# name: (domain, x, y, [(column, type, key)])
# key: "pk" primary, "fk" foreign, "uq" unique, "" plain.
# Only the columns that matter for reading the relationships are drawn — the
# full column list is in Data/Migrations/*.sql, and a diagram that repeats every
# audit column is one nobody reads.
#
# Geometry: a box is 268 wide and `30 + cols*19 + 8` tall, so a 10-column table is
# 228px. The rows below are spaced with that in mind — `scripts/check-schema-layout.py`
# fails on any overlap, which is how the first draft's collisions were found.
#
# Layout is by column, left to right, following the data's own direction:
#   x=40   the menu spine, then customer, then the order spine
#   x=380  the modifiers and payment-detail branches
#   x=720  the leaf tables
#   x=1060 the integration/sync leaf, clear of everything else
T = {
    "categories": ("menu", 40, 60, [
        ("id", "SERIAL", "pk"), ("name", "VARCHAR(255)", ""),
        ("display_order", "INT", ""), ("is_active", "BOOLEAN", ""),
    ]),
    "menu_items": ("menu", 40, 214, [
        ("id", "SERIAL", "pk"), ("category_id", "INT", "fk"),
        ("name", "VARCHAR(255)", ""), ("base_price", "DECIMAL(10,2)", ""),
        ("is_available", "BOOLEAN", ""), ("is_popular", "BOOLEAN", ""),
        ("is_gluten_free", "BOOLEAN", ""), ("is_vegetarian", "BOOLEAN", ""),
        ("is_vegan", "BOOLEAN", ""), ("spicy_level", "INT", ""),
    ]),
    "modifier_groups": ("menu", 380, 214, [
        ("id", "SERIAL", "pk"), ("menu_item_id", "INT", "fk"),
        ("name", "VARCHAR(255)", ""), ("is_required", "BOOLEAN", ""),
        ("min_select", "INT", ""), ("max_select", "INT", ""),
    ]),
    "modifiers": ("menu", 720, 300, [
        ("id", "SERIAL", "pk"), ("modifier_group_id", "INT", "fk"),
        ("name", "VARCHAR(255)", ""), ("price_adjustment", "DECIMAL(10,2)", ""),
        ("is_available", "BOOLEAN", ""),
    ]),

    "customers": ("customer", 40, 470, [
        ("id", "SERIAL", "pk"), ("customer_number", "VARCHAR(20)", "uq"),
        ("email_normalized", "VARCHAR(255)", "uq"), ("phone", "VARCHAR(50)", ""),
        ("is_guest", "BOOLEAN", ""), ("email_verified", "BOOLEAN", ""),
        ("last_order_at", "TIMESTAMP", ""),
    ]),
    "customer_payment_methods": ("customer", 380, 470, [
        ("id", "SERIAL", "pk"), ("customer_id", "INT", "fk"),
        ("payment_method_token", "VARCHAR(255)", ""), ("card_last_four", "VARCHAR(4)", ""),
        ("card_brand", "VARCHAR(50)", ""), ("is_default", "BOOLEAN", ""),
    ]),

    "orders": ("order", 40, 760, [
        ("id", "SERIAL", "pk"), ("order_number", "VARCHAR(20)", "uq"),
        ("customer_id", "INT", "fk"), ("customer_email", "VARCHAR(255)", ""),
        ("order_type", "order_type", ""), ("status", "order_status", ""),
        ("subtotal", "DECIMAL(10,2)", ""), ("tax", "DECIMAL(10,2)", ""),
        ("total", "DECIMAL(10,2)", ""), ("payment_method", "payment_method", ""),
        ("payment_status", "payment_status", ""), ("paid_amount", "DECIMAL(10,2)", ""),
        ("payment_intent_id", "VARCHAR(255)", ""),
    ]),
    "order_items": ("order", 380, 760, [
        ("id", "SERIAL", "pk"), ("order_id", "INT", "fk"),
        ("menu_item_id", "INT", "fk"), ("menu_item_name", "VARCHAR(255)", ""),
        ("quantity", "INT", ""), ("unit_price", "DECIMAL(10,2)", ""),
        ("total_price", "DECIMAL(10,2)", ""),
    ]),
    "order_item_modifiers": ("order", 720, 760, [
        ("id", "SERIAL", "pk"), ("order_item_id", "INT", "fk"),
        ("modifier_id", "INT", "fk"), ("modifier_name", "VARCHAR(255)", ""),
        ("price_adjustment", "DECIMAL(10,2)", ""),
    ]),
    "order_attempts": ("order", 380, 990, [
        ("id", "SERIAL", "pk"), ("customer_id", "INT", "fk"),
        ("cart_snapshot", "JSONB", ""), ("attempt_status", "VARCHAR(50)", ""),
        ("failure_reason", "TEXT", ""),
    ]),

    "webhook_event_log": ("sync", 720, 60, [
        ("id", "SERIAL", "pk"), ("event_id", "VARCHAR(255)", "uq"),
        ("event_type", "VARCHAR(100)", ""), ("related_order_id", "INT", "fk"),
        ("processing_success", "BOOLEAN", ""), ("processing_attempts", "INT", ""),
        ("received_at", "TIMESTAMPTZ", ""), ("processed_at", "TIMESTAMPTZ", ""),
    ]),
    "lightspeed_tokens": ("sync", 1060, 60, [
        ("id", "SERIAL", "pk"), ("account_id", "VARCHAR(255)", ""),
        ("access_token", "TEXT", ""), ("refresh_token", "TEXT", ""),
        ("expires_at", "TIMESTAMP", ""), ("is_active", "BOOLEAN", ""),
    ]),

    "admin_users": ("config", 720, 990, [
        ("id", "SERIAL", "pk"), ("username", "VARCHAR(100)", "uq"),
        ("email", "VARCHAR(255)", "uq"), ("role", "VARCHAR(50)", ""),
        ("last_login_at", "TIMESTAMP", ""),
    ]),
    "restaurant_settings": ("config", 40, 1120, [
        ("id", "SERIAL", "pk"), ("key", "VARCHAR(100)", "uq"),
        ("value", "TEXT", ""), ("category", "VARCHAR(50)", ""),
    ]),
    "operating_hours": ("config", 380, 1200, [
        ("id", "SERIAL", "pk"), ("day_of_week", "SMALLINT", "uq"),
        ("open_time", "TIME", ""), ("close_time", "TIME", ""),
        ("is_closed", "BOOLEAN", ""),
    ]),
}

# (from, to, from_side, to_side). Sides: r right edge, l left, t top, b bottom.
E = [
    ("categories", "menu_items", "b", "t"),
    ("menu_items", "modifier_groups", "r", "l"),
    ("modifier_groups", "modifiers", "r", "l"),
    ("customers", "customer_payment_methods", "r", "l"),
    ("customers", "orders", "b", "t"),
    ("orders", "order_items", "r", "l"),
    ("order_items", "order_item_modifiers", "b", "t"),
    ("menu_items", "order_items", "b", "t"),
    ("modifiers", "order_item_modifiers", "b", "t"),
    ("customers", "order_attempts", "r", "l"),
    ("orders", "webhook_event_log", "r", "b"),
]

W, ROW, PAD, HDR = 268, 19, 8, 30
FSS = 11.5


def box(name):
    dom, x, y, cols = T[name]
    return x, y, W, HDR + len(cols) * ROW + PAD


def anchor(name, side):
    x, y, w, h = box(name)
    return {
        "r": (x + w, y + h / 2), "l": (x, y + h / 2),
        "t": (x + w / 2, y), "b": (x + w / 2, y + h),
    }[side]


def esc(s):
    return html.escape(str(s))


def route(a, b, sa, sb):
    """Two-bend orthogonal route, so no line cuts diagonally across a table."""
    (ax, ay), (bx, by) = a, b
    if sa in ("l", "r"):
        mx = (ax + bx) / 2
        return f"M {ax} {ay} H {mx} V {by} H {bx}"
    my = (ay + by) / 2
    return f"M {ax} {ay} V {my} H {bx} V {by}"


def build():
    maxx = max(box(n)[0] + box(n)[2] for n in T) + 60
    maxy = max(box(n)[1] + box(n)[3] for n in T) + 90

    o = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {maxx:.0f} {maxy:.0f}" '
        f'width="{maxx:.0f}" height="{maxy:.0f}" role="img" '
        f'aria-label="Database schema for the Asian Taste ordering system">',
        f'<rect width="{maxx:.0f}" height="{maxy:.0f}" fill="{CANVAS}"/>',
        f'<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
        f'markerHeight="7" orient="auto-start-reverse">'
        f'<path d="M 0 0 L 10 5 L 0 10 z" fill="{MUTED}"/></marker></defs>',
        f'<g font-family="ui-sans-serif,-apple-system,Segoe UI,Helvetica,Arial,sans-serif">',
    ]

    # Edges before boxes, so the boxes paint over the line ends.
    for f, t, sa, sb in E:
        o.append(
            f'<path d="{route(anchor(f, sa), anchor(t, sb), sa, sb)}" fill="none" '
            f'stroke="{MUTED}" stroke-width="1.4" marker-end="url(#ah)" opacity="0.7"/>'
        )

    for name, (dom, x, y, cols) in T.items():
        _, _, w, h = box(name)
        c = DOMAINS[dom]
        o.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{c["fill"]}" '
            f'stroke="{c["stroke"]}" stroke-width="1.6"/>'
        )
        o.append(
            f'<path d="M {x} {y+7} a 7 7 0 0 1 7 -7 h {w-14} a 7 7 0 0 1 7 7 v {HDR-7} h -{w} z" '
            f'fill="{c["stroke"]}"/>'
        )
        o.append(
            f'<text x="{x+w/2}" y="{y+20}" font-size="13" font-weight="700" '
            f'fill="#ffffff" text-anchor="middle">{esc(name)}</text>'
        )

        for i, (col, typ, key) in enumerate(cols):
            cy = y + HDR + i * ROW + 13
            if key == "pk":
                o.append(f'<text x="{x+11}" y="{cy}" font-size="{FSS}" fill="{INK}" font-weight="700">PK</text>')
            elif key == "fk":
                o.append(f'<text x="{x+11}" y="{cy}" font-size="{FSS}" fill="#8a5a00" font-weight="700">FK</text>')
            elif key == "uq":
                o.append(f'<text x="{x+11}" y="{cy}" font-size="{FSS}" fill="#0a6c3d" font-weight="700">UQ</text>')
            o.append(f'<text x="{x+34}" y="{cy}" font-size="{FSS}" fill="{INK}">{esc(col)}</text>')
            o.append(
                f'<text x="{x+w-11}" y="{cy}" font-size="{FSS}" fill="{MUTED}" text-anchor="end" '
                f'font-family="ui-monospace,SFMono-Regular,Menlo,monospace">{esc(typ)}</text>'
            )

        # Redraw the border so the header band's corners are clean.
        o.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="none" '
            f'stroke="{c["stroke"]}" stroke-width="1.6"/>'
        )

    # Legend: what the colours mean, and what the key markers mean.
    ly = maxy - 44
    lx = 40
    o.append(f'<text x="{lx}" y="{ly-10}" font-size="12" font-weight="700" fill="{INK}">Domain</text>')
    for c in DOMAINS.values():
        o.append(f'<rect x="{lx}" y="{ly}" width="12" height="12" rx="3" fill="{c["fill"]}" stroke="{c["stroke"]}"/>')
        o.append(f'<text x="{lx+18}" y="{ly+10}" font-size="{FSS}" fill="{INK}">{esc(c["label"])}</text>')
        lx += 18 + len(c["label"]) * 6.4 + 24
    o.append(
        f'<text x="{maxx-40}" y="{ly+10}" font-size="{FSS}" fill="{MUTED}" text-anchor="end">'
        f'PK primary key · FK foreign key · UQ unique · all FKs are 1:N</text>'
    )

    o.append("</g></svg>")
    return "\n".join(o)


if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    svg = build()
    OUT.write_text(svg)
    print(f"wrote {OUT} ({len(svg)} bytes)")
