# seatmap-export

Convert Blocktickets seatmap SVG files into the JSON mapping format used by admin, frontend, and box office.

No web UI — just a CLI:

```bash
npm install
node bin/export.js path/to/map.svg -o mapping.json --stats
```

## Input formats

- `.svg` — standard seatmap SVG
- `.svgqc` — svg-map-checker project file (embedded SVG is extracted automatically)

### Blocktickets SVG (preferred)

The SVG should use Blocktickets seat naming:

- Sections: `class="sec-101 YZ"` or `id="sec-ga_NZ"`
- Rows: `class="sec-101-row-9"`
- Seats: `<rect class="sec-101-row-9-seat-12" x="..." y="..." width="..." height="..." />`

Table sections (sec-1 … sec-12), bowl sections (sec-101+), and GA sections (`sec-ga_NZ`) are supported.

### Raw Illustrator / Figma exports

If the SVG has no `sec-*` groups, the exporter falls back to a spatial parser for Pan American Center-style maps:

- Blue section polygons (`fill="#3358D4"`, white stroke) → bowl sections
- Blue circle path groups → bowl seats
- Blue floor rects → table seats (clustered into sec-1 … sec-24)
- GA floor polygon → `ga` NZ section with optional `--ga-spots`
- White vector label paths inside each section → `identifier.path` for admin rendering

Bowl section numbers are matched against `svg-map-checker/public/pa-mexican-concert-wo-200.svgqc` by geometry when that reference file is present.

## Output

Writes a JSON object with `sections`, `rows`, and `seats` — the same shape stored in Strapi as `seatmap.mapping`.

Upload that JSON plus a PNG background image to create a seatmap in admin.

Section highlight PNGs (for the purchase flow `ViewSwiper`) can be generated with `--highlights-dir`. Upload them to your CDN at `venues/<venue-slug>/highlights/<section-number>.png`.

## Options

| Flag | Description |
|------|-------------|
| `-o, --output` | Output file (default: stdout) |
| `--ga-spots N` | Add `spots: [uuid, ...]` to each NZ/GA section |
| `--hotspot-x`, `--hotspot-y` | Place a sell-order hotspot in SVG coordinates (requires both) |
| `--target-sections` | Comma-separated section UUIDs for multi-floor sell order |
| `--highlights-dir <dir>` | Write one highlight PNG per section |
| `--pretty` | Pretty-print JSON |
| `--stats` | Print section/row/seat counts to stderr |

## Preview UI

Upload an SVG, preview the generated mapping over a stripped background PNG, and download exports:

```bash
npm install
npm run preview
```

Open http://localhost:3939, upload your SVG, and use the preview to verify seat placement before importing JSON + background PNG into admin. The **Section highlights** panel previews and downloads the per-section PNGs used in the purchase flow.

Use the **Sell order** panel to drag a hotspot onto the stage (same workflow as svg_processor). Seats are colored red-to-purple by distance from the hotspot; closest seats sell first. Multi-floor venues can assign sections per floor before placing a hotspot for each floor. Download JSON includes row and section `sortOrder` values ready for admin import.

## CLI export

```bash
node bin/export.js path/to/map.svg -o mapping.json --stats
node bin/export.js map.svg \
  -o mapping.json \
  --background background.png \
  --highlights-dir highlights \
  --background-svg background.svg \
  --meta background-meta.json \
  --ga-spots 500 \
  --pretty \
  --stats
```

`--background` writes a PNG with all `#3358D4` seats and section covers removed (arena/stage/floor art only). Upload that PNG to admin and set width/height from `--meta` output.
