function parseViewBox(viewBox) {
  if (!viewBox) return null;
  const parts = viewBox.trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite)) {
    return {
      x: parts[0],
      y: parts[1],
      width: parts[2],
      height: parts[3],
    };
  }
  return null;
}

function getSvgDimensions(doc) {
  const root = doc.documentElement;
  const viewBox = parseViewBox(root.getAttribute("viewBox"));
  if (viewBox) {
    return {
      width: viewBox.width,
      height: viewBox.height,
      viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    };
  }

  const width = parseFloat(root.getAttribute("width") || "");
  const height = parseFloat(root.getAttribute("height") || "");
  if (Number.isFinite(width) && Number.isFinite(height)) {
    return {
      width,
      height,
      viewBox: `0 0 ${width} ${height}`,
    };
  }

  return { width: 3000, height: 2250, viewBox: "0 0 3000 2250" };
}

module.exports = { getSvgDimensions, parseViewBox };
