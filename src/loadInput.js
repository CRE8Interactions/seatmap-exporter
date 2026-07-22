const fs = require("fs");
const path = require("path");

function parseSvgProject(raw, ext, label) {
  if (ext === ".svgqc") {
    const parsed = JSON.parse(raw);
    if (!parsed.svg || typeof parsed.svg !== "string") {
      throw new Error(`${label} is not a valid .svgqc file (missing svg field)`);
    }
    return {
      svg: parsed.svg,
      capacities:
        parsed.capacities && typeof parsed.capacities === "object"
          ? parsed.capacities
          : {},
    };
  }

  if (ext === ".svg" || raw.includes("<svg")) {
    return { svg: raw, capacities: {} };
  }

  throw new Error(`Unsupported input format: ${ext || "unknown"}`);
}

function loadSvgProject(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const ext = path.extname(filePath).toLowerCase();
  return parseSvgProject(raw, ext, filePath);
}

function loadSvgInput(filePath) {
  return loadSvgProject(filePath).svg;
}

function loadUploadedProject(file) {
  const raw = file.buffer.toString("utf8");
  const ext = path.extname(file.originalname || "").toLowerCase();
  return parseSvgProject(raw, ext, file.originalname || "Uploaded file");
}

function loadUploadedSvg(file) {
  return loadUploadedProject(file).svg;
}

module.exports = {
  loadSvgInput,
  loadSvgProject,
  loadUploadedProject,
  loadUploadedSvg,
};
