const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const { generateBackgroundSvg } = require("./generateBackground");

const SVG_NS = "http://www.w3.org/2000/svg";
const DEFAULT_SEAT_FILL = "#3358D4";

function checkerToken(value) {
  return String(value).trim().replace(/[\s-]+/g, "_");
}

function compareValues(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function setAttributes(element, attributes) {
  Object.entries(attributes).forEach(([name, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      element.setAttribute(name, String(value));
    }
  });
}

function sectionRows(mapping, section) {
  const rowIds = Array.isArray(section.rows) ? section.rows : [];
  const rows = rowIds
    .map((rowId) => mapping.rows[rowId])
    .filter(Boolean);

  if (rows.length) {
    return rows.sort((a, b) => compareValues(a.rowNumber, b.rowNumber));
  }

  return Object.values(mapping.rows)
    .filter((row) => row.sectionId === section.sectionId)
    .sort((a, b) => compareValues(a.rowNumber, b.rowNumber));
}

function rowSeats(mapping, row) {
  const seatIds = Array.isArray(row.seats) ? row.seats : [];
  const seats = seatIds
    .map((seatId) => mapping.seats[seatId])
    .filter(Boolean);

  if (seats.length) {
    return seats.sort((a, b) => compareValues(a.seatNumber, b.seatNumber));
  }

  return Object.values(mapping.seats)
    .filter((seat) => seat.rowId === row.rowId)
    .sort((a, b) => compareValues(a.seatNumber, b.seatNumber));
}

function stripSourceSectionSemantics(parent) {
  Array.from(parent.childNodes || []).forEach((child) => {
    if (child.nodeType !== 1) return;

    const structuralToken = `${child.getAttribute("class") || ""} ${
      child.getAttribute("id") || ""
    }`;
    if (/sec-[^-\s]+-row-[^-\s]+-seat-/i.test(structuralToken)) {
      parent.removeChild(child);
      return;
    }

    if (child.tagName?.toLowerCase() === "g") {
      const className = (child.getAttribute("class") || "").trim();
      const id = child.getAttribute("id") || "";
      if (/^sec-[^\s-]+\s+(YZ|NZ)$/i.test(className)) {
        child.setAttribute("data-svgqc-source-class", className);
        child.removeAttribute("class");
      }
      if (
        /^sec-.+_(YZ|NZ)(?:_\d+)?$/i.test(id) ||
        /^sec-[^-]+$/i.test(id)
      ) {
        child.setAttribute("data-svgqc-source-id", id);
        child.removeAttribute("id");
      }
    }

    stripSourceSectionSemantics(child);
  });
}

function appendSectionVisual(doc, sectionGroup, section) {
  if (!section.path && !section.identifier?.path) return;

  const sectionNumber = checkerToken(section.sectionNumber);
  const identifierGroup = doc.createElementNS(SVG_NS, "g");
  identifierGroup.setAttribute("class", "identifier");

  if (section.path) {
    const cover = doc.createElementNS(SVG_NS, "path");
    setAttributes(cover, {
      class: `sec-${sectionNumber}`,
      d: section.path,
      fill: section.fill || DEFAULT_SEAT_FILL,
      stroke: section.stroke,
      "stroke-width": section.strokeWidth,
    });
    identifierGroup.appendChild(cover);
  }

  if (section.identifier?.path) {
    const identifier = doc.createElementNS(SVG_NS, "path");
    setAttributes(identifier, {
      class: `sec-${sectionNumber}-label-path`,
      d: section.identifier.path,
      fill: section.identifier.fill || "#ffffff",
      opacity: section.identifier.opacity || "1",
      "pointer-events": "none",
    });
    identifierGroup.appendChild(identifier);
  }

  sectionGroup.appendChild(identifierGroup);
}

function appendRow(doc, sectionGroup, mapping, section, row) {
  const sectionNumber = checkerToken(section.sectionNumber);
  const rowNumber = checkerToken(row.rowNumber);
  const rowGroup = doc.createElementNS(SVG_NS, "g");
  rowGroup.setAttribute(
    "class",
    `sec-${sectionNumber}-row-${rowNumber}`
  );

  rowSeats(mapping, row).forEach((seat) => {
    const seatRect = doc.createElementNS(SVG_NS, "rect");
    const accessibleClass = seat.accessible ? " DA accessible" : "";
    setAttributes(seatRect, {
      class: `sec-${sectionNumber}-row-${rowNumber}-seat-${seat.seatNumber}${accessibleClass}`,
      x: seat.cx,
      y: seat.cy,
      width: seat.w,
      height: seat.h,
      rx: Math.min(Number(seat.w) || 0, Number(seat.h) || 0) / 2,
      fill: DEFAULT_SEAT_FILL,
    });
    rowGroup.appendChild(seatRect);
  });

  sectionGroup.appendChild(rowGroup);
}

function generateSvgQcSvg(svgString, mapping) {
  if (!mapping?.sections || !mapping?.rows || !mapping?.seats) {
    throw new Error("A valid seatmap mapping is required to generate .svgqc.");
  }

  const { svg: backgroundSvg } = generateBackgroundSvg(svgString);
  const doc = new DOMParser().parseFromString(backgroundSvg, "image/svg+xml");
  const root = doc.documentElement;
  stripSourceSectionSemantics(root);
  const layer = doc.createElementNS(SVG_NS, "g");
  layer.setAttribute("data-svgqc-layer", "1");

  Object.values(mapping.sections)
    .sort((a, b) => compareValues(a.sectionNumber, b.sectionNumber))
    .forEach((section) => {
      const sectionNumber = checkerToken(section.sectionNumber);
      const sectionGroup = doc.createElementNS(SVG_NS, "g");
      setAttributes(sectionGroup, {
        class: `sec-${sectionNumber} ${section.zoomable ? "YZ" : "NZ"}`,
        "data-seatmap-section-name": section.sectionName,
      });

      appendSectionVisual(doc, sectionGroup, section);
      if (section.zoomable) {
        sectionRows(mapping, section).forEach((row) => {
          appendRow(doc, sectionGroup, mapping, section, row);
        });
      }

      layer.appendChild(sectionGroup);
    });

  root.appendChild(layer);
  return new XMLSerializer().serializeToString(root);
}

function buildSvgQcCapacities(mapping, options = {}) {
  const supplied = options.capacities || {};
  const capacities = {};

  Object.values(mapping.sections).forEach((section) => {
    const originalSectionNumber = String(section.sectionNumber);
    const sectionNumber = checkerToken(originalSectionNumber);
    if (!section.zoomable) {
      const suppliedValue =
        supplied[section.sectionId] ??
        supplied[originalSectionNumber] ??
        supplied[sectionNumber];
      const capacity =
        suppliedValue ?? (Array.isArray(section.spots) ? section.spots.length : 0);
      capacities[sectionNumber] = Math.max(0, Number(capacity) || 0);
      return;
    }

    capacities[sectionNumber] = Object.values(mapping.seats).filter(
      (seat) => seat.sectionId === section.sectionId
    ).length;
  });

  return capacities;
}

function createSvgQcProject(svgString, mapping, options = {}) {
  return {
    version: 1,
    svg: generateSvgQcSvg(svgString, mapping),
    capacities: buildSvgQcCapacities(mapping, options),
  };
}

module.exports = {
  buildSvgQcCapacities,
  createSvgQcProject,
  generateSvgQcSvg,
};
