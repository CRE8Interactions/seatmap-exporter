const fs = require("fs");
const path = require("path");

function loadSvgInput(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".svgqc") {
    const parsed = JSON.parse(raw);
    if (!parsed.svg || typeof parsed.svg !== "string") {
      throw new Error(`${filePath} is not a valid .svgqc file (missing svg field)`);
    }
    return parsed.svg;
  }

  if (ext === ".svg" || raw.includes("<svg")) {
    return raw;
  }

  throw new Error(`Unsupported input format: ${ext || "unknown"}`);
}

function loadUploadedSvg(file) {
  const raw = file.buffer.toString("utf8");
  const ext = path.extname(file.originalname || "").toLowerCase();
  if (ext === ".svgqc") {
    const parsed = JSON.parse(raw);
    if (!parsed.svg) throw new Error("Invalid .svgqc file.");
    return parsed.svg;
  }
  return raw;
}

module.exports = { loadSvgInput, loadUploadedSvg };
