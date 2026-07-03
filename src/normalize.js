const SVG_NS = "http://www.w3.org/2000/svg";

const ROW_GROUP_RE = /^sec-([^-]+)-row-([^-]+)$/i;
const ROW_SEAT_RE = /^sec-([^-]+)-row-([^-]+)-seat-(.+)$/i;
const ROW_PATH_RE = /^sec-([^-]+)-row-([^-]+)-path$/i;

function bakeSeatRectTransform(rectEl) {
  const transform = rectEl.getAttribute("transform") || "";
  const rotateMatch = transform.match(
    /^rotate\(\s*(-180|180)\s+([-\d.]+)\s+([-\d.]+)\s*\)$/
  );
  if (!rotateMatch) return false;

  const x = parseFloat(rectEl.getAttribute("x") || "");
  const y = parseFloat(rectEl.getAttribute("y") || "");
  const w = parseFloat(rectEl.getAttribute("width") || "");
  const h = parseFloat(rectEl.getAttribute("height") || "");
  if (![x, y, w, h].every(Number.isFinite)) return false;

  const pivotX = parseFloat(rotateMatch[2]);
  const pivotY = parseFloat(rotateMatch[3]);
  if (Math.abs(pivotX - x) > 0.01 || Math.abs(pivotY - y) > 0.01) return false;

  rectEl.setAttribute("x", String(x - w));
  rectEl.setAttribute("y", String(y - h));
  rectEl.removeAttribute("transform");
  return true;
}

function normalizeSectionClass(group) {
  const id = group.getAttribute("id") || "";
  const existing = (group.getAttribute("class") || "").trim();

  if (/^sec-[^\s-]+ (YZ|NZ)$/.test(existing)) {
    return false;
  }

  const numberedGa = id.match(/^sec-(.+)_NZ_(\d+)$/i);
  if (numberedGa && !id.includes("-row-")) {
    group.setAttribute(
      "class",
      `sec-${numberedGa[1]}-${numberedGa[2]} NZ`
    );
    return true;
  }

  const suffixMatch = id.match(/^sec-(.+)_(YZ|NZ)$/i);
  if (suffixMatch && !id.includes("-row-")) {
    group.setAttribute("class", `sec-${suffixMatch[1]} ${suffixMatch[2].toUpperCase()}`);
    return true;
  }

  if (/^sec-[^-]+$/i.test(id) && !id.includes("-row-")) {
    const zoom = existing.match(/\b(YZ|NZ)\b/i)?.[1]?.toUpperCase() || "YZ";
    group.setAttribute("class", `sec-${id.slice(4)} ${zoom}`);
    return true;
  }

  return false;
}

function normalizeRowGroupClass(group) {
  const id = group.getAttribute("id") || "";
  const existing = (group.getAttribute("class") || "").trim().split(/\s+/)[0] || "";
  if (!ROW_GROUP_RE.test(id) || ROW_GROUP_RE.test(existing)) {
    return false;
  }
  group.setAttribute("class", id);
  return true;
}

function normalizeRowPathClass(pathEl) {
  const id = pathEl.getAttribute("id") || "";
  const existing = (pathEl.getAttribute("class") || "").trim();
  if (!ROW_PATH_RE.test(id) || ROW_PATH_RE.test(existing.split(/\s+/)[0] || "")) {
    return false;
  }
  pathEl.setAttribute("class", id);
  if (!pathEl.getAttribute("opacity")) {
    pathEl.setAttribute("opacity", "0.01");
  }
  return true;
}

function normalizeSeatElement(el) {
  const id = el.getAttribute("id") || "";
  const cls = (el.getAttribute("class") || "").trim();
  const token = ROW_SEAT_RE.test(id)
    ? id
    : ROW_SEAT_RE.test(cls.split(/\s+/)[0] || "")
      ? cls.split(/\s+/)[0]
      : "";
  if (!token) return false;
  if (!cls.includes("-seat-")) {
    el.setAttribute("class", token);
  }
  return true;
}

function normalizeIdentifierGroup(group) {
  const id = group.getAttribute("id") || "";
  const existing = (group.getAttribute("class") || "").trim();
  if (!/identifier/i.test(id) && !/identifier/i.test(existing)) {
    return false;
  }
  if (!existing.split(/\s+/).includes("identifier")) {
    group.setAttribute("class", `${existing} identifier`.trim());
  }
  return true;
}

function normalizeSvgDocument(doc) {
  let normalizedSections = 0;
  let normalizedRows = 0;
  let normalizedSeats = 0;
  let normalizedRowPaths = 0;
  let bakedTransforms = 0;

  Array.from(doc.getElementsByTagName("g")).forEach((group) => {
    const id = group.getAttribute("id") || "";
    if (id.includes("-row-") || /^identifier/i.test(id)) {
      if (normalizeRowGroupClass(group)) normalizedRows++;
      if (normalizeIdentifierGroup(group)) normalizedSections++;
      return;
    }
    if (normalizeSectionClass(group)) normalizedSections++;
    if (normalizeIdentifierGroup(group)) normalizedSections++;
  });

  Array.from(doc.getElementsByTagName("path")).forEach((pathEl) => {
    if (normalizeRowPathClass(pathEl)) normalizedRowPaths++;
    if (normalizeSeatElement(pathEl)) normalizedSeats++;
  });

  Array.from(doc.getElementsByTagName("rect")).forEach((rectEl) => {
    const token = rectEl.getAttribute("class") || rectEl.getAttribute("id") || "";
    if (token.includes("-seat-") && bakeSeatRectTransform(rectEl)) {
      bakedTransforms++;
    }
    if (normalizeSeatElement(rectEl)) normalizedSeats++;
  });

  return {
    normalizedSections,
    normalizedRows,
    normalizedSeats,
    normalizedRowPaths,
    bakedTransforms,
  };
}

function rectToPathD(rectEl) {
  const x = parseFloat(rectEl.getAttribute("x") || "");
  const y = parseFloat(rectEl.getAttribute("y") || "");
  const w = parseFloat(rectEl.getAttribute("width") || "");
  const h = parseFloat(rectEl.getAttribute("height") || "");
  if (![x, y, w, h].every(Number.isFinite)) return null;
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}

module.exports = {
  SVG_NS,
  ROW_GROUP_RE,
  ROW_SEAT_RE,
  ROW_PATH_RE,
  bakeSeatRectTransform,
  normalizeSvgDocument,
  rectToPathD,
};
