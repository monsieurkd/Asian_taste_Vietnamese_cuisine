# Mockup sources

Provenance for everything under `docs/DESIGN/mockups/`. The rule, from
[`README.md`](README.md): an export with no link back to its source is a dead
end the moment it needs updating.

| Surface | Tool | Link | Owner | Exported at |
|---|---|---|---|---|
| customer + admin + tokens | Open Design | this repo — the HTML set at [`src/`](src/) | design session | 2026-09-15 · HTML committed; PNG export pending |
| dish photos | Uber Eats store listing | https://www.ubereats.com/au/store/asian-taste/h_fV3HtmRTqW6In7OlIKWA | Asian Taste (merchant photos) | 2026-09-15 · see [`src/assets/dishes/SOURCES.md`](src/assets/dishes/SOURCES.md) |

## How the exports are made

The committed artifact at this stage is the **HTML set** in [`src/`](src/) — a
clickable specification. PNG exports come from it. Serve the folder and capture
at the naming rule in [`README.md`](README.md):

```bash
python3 -m http.server 8080        # run from docs/DESIGN/mockups/src
# open http://localhost:8080/index.html
```

Naming: `<app>-<screen>-<state>-<width>.png`, 2× where practical, <500 KB,
ASCII-safe. The `state` segment is not optional — `cart-empty` and `cart-filled`
are different designs.

## Pending

No PNG exports are committed yet. Ratify the set first (see [`README.md`](README.md)
§Ratification and [`HANDOFF.md`](HANDOFF.md) §10), then export and record the
commit each export was taken at in the table above.
