const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const {
  isSeatPath,
  isSectionCoverPath,
} = require("./pathGeometry");
const { getSvgDimensions } = require("./svgDimensions");

const SEAT_BLUE = "#3358d4";

function normalizeColor(value) {
  return (value || "").trim().toLowerCase();
}

function isSeatRect(el) {
  if (el.tagName?.toLowerCase() !== "rect") return false;
  return normalizeColor(el.getAttribute("fill")) === SEAT_BLUE;
}

function isClassSeatPath(el) {
  if (el.tagName?.toLowerCase() !== "path") return false;
  const token = `${el.getAttribute("id") || ""} ${el.getAttribute("class") || ""}`;
  return /sec-[^-\s]+-row-[^-\s]+-seat-/i.test(token);
}

function isClassRowPath(el) {
  if (el.tagName?.toLowerCase() !== "path") return false;
  const token = `${el.getAttribute("id") || ""} ${el.getAttribute("class") || ""}`;
  return /sec-[^-\s]+-row-[^-\s]+-path/i.test(token);
}

function isInteractiveSeatPath(el) {
  if (el.tagName?.toLowerCase() !== "path") return false;
  return (
    isClassSeatPath(el) ||
    isClassRowPath(el) ||
    isSeatPath(el) ||
    isSectionCoverPath(el)
  );
}

function isOuterLabelBox(el) {
  if (el.tagName?.toLowerCase() !== "path") return false;
  const fill = normalizeColor(el.getAttribute("fill"));
  const stroke = normalizeColor(el.getAttribute("stroke"));
  const d = (el.getAttribute("d") || "").replace(/\s+/g, "");
  return (
    fill === SEAT_BLUE &&
    (stroke === "#fff" || stroke === "white" || stroke === "#ffffff") &&
    /^M[\d.-]+h[\d.-]+v[\d.-]+h-/.test(d)
  );
}

function shouldRemoveNode(el) {
  const tag = el.tagName?.toLowerCase();
  if (!tag || tag === "svg" || tag === "defs" || tag === "clipPath") {
    return false;
  }
  if (tag === "rect" && isSeatRect(el)) return true;
  if (tag === "path") {
    if (isInteractiveSeatPath(el)) return true;
    if (isOuterLabelBox(el)) return true;
    if (normalizeColor(el.getAttribute("fill")) === SEAT_BLUE) return true;
  }
  return false;
}

function removeInteractiveNodes(parent) {
  const children = Array.from(parent.childNodes || []);
  for (const child of children) {
    if (child.nodeType !== 1) continue;
    if (shouldRemoveNode(child)) {
      parent.removeChild(child);
      continue;
    }
    removeInteractiveNodes(child);
  }
}

function generateBackgroundSvg(svgString) {
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  removeInteractiveNodes(doc.documentElement);
  const dimensions = getSvgDimensions(doc);
  const svg = new XMLSerializer().serializeToString(doc.documentElement);
  return { svg, dimensions };
}

module.exports = { generateBackgroundSvg, shouldRemoveNode };
