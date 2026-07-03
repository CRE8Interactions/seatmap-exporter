#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { DOMParser } = require("@xmldom/xmldom");
const { loadSvgInput } = require("../src/loadInput");
const { parseSeatmap } = require("../src/parseSeatmap");
const { generateBackgroundSvg } = require("../src/generateBackground");
const { getSvgDimensions } = require("../src/svgDimensions");
const { renderBackgroundPng } = require("../src/renderBackgroundPng");
const { generateSectionHighlights } = require("../src/generateSectionHighlights");
const { prepareMappingForExport } = require("../src/sellOrder");

function usage() {
  console.error(`Usage: seatmap-export <input.svg|.svgqc> [options]

Options:
  -o, --output <file>     Write mapping JSON (default: stdout)
  --background <file.png>   Write background PNG with seats/sections removed
  --background-svg <file> Write stripped background SVG
  --highlights-dir <dir>  Write section highlight PNGs (one per section)
  --meta <file.json>        Write width/height/viewBox metadata JSON
  --ga-spots <number>       Generate GA spot UUIDs for each NZ section
  --hotspot-x <number>      Hotspot X coordinate for sell order (SVG space)
  --hotspot-y <number>      Hotspot Y coordinate for sell order (SVG space)
  --target-sections <ids>   Comma-separated section UUIDs for multi-floor sell order
  --pretty                  Pretty-print JSON
  --stats                   Print parse stats to stderr

Examples:
  seatmap-export venue.svg -o venue-mapping.json --background venue-bg.png --highlights-dir highlights
  seatmap-export map.svgqc --ga-spots 500 -o map.json --stats
  seatmap-export venue.svg -o venue-mapping.json --hotspot-x 1200 --hotspot-y 800
  npm run preview
`);
}

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    background: null,
    backgroundSvg: null,
    highlightsDir: null,
    meta: null,
    gaSpots: 0,
    hotspotX: null,
    hotspotY: null,
    targetSections: null,
    pretty: false,
    stats: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    }
    if (arg === "-o" || arg === "--output") {
      args.output = argv[++i];
      continue;
    }
    if (arg === "--ga-spots") {
      args.gaSpots = parseInt(argv[++i], 10);
      continue;
    }
    if (arg === "--hotspot-x") {
      args.hotspotX = parseFloat(argv[++i]);
      continue;
    }
    if (arg === "--hotspot-y") {
      args.hotspotY = parseFloat(argv[++i]);
      continue;
    }
    if (arg === "--target-sections") {
      args.targetSections = (argv[++i] || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      continue;
    }
    if (arg === "--background") {
      args.background = argv[++i];
      continue;
    }
    if (arg === "--background-svg") {
      args.backgroundSvg = argv[++i];
      continue;
    }
    if (arg === "--highlights-dir") {
      args.highlightsDir = argv[++i];
      continue;
    }
    if (arg === "--meta") {
      args.meta = argv[++i];
      continue;
    }
    if (arg === "--pretty") {
      args.pretty = true;
      continue;
    }
    if (arg === "--stats") {
      args.stats = true;
      continue;
    }
    if (!arg.startsWith("-") && !args.input) {
      args.input = arg;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    usage();
    process.exit(1);
  }

  if (!args.input) {
    usage();
    process.exit(1);
  }

  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = path.resolve(args.input);

  if (!fs.existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }

  const svg = loadSvgInput(inputPath);
  const parseOptions = { gaSpots: args.gaSpots || 0 };

  if (args.hotspotX !== null || args.hotspotY !== null) {
    if (!Number.isFinite(args.hotspotX) || !Number.isFinite(args.hotspotY)) {
      console.error("Both --hotspot-x and --hotspot-y are required for sell order.");
      process.exit(1);
    }
    parseOptions.hotspot = { x: args.hotspotX, y: args.hotspotY };
  }

  if (args.targetSections?.length) {
    parseOptions.targetSectionIds = args.targetSections;
  }

  const { mapping, stats } = parseSeatmap(svg, parseOptions);
  const exportMapping = prepareMappingForExport(mapping);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const dimensions = getSvgDimensions(doc);
  const json = JSON.stringify(exportMapping, null, args.pretty ? 2 : undefined);

  let backgroundPngBuffer = null;

  if (args.background || args.backgroundSvg || args.meta || args.highlightsDir) {
    const { svg: backgroundSvg } = generateBackgroundSvg(svg);
    if (args.backgroundSvg) {
      fs.writeFileSync(path.resolve(args.backgroundSvg), backgroundSvg, "utf8");
      console.error(`Wrote ${args.backgroundSvg}`);
    }
    if (args.background || args.highlightsDir) {
      const { png, width, height } = renderBackgroundPng(svg);
      backgroundPngBuffer = png;
      if (args.background) {
        fs.writeFileSync(path.resolve(args.background), png);
        dimensions.pngWidth = width;
        dimensions.pngHeight = height;
        console.error(`Wrote ${args.background}`);
      }
    }
    if (args.highlightsDir) {
      if (!backgroundPngBuffer) {
        const { png } = renderBackgroundPng(svg);
        backgroundPngBuffer = png;
      }
      const highlightsDir = path.resolve(args.highlightsDir);
      fs.mkdirSync(highlightsDir, { recursive: true });
      const highlights = generateSectionHighlights({
        mapping,
        dimensions,
        backgroundPng: backgroundPngBuffer,
      });
      for (const [filename, png] of Object.entries(highlights)) {
        fs.writeFileSync(path.join(highlightsDir, filename), png);
      }
      console.error(
        `Wrote ${Object.keys(highlights).length} section highlights to ${highlightsDir}`
      );
    }
    if (args.meta) {
      fs.writeFileSync(
        path.resolve(args.meta),
        JSON.stringify(dimensions, null, 2),
        "utf8"
      );
      console.error(`Wrote ${args.meta}`);
    }
  }

  if (args.output) {
    fs.writeFileSync(path.resolve(args.output), json, "utf8");
    if (args.stats) {
      console.error(JSON.stringify({ input: path.basename(inputPath), ...stats }, null, 2));
    }
    console.error(`Wrote ${args.output}`);
  } else {
    process.stdout.write(json);
    if (!json.endsWith("\n")) process.stdout.write("\n");
    if (args.stats) {
      console.error(JSON.stringify(stats, null, 2));
    }
  }
}

main();
