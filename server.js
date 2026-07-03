const express = require("express");
const multer = require("multer");
const path = require("path");
const { DOMParser } = require("@xmldom/xmldom");
const { parseSeatmap } = require("./src/parseSeatmap");
const { loadUploadedSvg } = require("./src/loadInput");
const { generateBackgroundSvg } = require("./src/generateBackground");
const { getSvgDimensions } = require("./src/svgDimensions");
const { renderBackgroundPng } = require("./src/renderBackgroundPng");
const { generateSectionHighlights } = require("./src/generateSectionHighlights");

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const PORT = process.env.PORT || 3939;
const publicDir = path.join(__dirname, "public");

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/process", upload.single("svg"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "SVG file is required." });
    }

    const svgString = loadUploadedSvg(req.file);
    const gaSpots = parseInt(req.body.gaSpots || "0", 10) || 0;
    const { mapping, stats } = parseSeatmap(svgString, { gaSpots });
    const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
    const dimensions = getSvgDimensions(doc);
    const { svg: backgroundSvg } = generateBackgroundSvg(svgString);

    let backgroundPng = null;
    let pngWidth = null;
    let pngHeight = null;
    let backgroundPngBuffer = null;
    try {
      const pngResult = renderBackgroundPng(svgString);
      backgroundPngBuffer = pngResult.png;
      backgroundPng = pngResult.png.toString("base64");
      pngWidth = pngResult.width;
      pngHeight = pngResult.height;
    } catch (pngError) {
      stats.backgroundPngError = pngError.message;
    }

    let sectionHighlights = null;
    if (backgroundPngBuffer) {
      try {
        const highlights = generateSectionHighlights({
          mapping,
          dimensions,
          backgroundPng: backgroundPngBuffer,
        });
        sectionHighlights = Object.fromEntries(
          Object.entries(highlights).map(([filename, png]) => [
            filename.replace(/\.png$/i, ""),
            png.toString("base64"),
          ])
        );
        stats.sectionHighlightCount = Object.keys(sectionHighlights).length;
      } catch (highlightError) {
        stats.sectionHighlightError = highlightError.message;
      }
    }

    res.json({
      mapping,
      stats,
      dimensions: {
        ...dimensions,
        pngWidth,
        pngHeight,
      },
      backgroundSvg,
      backgroundPng,
      sectionHighlights,
    });
  } catch (error) {
    res.status(500).json({ error: error.message || "Failed to process SVG." });
  }
});

app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.error(`seatmap-export preview: http://0.0.0.0:${PORT}`);
});
