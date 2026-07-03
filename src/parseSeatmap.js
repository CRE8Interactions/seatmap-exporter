const { v4: uuidv4 } = require("uuid");
const {
  normalizeSvgDocument,
  rectToPathD,
  ROW_GROUP_RE,
  ROW_SEAT_RE,
  ROW_PATH_RE,
} = require("./normalize");
const { applySellOrder } = require("./sellOrder");
const {
  parseRawIllustratorFromDocument,
  isBlockticketsSvg,
} = require("./parseRawIllustrator");
const { pathBounds, resolveCoverPath, isLabelBackdropPath } = require("./pathGeometry");

const SEAT_SIZE = 8.2;

function getAttr(el, name) {
  return el.getAttribute(name) || "";
}

function elementToken(el) {
  const cls = (getAttr(el, "class") || "").split(/\s+/).filter(Boolean)[0] || "";
  const id = getAttr(el, "id");
  if (cls && !/^(cls-|st)/i.test(cls)) return cls;
  return id || cls;
}

function compareNumbers(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function isRowGroup(group) {
  const token = elementToken(group);
  return ROW_GROUP_RE.test(token);
}

function isIdentifierGroup(group) {
  const cls = getAttr(group, "class");
  const id = getAttr(group, "id");
  return cls.includes("identifier") || /^identifier/i.test(id);
}

function isDirectSectionContainer(group) {
  const cls = getAttr(group, "class").trim();
  return /^sec-[^\s-]+ (YZ|NZ)$/.test(cls);
}

function parentSectionContainer(group) {
  let node = group.parentNode;
  while (node && node.tagName) {
    if (node.tagName.toLowerCase() === "g" && isDirectSectionContainer(node)) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function isSectionGroup(group) {
  const id = getAttr(group, "id");
  const cls = getAttr(group, "class").trim();

  if (id.includes("-row-") || isRowGroup(group)) return false;
  if (parentSectionContainer(group)) return false;
  if (isIdentifierGroup(group) && !/^sec-[^\s-]+ (YZ|NZ)$/.test(cls)) {
    return false;
  }

  return /^sec-[^\s-]+ (YZ|NZ)$/.test(cls);
}

function parseSectionClass(group) {
  const cls = getAttr(group, "class").trim();
  const direct = cls.match(/^(sec-[^\s-]+)\s+(YZ|NZ)$/i);
  if (!direct) return null;

  return {
    sectionNumber: direct[1].slice(4),
    zoomable: direct[2].toUpperCase() === "YZ",
  };
}

function sectionDisplayName(sectionNumber) {
  const normalized = String(sectionNumber).toLowerCase();
  if (normalized === "ga") return "GA Floor";
  if (normalized === "club") return "Club";
  if (normalized === "suites") return "Suites";
  return `Section ${sectionNumber}`;
}

function findIdentifierGroup(section) {
  return Array.from(section.childNodes).find(
    (node) =>
      node.nodeType === 1 &&
      node.tagName?.toLowerCase() === "g" &&
      isIdentifierGroup(node)
  );
}

function directRowGroups(section) {
  return Array.from(section.childNodes).filter(
    (node) =>
      node.nodeType === 1 &&
      node.tagName?.toLowerCase() === "g" &&
      isRowGroup(node)
  );
}

function findSectionVisuals(section) {
  const identifierGroup = findIdentifierGroup(section);
  const coverPaths = identifierGroup
    ? Array.from(identifierGroup.getElementsByTagName("path")).filter((pathEl) => {
        const token = elementToken(pathEl);
        return token && !token.includes("-row-") && !token.includes("-path");
      })
    : [];

  if (coverPaths.length > 0) {
    const rawPath = getAttr(coverPaths[0], "d");
    const resolved = resolveCoverPath(rawPath);
    return {
      path: resolved.path || null,
      fill: getAttr(coverPaths[0], "fill") || "#3358D4",
      stroke: getAttr(coverPaths[0], "stroke") || "#fff",
      strokeWidth: getAttr(coverPaths[0], "stroke-width") || "3.5",
      identifier:
        resolved.identifierPath &&
        !isLabelBackdropPath(resolved.identifierPath)
          ? {
              path: resolved.identifierPath,
              fill: "#ffffff",
              opacity: "1",
            }
          : { path: null, fill: null, opacity: null },
    };
  }

  const tableRect = Array.from(section.getElementsByTagName("rect")).find(
    (rectEl) => {
      const token = elementToken(rectEl);
      return token && !token.includes("-seat-") && !token.includes("-row-");
    }
  );

  if (tableRect) {
    return {
      path: rectToPathD(tableRect),
      fill: getAttr(tableRect, "fill") || null,
      stroke: getAttr(tableRect, "stroke") || null,
      strokeWidth: getAttr(tableRect, "stroke-width") || null,
      identifier: { path: null, fill: null, opacity: null },
    };
  }

  return {
    path: null,
    fill: null,
    stroke: null,
    strokeWidth: null,
    identifier: { path: null, fill: null, opacity: null },
  };
}

function seatMetricsFromRect(rectEl) {
  return {
    cx: parseFloat(getAttr(rectEl, "x") || "0"),
    cy: parseFloat(getAttr(rectEl, "y") || "0"),
    w: parseFloat(getAttr(rectEl, "width") || "0"),
    h: parseFloat(getAttr(rectEl, "height") || "0"),
  };
}

function seatMetricsFromPath(pathEl) {
  const bounds = pathBounds(getAttr(pathEl, "d"));
  if (!bounds) return null;
  return {
    cx: bounds.minX,
    cy: bounds.minY,
    w: bounds.w > 0 ? bounds.w : SEAT_SIZE,
    h: bounds.h > 0 ? bounds.h : SEAT_SIZE,
  };
}

function seatMetricsFromElement(el) {
  const tag = el.tagName?.toLowerCase();
  if (tag === "rect") return seatMetricsFromRect(el);
  if (tag === "path") return seatMetricsFromPath(el);
  return null;
}

function parseSeatToken(el) {
  const token = elementToken(el);
  const match = token.match(ROW_SEAT_RE);
  if (!match) return null;
  return {
    sectionNumber: match[1],
    rowNumber: match[2],
    seatNumber: match[3],
    accessible:
      token.includes("DA") ||
      (getAttr(el, "class") || "").split(/\s+/).includes("DA"),
  };
}

function parseRowToken(rowGroup) {
  const token = elementToken(rowGroup);
  const match = token.match(ROW_GROUP_RE);
  return match ? { sectionNumber: match[1], rowNumber: match[2] } : null;
}

function rowSeatElements(rowGroup) {
  const seats = [];
  for (let i = 0; i < rowGroup.childNodes.length; i++) {
    const child = rowGroup.childNodes[i];
    if (child.nodeType !== 1) continue;
    const tag = child.tagName?.toLowerCase();
    if (tag !== "rect" && tag !== "path") continue;
    if (!parseSeatToken(child)) continue;
    seats.push(child);
  }
  return seats;
}

function findRowPath(rowGroup, sectionNumber, rowNumber) {
  const expected = `sec-${sectionNumber}-row-${rowNumber}-path`;
  return Array.from(rowGroup.getElementsByTagName("path")).find((pathEl) => {
    const token = elementToken(pathEl);
    return token === expected || ROW_PATH_RE.test(token);
  });
}

function boundsFromSeatMetrics(seatMetricsList) {
  if (!seatMetricsList.length) return null;
  const minX = Math.min(...seatMetricsList.map((s) => s.cx));
  const minY = Math.min(...seatMetricsList.map((s) => s.cy));
  const maxX = Math.max(...seatMetricsList.map((s) => s.cx + s.w));
  const maxY = Math.max(...seatMetricsList.map((s) => s.cy + s.h));
  return { minX, minY, maxX, maxY };
}

function boundsToPath(bounds) {
  return `M ${bounds.minX} ${bounds.minY} L ${bounds.maxX} ${bounds.minY} L ${bounds.maxX} ${bounds.maxY} L ${bounds.minX} ${bounds.maxY} Z`;
}

function computeSortOrder(sectionGroup, fallbackY) {
  const identifierGroup = findIdentifierGroup(sectionGroup);
  const firstPath = identifierGroup?.getElementsByTagName("path")?.[0];
  const d = firstPath ? getAttr(firstPath, "d") : "";
  const nums = d.match(/-?\d*\.?\d+/g);
  if (nums && nums.length >= 2) {
    const yValues = [];
    for (let i = 1; i < nums.length; i += 2) {
      yValues.push(parseFloat(nums[i]));
    }
    if (yValues.length) {
      return yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
    }
  }
  return fallbackY;
}

function parseSectionRows(sectionGroup, sectionId, info, rows, seats) {
  const sectionRowIds = [];
  const sectionSeatMetrics = [];
  let rectSeats = 0;
  let pathSeats = 0;

  const rowGroups = directRowGroups(sectionGroup)
    .map((rowGroup) => ({
      rowGroup,
      rowInfo: parseRowToken(rowGroup),
    }))
    .filter(
      (entry) => entry.rowInfo?.sectionNumber === info.sectionNumber
    )
    .sort((a, b) => compareNumbers(a.rowInfo.rowNumber, b.rowInfo.rowNumber));

  rowGroups.forEach(({ rowGroup, rowInfo }) => {
    const rowId = uuidv4();
    const seatIds = [];
    const rowSeatMetrics = [];

    const rowPathEl = findRowPath(
      rowGroup,
      info.sectionNumber,
      rowInfo.rowNumber
    );

    rowSeatElements(rowGroup)
      .sort((a, b) => {
        const seatA = parseSeatToken(a);
        const seatB = parseSeatToken(b);
        return compareNumbers(seatA?.seatNumber, seatB?.seatNumber);
      })
      .forEach((seatEl) => {
        const seatInfo = parseSeatToken(seatEl);
        if (!seatInfo || seatInfo.sectionNumber !== info.sectionNumber) {
          return;
        }

        const metrics = seatMetricsFromElement(seatEl);
        if (!metrics) return;

        if (seatEl.tagName?.toLowerCase() === "path") pathSeats++;
        else rectSeats++;

        const seatId = uuidv4();
        sectionSeatMetrics.push(metrics);
        rowSeatMetrics.push(metrics);

        seats[seatId] = {
          seatId,
          sectionId,
          rowId,
          sectionNumber: info.sectionNumber,
          rowNumber: seatInfo.rowNumber,
          seatNumber: seatInfo.seatNumber,
          accessible: seatInfo.accessible,
          ...metrics,
        };
        seatIds.push(seatId);
      });

    let rowPath = rowPathEl ? getAttr(rowPathEl, "d") || undefined : undefined;
    if (!rowPath && rowSeatMetrics.length) {
      const bounds = boundsFromSeatMetrics(rowSeatMetrics);
      if (bounds) rowPath = boundsToPath(bounds);
    }

    rows[rowId] = {
      rowId,
      sectionId,
      sectionNumber: info.sectionNumber,
      rowNumber: rowInfo.rowNumber,
      seats: seatIds,
      path: rowPath,
    };
    sectionRowIds.push(rowId);
  });

  return { sectionRowIds, sectionSeatMetrics, rectSeats, pathSeats };
}

function parseSeatmapFromDocument(doc, options = {}) {
  if (!isBlockticketsSvg(doc)) {
    return parseRawIllustratorFromDocument(doc, options);
  }

  const normalizeStats = normalizeSvgDocument(doc);
  const sections = {};
  const rows = {};
  const seats = {};
  let totalRectSeats = 0;
  let totalPathSeats = 0;

  const sectionGroups = Array.from(doc.getElementsByTagName("g"))
    .filter(isSectionGroup)
    .sort((a, b) => {
      const aInfo = parseSectionClass(a);
      const bInfo = parseSectionClass(b);
      return compareNumbers(aInfo?.sectionNumber, bInfo?.sectionNumber);
    });

  sectionGroups.forEach((sectionGroup) => {
    const info = parseSectionClass(sectionGroup);
    if (!info) return;

    const sectionId = uuidv4();
    const visuals = findSectionVisuals(sectionGroup);
    let sectionRowIds = [];
    let sectionSeatMetrics = [];

    if (info.zoomable) {
      const parsedRows = parseSectionRows(
        sectionGroup,
        sectionId,
        info,
        rows,
        seats
      );
      sectionRowIds = parsedRows.sectionRowIds;
      sectionSeatMetrics = parsedRows.sectionSeatMetrics;
      totalRectSeats += parsedRows.rectSeats;
      totalPathSeats += parsedRows.pathSeats;
    }

    if (!info.zoomable && !visuals.path) return;
    if (info.zoomable && !sectionRowIds.length && !visuals.path) return;

    if (!visuals.path && sectionSeatMetrics.length) {
      const bounds = boundsFromSeatMetrics(sectionSeatMetrics);
      if (bounds) visuals.path = boundsToPath(bounds);
    }

    const sectionEntry = {
      sectionId,
      sectionNumber: info.sectionNumber,
      sectionName:
        getAttr(sectionGroup, "data-seatmap-section-name") ||
        sectionDisplayName(info.sectionNumber),
      path: visuals.path,
      rows: sectionRowIds,
      zoomable: info.zoomable,
      fill: visuals.fill,
      stroke: visuals.stroke,
      strokeWidth: visuals.strokeWidth,
      identifier: visuals.identifier,
      sortOrder: computeSortOrder(
        sectionGroup,
        sectionSeatMetrics[0]?.cy || 0
      ),
    };

    if (!info.zoomable && options.gaSpots > 0) {
      sectionEntry.spots = Array.from({ length: options.gaSpots }, () =>
        uuidv4()
      );
    }

    sections[sectionId] = sectionEntry;
  });

  const mapping = { sections, rows, seats };

  if (options.hotspot) {
    applySellOrder(mapping, options.hotspot, {
      targetSectionIds: options.targetSectionIds,
    });
  }

  return {
    mapping,
    stats: {
      sections: Object.keys(sections).length,
      rows: Object.keys(rows).length,
      seats: Object.keys(seats).length,
      gaSections: Object.values(sections).filter((s) => !s.zoomable).length,
      rectSeats: totalRectSeats,
      pathSeats: totalPathSeats,
      sellOrderApplied: Boolean(options.hotspot),
      parser: "class-based",
      ...normalizeStats,
    },
  };
}

function parseSeatmap(svgString, options = {}) {
  const { DOMParser } = require("@xmldom/xmldom");
  const doc = new DOMParser().parseFromString(svgString, "image/svg+xml");
  return parseSeatmapFromDocument(doc, options);
}

module.exports = {
  parseSeatmap,
  parseSeatmapFromDocument,
};
