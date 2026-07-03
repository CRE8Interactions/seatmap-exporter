const { pathBounds } = require("./pathGeometry");
const { renderSvgToPng } = require("./renderSvgToPng");

const DEFAULT_SECTION_FILL = "#E6E8EC";
const DEFAULT_SECTION_STROKE = "#E6E8EC";
const HIGHLIGHT_FILL = "#3E8BF7";
const HIGHLIGHT_STROKE = "#3E8BF7";
const CALLOUT_FILL = "#3E8BF7";
const CALLOUT_STROKE = "#3E8BF7";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sectionHighlightFilename(section) {
  return `${String(section.sectionNumber).toLowerCase()}.png`;
}

function sectionCenter(section) {
  if (!section?.path) return null;
  const bounds = pathBounds(section.path);
  if (!bounds) return null;
  return { cx: bounds.cx, cy: bounds.cy, bounds };
}

function calloutRadius(bounds, dimensions) {
  const mapScale = Math.max(dimensions.width, dimensions.height) / 3000;
  const sectionSize = Math.max(bounds.w, bounds.h);
  return Math.max(140 * mapScale, Math.min(sectionSize * 1.35, 260 * mapScale));
}

function sectionPathMarkup(section, highlighted) {
  if (!section.path) return "";

  const fill = highlighted ? HIGHLIGHT_FILL : DEFAULT_SECTION_FILL;
  const stroke = highlighted ? HIGHLIGHT_STROKE : DEFAULT_SECTION_STROKE;
  const strokeWidth = highlighted
    ? section.strokeWidth || 2
    : section.strokeWidth || 2;

  return `<path d="${escapeXml(section.path)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function buildSectionHighlightSvg({
  mapping,
  dimensions,
  backgroundPngBase64,
  highlightedSectionId,
}) {
  const sections = Object.values(mapping.sections || {}).filter(
    (section) => section.path
  );
  const highlighted = sections.find(
    (section) => section.sectionId === highlightedSectionId
  );
  const center = highlighted ? sectionCenter(highlighted) : null;

  const sectionMarkup = sections
    .map((section) =>
      sectionPathMarkup(section, section.sectionId === highlightedSectionId)
    )
    .join("\n");

  const calloutMarkup =
    center &&
    `<circle cx="${center.cx}" cy="${center.cy}" r="${calloutRadius(
      center.bounds,
      dimensions
    )}" fill="${CALLOUT_FILL}" fill-opacity="0.22" stroke="${CALLOUT_STROKE}" stroke-width="8" pointer-events="none"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeXml(
    dimensions.viewBox
  )}" width="${dimensions.width}" height="${dimensions.height}">
  <image width="${dimensions.width}" height="${dimensions.height}" href="data:image/png;base64,${backgroundPngBase64}" preserveAspectRatio="none"/>
  <g class="section-highlights">${sectionMarkup}</g>
  ${calloutMarkup || ""}
</svg>`;
}

function renderSectionHighlightPng({
  mapping,
  dimensions,
  backgroundPng,
  highlightedSectionId,
  scale = 1,
}) {
  const backgroundPngBase64 = Buffer.isBuffer(backgroundPng)
    ? backgroundPng.toString("base64")
    : backgroundPng;

  const svg = buildSectionHighlightSvg({
    mapping,
    dimensions,
    backgroundPngBase64,
    highlightedSectionId,
  });

  return renderSvgToPng(svg, {
    width: Math.round(dimensions.width * scale),
  });
}

function generateSectionHighlights({
  mapping,
  dimensions,
  backgroundPng,
  scale = 1,
}) {
  const sections = Object.values(mapping.sections || {}).filter(
    (section) => section.path
  );
  const highlights = {};

  for (const section of sections) {
    const { png } = renderSectionHighlightPng({
      mapping,
      dimensions,
      backgroundPng,
      highlightedSectionId: section.sectionId,
      scale,
    });
    highlights[sectionHighlightFilename(section)] = png;
  }

  return highlights;
}

module.exports = {
  DEFAULT_SECTION_FILL,
  HIGHLIGHT_FILL,
  buildSectionHighlightSvg,
  generateSectionHighlights,
  renderSectionHighlightPng,
  sectionHighlightFilename,
  sectionCenter,
};
