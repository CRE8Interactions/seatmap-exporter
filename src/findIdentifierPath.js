const {
  pathBounds,
  pointInPolygon,
  isLabelBackdropPath,
} = require("./pathGeometry");

function normalizeFill(value) {
  return (value || "").trim().toLowerCase();
}

function isWhiteFill(el) {
  const fill = normalizeFill(el.getAttribute("fill"));
  return fill === "#fff" || fill === "#ffffff" || fill === "white";
}

function findIdentifierPath(doc, polygon) {
  if (!polygon.length) return null;

  let best = null;
  const paths = doc.getElementsByTagName("path");
  for (let i = 0; i < paths.length; i++) {
    const pathEl = paths.item(i);
    if (!isWhiteFill(pathEl)) continue;

    const d = pathEl.getAttribute("d") || "";
    if (/a4\.1 4\.1/i.test(d)) continue;
    if (isLabelBackdropPath(d)) continue;

    const bounds = pathBounds(d);
    if (!bounds) continue;
    if (bounds.w > 120 || bounds.h > 120) continue;
    if (bounds.w * bounds.h < 40) continue;
    if (/v40\.7/i.test(d) || /h-57z/i.test(d)) continue;
    if (!pointInPolygon(bounds.cx, bounds.cy, polygon)) continue;

    if (!best || bounds.w * bounds.h < best.area) {
      best = {
        path: d,
        fill: pathEl.getAttribute("fill") || "#ffffff",
        opacity:
          pathEl.getAttribute("fill-opacity") ||
          pathEl.getAttribute("opacity") ||
          "1",
        area: bounds.w * bounds.h,
      };
    }
  }

  return best
    ? { path: best.path, fill: best.fill, opacity: best.opacity }
    : null;
}

module.exports = { findIdentifierPath };
