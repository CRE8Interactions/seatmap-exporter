const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { applySellOrder } = require("./sellOrder");
const { loadSvgInput } = require("./loadInput");
const { findIdentifierPath } = require("./findIdentifierPath");
const { getSvgDimensions, parseViewBox } = require("./svgDimensions");
const {
  pathBounds,
  pathPoints,
  extractCircleCenters,
  pointInPolygon,
  bakeRectMetrics,
  isSeatPath,
  extractSeatsFromPath,
  isSectionCoverPath,
  resolveCoverPath,
  isLabelBackdropPath,
} = require("./pathGeometry");

const DEFAULT_REFERENCE = path.resolve(
  __dirname,
  "../../svg-map-checker/public/pa-mexican-concert-wo-200.svgqc"
);

const ROW_GROUP_RE = /^sec-([^-]+)-row-([^-]+)$/i;
const ROW_SEAT_RE = /^sec-([^-]+)-row-([^-]+)-seat-(.+)$/i;

function getAttr(el, name) {
  return el.getAttribute(name) || "";
}

function seatTokenFromElement(el) {
  const raw = getAttr(el, "class") || getAttr(el, "id") || "";
  const token = raw.split(/\s+/).filter(Boolean)[0] || "";
  const match = token.match(ROW_SEAT_RE);
  if (!match) return null;
  return {
    sectionNumber: match[1],
    rowNumber: match[2],
    seatNumber: match[3],
  };
}

function compareRowNumbers(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function extractReferenceSeatLabels(referencePath) {
  if (!fs.existsSync(referencePath)) return [];

  const { DOMParser } = require("@xmldom/xmldom");
  const refDoc = new DOMParser().parseFromString(
    loadSvgInput(referencePath),
    "image/svg+xml"
  );
  if (!isBlockticketsSvg(refDoc)) return [];

  const { parseSeatmapFromDocument } = require("./parseSeatmap");
  const { mapping } = parseSeatmapFromDocument(refDoc);
  return Object.values(mapping.seats).map((seat) => ({
    sectionNumber: seat.sectionNumber,
    rowNumber: seat.rowNumber,
    seatNumber: seat.seatNumber,
    cx: seat.cx + seat.w / 2,
    cy: seat.cy + seat.h / 2,
  }));
}

function matchSeatToReference(seat, sectionNumber, referenceSeats, maxDist = 30) {
  const center = seatCenter(seat);
  let best = null;
  let bestDist = maxDist;

  for (const ref of referenceSeats) {
    if (ref.sectionNumber !== sectionNumber) continue;
    const dist = Math.hypot(ref.cx - center.x, ref.cy - center.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = ref;
    }
  }

  return best;
}

function seatCenterPoint(seat) {
  return {
    x: seat.cx + (seat.w || 0) / 2,
    y: seat.cy + (seat.h || 0) / 2,
  };
}

function seatHasLabel(seat) {
  return Boolean(seat.rowNumber && seat.seatNumber);
}

function seatLabelKey(seat) {
  return `${seat.rowNumber}-${seat.seatNumber}`;
}

function isReferenceLabelingValid(seats) {
  if (!seats.length) return false;

  const labeled = seats.filter(seatHasLabel);
  if (labeled.length < seats.length * 0.95) return false;

  const pairs = new Set();
  for (const seat of labeled) {
    const key = seatLabelKey(seat);
    if (pairs.has(key)) return false;
    pairs.add(key);
  }

  return true;
}

function buildSectionAlignedMatcher(sourceSeats, sectionRef) {
  const seatCenterX = (seat) => seat.cx + (seat.w || 0) / 2;
  const seatCenterY = (seat) => seat.cy + (seat.h || 0) / 2;

  const srcXs = sourceSeats.map(seatCenterX);
  const srcYs = sourceSeats.map(seatCenterY);
  const srcMinX = Math.min(...srcXs);
  const srcMaxX = Math.max(...srcXs);
  const srcMinY = Math.min(...srcYs);
  const srcMaxY = Math.max(...srcYs);
  const srcW = srcMaxX - srcMinX || 1;
  const srcH = srcMaxY - srcMinY || 1;

  const refXs = sectionRef.map((ref) => ref.cx);
  const refYs = sectionRef.map((ref) => ref.cy);
  const refMinX = Math.min(...refXs);
  const refMaxX = Math.max(...refXs);
  const refMinY = Math.min(...refYs);
  const refMaxY = Math.max(...refYs);
  const refW = refMaxX - refMinX || 1;
  const refH = refMaxY - refMinY || 1;

  const countRatio =
    Math.min(sourceSeats.length, sectionRef.length) /
    Math.max(sourceSeats.length, sectionRef.length);
  const maxDist = countRatio < 0.85 ? 25 : 15;

  const mapRefToSource = (ref) => ({
    x: srcMinX + ((ref.cx - refMinX) / refW) * srcW,
    y: srcMinY + ((ref.cy - refMinY) / refH) * srcH,
  });

  return {
    maxDist,
    seatCenterX,
    seatCenterY,
    mapRefToSource,
  };
}

function matchSeatToAlignedReference(
  seat,
  sectionRef,
  mapRefToSource,
  usedLabelKeys,
  maxDist
) {
  const center = seatCenterPoint(seat);
  let best = null;
  let bestDist = maxDist;

  for (const ref of sectionRef) {
    const key = seatLabelKey(ref);
    if (usedLabelKeys.has(key)) continue;

    const mapped = mapRefToSource(ref);
    const dist = Math.hypot(mapped.x - center.x, mapped.y - center.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = ref;
    }
  }

  return best;
}

function applyGlobalAlignedMatching(
  sourceSeats,
  sectionRef,
  usedLabelKeys,
  matcher
) {
  const { mapRefToSource, maxDist, seatCenterX, seatCenterY } = matcher;
  const pairs = [];

  for (const seat of sourceSeats.filter((seat) => !seatHasLabel(seat))) {
    const sx = seatCenterX(seat);
    const sy = seatCenterY(seat);

    for (const ref of sectionRef.filter(
      (ref) => !usedLabelKeys.has(seatLabelKey(ref))
    )) {
      const mapped = mapRefToSource(ref);
      const dist = Math.hypot(mapped.x - sx, mapped.y - sy);
      if (dist <= maxDist) {
        pairs.push({ dist, seat, ref });
      }
    }
  }

  pairs.sort((a, b) => a.dist - b.dist);

  for (const { seat, ref } of pairs) {
    const key = seatLabelKey(ref);
    if (seatHasLabel(seat) || usedLabelKeys.has(key)) continue;
    seat.rowNumber = ref.rowNumber;
    seat.seatNumber = ref.seatNumber;
    usedLabelKeys.add(key);
  }
}

function assignRemainingToNearestAlignedRef(
  sourceSeats,
  sectionRef,
  usedLabelKeys,
  matcher
) {
  const { mapRefToSource, seatCenterX, seatCenterY } = matcher;

  for (const seat of sourceSeats.filter((seat) => !seatHasLabel(seat))) {
    const sx = seatCenterX(seat);
    const sy = seatCenterY(seat);
    let best = null;
    let bestDist = Infinity;

    for (const ref of sectionRef.filter(
      (ref) => !usedLabelKeys.has(seatLabelKey(ref))
    )) {
      const mapped = mapRefToSource(ref);
      const dist = Math.hypot(mapped.x - sx, mapped.y - sy);
      if (dist < bestDist) {
        bestDist = dist;
        best = ref;
      }
    }

    if (!best) continue;

    seat.rowNumber = best.rowNumber;
    seat.seatNumber = best.seatNumber;
    usedLabelKeys.add(seatLabelKey(best));
  }
}

function labelSeatsFromReference(seats, sectionNumber, referenceSeats) {
  const sectionRef = referenceSeats.filter(
    (seat) => seat.sectionNumber === sectionNumber
  );
  if (!sectionRef.length) return seats;

  const labeled = seats.map((seat) => ({ ...seat }));
  const usedLabelKeys = new Set(
    labeled.filter(seatHasLabel).map(seatLabelKey)
  );
  const matcher = buildSectionAlignedMatcher(labeled, sectionRef);

  for (const seat of labeled) {
    if (seatHasLabel(seat)) continue;

    const ref = matchSeatToAlignedReference(
      seat,
      sectionRef,
      matcher.mapRefToSource,
      usedLabelKeys,
      matcher.maxDist
    );
    if (!ref) continue;

    const key = seatLabelKey(ref);
    seat.rowNumber = ref.rowNumber;
    seat.seatNumber = ref.seatNumber;
    usedLabelKeys.add(key);
  }

  applyGlobalAlignedMatching(labeled, sectionRef, usedLabelKeys, matcher);
  assignRemainingToNearestAlignedRef(
    labeled,
    sectionRef,
    usedLabelKeys,
    matcher
  );

  return labeled;
}

function labelSeatsFromSvgOrReference(seats, sectionNumber, referenceSeats) {
  return labelSeatsFromReference(seats, sectionNumber, referenceSeats);
}

function groupSeatsByRowLabels(seats, sectionNumber) {
  const rowMap = new Map();

  for (const seat of seats) {
    const rowNumber = String(seat.rowNumber || "1");
    if (!rowMap.has(rowNumber)) rowMap.set(rowNumber, []);
    rowMap.get(rowNumber).push(seat);
  }

  return Array.from(rowMap.entries())
    .sort((a, b) => compareRowNumbers(a[0], b[0]))
    .map(([rowNumber, rowSeats]) => {
      const orderedSeats = [...rowSeats].sort((a, b) => {
        const sa = Number(a.seatNumber);
        const sb = Number(b.seatNumber);
        if (!Number.isNaN(sa) && !Number.isNaN(sb)) return sa - sb;
        return a.cx - b.cx;
      });

      return {
        rowNumber,
        seats: orderedSeats.map((seat) => ({
          ...seat,
          sectionNumber,
          rowNumber,
          seatNumber: String(seat.seatNumber || "1"),
        })),
      };
    });
}

function boundsFromSeats(seatMetricsList) {
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

function normalizeCentroids(list) {
  const minX = Math.min(...list.map((x) => x.cx));
  const maxX = Math.max(...list.map((x) => x.cx));
  const minY = Math.min(...list.map((x) => x.cy));
  const maxY = Math.max(...list.map((x) => x.cy));
  return list.map((x) => ({
    ...x,
    nx: (x.cx - minX) / (maxX - minX || 1),
    ny: (x.cy - minY) / (maxY - minY || 1),
  }));
}

function matchByCentroid(source, reference) {
  const src = normalizeCentroids(source);
  const ref = normalizeCentroids(reference);
  const used = new Set();
  const matches = [];

  for (const item of src) {
    let best = null;
    let bestDist = Infinity;
    for (const candidate of ref) {
      if (used.has(candidate.num)) continue;
      const dist = Math.hypot(item.nx - candidate.nx, item.ny - candidate.ny);
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    if (best) {
      used.add(best.num);
      matches.push({
        source: item,
        num: best.num,
        zoomable: best.zoomable,
        dist: bestDist,
      });
    }
  }

  return matches;
}

function extractReferenceSections(doc) {
  const sections = [];
  const groups = doc.getElementsByTagName("g");
  for (let i = 0; i < groups.length; i++) {
    const group = groups.item(i);
    const cls = getAttr(group, "class");
    const match = cls.match(/^sec-([^\s-]+)\s+(YZ|NZ)$/i);
    if (!match) continue;

    const sectionNumber = match[1];
    const zoomable = match[2].toUpperCase() === "YZ";
    const identifierGroups = group.getElementsByTagName("g");
    let coverPath = null;
    for (let j = 0; j < identifierGroups.length; j++) {
      const idGroup = identifierGroups.item(j);
      if (getAttr(idGroup, "class").includes("identifier")) {
        coverPath = idGroup.getElementsByTagName("path").item(0);
        break;
      }
    }
    if (!coverPath) continue;

    const bounds = pathBounds(getAttr(coverPath, "d"));
    if (!bounds) continue;

    sections.push({
      num: sectionNumber,
      zoomable,
      isTable: Number(sectionNumber) <= 12 && Number(sectionNumber) >= 1,
      isGa: false,
      ...bounds,
    });
  }

  const paths = doc.getElementsByTagName("path");
  for (let i = 0; i < paths.length; i++) {
    const pathEl = paths.item(i);
    const id = getAttr(pathEl, "id");
    if (!/^sec-(ga|club|suites)/i.test(id) || /identifier/i.test(id)) continue;
    const bounds = pathBounds(getAttr(pathEl, "d"));
    if (!bounds) continue;
    const num = id.replace(/^sec-/i, "").replace(/_NZ.*/i, "").replace(/_/g, "-");
    sections.push({
      num: num === "ga" ? "ga" : num,
      zoomable: false,
      isTable: false,
      isGa: /^ga/i.test(num),
      ...bounds,
    });
  }

  return sections;
}

function splitTableColumns(rectSeats) {
  if (!rectSeats.length) return [[], []];

  const xs = rectSeats.map((seat) => seat.cx).sort((a, b) => a - b);
  const median = xs[Math.floor(xs.length / 2)];
  const stageColumn = rectSeats.filter((seat) => seat.cx >= median);
  const gaColumn = rectSeats.filter((seat) => seat.cx < median);

  if (!stageColumn.length || !gaColumn.length) {
    return [rectSeats, []];
  }

  return [stageColumn, gaColumn];
}

function clusterTableSeats(rectSeats) {
  const seatsPerTable = 8;
  const tablesPerColumn = 12;
  const [stageColumn, gaColumn] = splitTableColumns(rectSeats);
  const clusters = [];

  for (const [columnSeats, startNumber] of [
    [stageColumn, 1],
    [gaColumn, 13],
  ]) {
    if (!columnSeats.length) continue;

    const ordered = [...columnSeats].sort((a, b) => b.cy - a.cy || a.cx - b.cx);
    for (let index = 0; index < tablesPerColumn; index++) {
      const seats = ordered.slice(
        index * seatsPerTable,
        (index + 1) * seatsPerTable
      );
      if (!seats.length) continue;
      clusters.push({
        sectionNumber: String(startNumber + index),
        seats,
      });
    }
  }

  return clusters.sort(
    (a, b) => Number(a.sectionNumber) - Number(b.sectionNumber)
  );
}

function arenaCenterFromDimensions(dimensions) {
  const viewBox = parseViewBox(dimensions.viewBox);
  if (viewBox) {
    return {
      x: viewBox.x + viewBox.width / 2,
      y: viewBox.y + viewBox.height / 2,
    };
  }
  return { x: dimensions.width / 2, y: dimensions.height / 2 };
}

function accessibleSeatSuffix(seatNumber) {
  const value = String(seatNumber || "");
  const idx = value.indexOf("_");
  return idx >= 0 ? value.slice(idx + 1) : null;
}

function assignVisualSeatNumber(seatIndex, seat) {
  const suffix = accessibleSeatSuffix(seat.seatNumber);
  const base = String(seatIndex + 1);
  return suffix ? `${base}_${suffix}` : base;
}

function isFanSection(seats) {
  const xs = seats.map((seat) => seat.cx + (seat.w || 0) / 2);
  const ys = seats.map((seat) => seat.cy + (seat.h || 0) / 2);
  const xSpan = Math.max(...xs) - Math.min(...xs);
  const ySpan = Math.max(...ys) - Math.min(...ys);
  return xSpan > 150 && ySpan > 60;
}

function seatsArcConnected(a, b, rowDyTol, arcSlope) {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return dy <= rowDyTol + arcSlope * dx;
}

function clusterRadiusSpread(centers) {
  const radii = centers.map((center) => center.radius);
  return Math.max(...radii) - Math.min(...radii);
}

function groupSeatsByVisualRows(seats, sectionNumber, arenaCenter) {
  const centers = seats.map((seat) => ({
    seat,
    x: seat.cx + (seat.w || 0) / 2,
    y: seat.cy + (seat.h || 0) / 2,
    radius: Math.hypot(
      seat.cx + (seat.w || 0) / 2 - arenaCenter.x,
      seat.cy + (seat.h || 0) / 2 - arenaCenter.y
    ),
  }));
  const xs = centers.map((center) => center.x);
  const ys = centers.map((center) => center.y);
  const radii = centers.map((center) => center.radius);
  const xSpan = Math.max(...xs) - Math.min(...xs) || 1;
  const ySpan = Math.max(...ys) - Math.min(...ys) || 1;
  const radiusSpan = Math.max(...radii) - Math.min(...radii) || 1;
  const fan = isFanSection(seats);
  const rowTolerance = fan
    ? Math.max(18, Math.min(55, ySpan * 0.1))
    : Math.max(12, Math.min(40, ySpan * 0.08));
  const arcSlope = fan ? (ySpan / xSpan) * 0.8 : 0;

  const sorted = [...centers].sort((a, b) => a.y - b.y || a.x - b.x);
  const rowClusters = [];

  for (const center of sorted) {
    let cluster = rowClusters.find(
      (row) => Math.abs(row.avgY - center.y) <= rowTolerance
    );
    if (!cluster) {
      cluster = { seats: [], avgY: center.y };
      rowClusters.push(cluster);
    }
    cluster.seats.push(center);
    cluster.avgY =
      cluster.seats.reduce((sum, item) => sum + item.y, 0) / cluster.seats.length;
  }

  rowClusters.forEach((cluster) => {
    cluster.avgDist =
      cluster.seats.reduce((sum, center) => sum + center.radius, 0) /
      cluster.seats.length;
  });
  rowClusters.sort((a, b) => a.avgDist - b.avgDist);

  if (fan && rowClusters.length > 1) {
    const rowDyTol = Math.max(12, Math.min(20, ySpan * 0.04));
    const maxSpread = Math.max(
      14,
      Math.min(35, radiusSpan / Math.max(rowClusters.length * 0.65, 4))
    );
    let merged = true;

    while (merged) {
      merged = false;

      for (let i = 0; i < rowClusters.length - 1; i++) {
        const left = rowClusters[i];
        const right = rowClusters[i + 1];
        const combined = [...left.seats, ...right.seats];

        if (clusterRadiusSpread(combined) > maxSpread) continue;

        let connected = false;
        for (const a of left.seats) {
          for (const b of right.seats) {
            if (seatsArcConnected(a, b, rowDyTol, arcSlope)) {
              connected = true;
              break;
            }
          }
          if (connected) break;
        }
        if (!connected) continue;

        left.seats = combined;
        left.avgY =
          combined.reduce((sum, center) => sum + center.y, 0) / combined.length;
        left.avgDist =
          combined.reduce((sum, center) => sum + center.radius, 0) /
          combined.length;
        rowClusters.splice(i + 1, 1);
        merged = true;
        break;
      }
    }
  }

  return rowClusters.map((cluster, rowIndex) => {
    const rowNumber = String(rowIndex + 1);
    const orderedSeats = cluster.seats
      .sort((a, b) => a.x - b.x)
      .map((center) => center.seat);

    return {
      rowNumber,
      seats: orderedSeats.map((seat, seatIndex) => ({
        ...seat,
        sectionNumber,
        rowNumber,
        seatNumber: assignVisualSeatNumber(seatIndex, seat),
      })),
    };
  });
}

function groupSeatsByRadialDistance(seats, sectionNumber, arenaCenter) {
  const rowTolerance = 10;
  const seatDistance = (seat) => {
    const cx = seat.cx + seat.w / 2;
    const cy = seat.cy + seat.h / 2;
    return Math.hypot(cx - arenaCenter.x, cy - arenaCenter.y);
  };

  const sorted = [...seats].sort(
    (a, b) => seatDistance(a) - seatDistance(b) || a.cx - b.cx
  );
  const rows = [];

  for (const seat of sorted) {
    const dist = seatDistance(seat);
    let row = rows.find((entry) => Math.abs(entry.dist - dist) <= rowTolerance);
    if (!row) {
      row = { dist, seats: [] };
      rows.push(row);
    }
    row.seats.push(seat);
    row.dist =
      row.seats.reduce((sum, item) => sum + seatDistance(item), 0) /
      row.seats.length;
  }

  rows.sort((a, b) => a.dist - b.dist);

  return rows.map((row, rowIndex) => {
    const rowNumber = String(rowIndex + 1);
    const orderedSeats = row.seats.sort((a, b) => a.cx - b.cx);
    return {
      rowNumber,
      seats: orderedSeats.map((seat, seatIndex) => ({
        ...seat,
        sectionNumber,
        rowNumber,
        seatNumber: String(seatIndex + 1),
      })),
    };
  });
}

function isTableSection(sectionNumber) {
  const num = Number(sectionNumber);
  return Number.isFinite(num) && num >= 1 && num <= 24;
}

function groupTableSeats(seats, sectionNumber) {
  const orderedSeats = [...seats].sort((a, b) => a.cy - b.cy || a.cx - b.cx);
  return [
    {
      rowNumber: "1",
      seats: orderedSeats.map((seat, seatIndex) => ({
        ...seat,
        sectionNumber,
        rowNumber: "1",
        seatNumber: String(seat.seatNumber || seatIndex + 1),
      })),
    },
  ];
}

function groupSeatsIntoRows(seats, sectionNumber, arenaCenter, referenceSeats) {
  if (isTableSection(sectionNumber)) {
    return groupTableSeats(seats, sectionNumber);
  }

  const labeledSeats = labelSeatsFromSvgOrReference(
    seats,
    sectionNumber,
    referenceSeats
  );

  return groupSeatsByVisualRows(labeledSeats, sectionNumber, arenaCenter);
}

function seatCenter(seat) {
  return {
    x: seat.cx + seat.w / 2,
    y: seat.cy + seat.h / 2,
  };
}

function seatInViewBounds(seat, bounds, padding = 20) {
  const cx = seat.cx + (seat.w || 0) / 2;
  const cy = seat.cy + (seat.h || 0) / 2;
  return (
    cx >= bounds.minX - padding &&
    cx <= bounds.maxX + padding &&
    cy >= bounds.minY - padding &&
    cy <= bounds.maxY + padding
  );
}

function buildSectionEntry(section, doc) {
  let identifier = { path: null, fill: null, opacity: null };
  if (section.identifierPath && !isLabelBackdropPath(section.identifierPath)) {
    identifier = {
      path: section.identifierPath,
      fill: "#ffffff",
      opacity: "1",
    };
  } else if (
    Number(section.sectionNumber) >= 100 ||
    String(section.sectionNumber).startsWith("ga")
  ) {
    identifier =
      findIdentifierPath(doc, section.polygon) || {
        path: null,
        fill: null,
        opacity: null,
      };
  }

  return {
    sectionNumber: section.sectionNumber,
    zoomable: section.zoomable,
    path: section.path,
    polygon: section.polygon,
    cx: section.cx,
    cy: section.cy,
    fill: section.fill,
    stroke: section.stroke,
    strokeWidth: section.strokeWidth,
    seats: section.seats,
    identifier,
  };
}

function assignSeatToSection(seat, sectionEntries) {
  const center = seatCenter(seat);
  for (const section of sectionEntries) {
    if (pointInPolygon(center.x, center.y, section.polygon)) {
      return section;
    }
  }

  let best = null;
  let bestDist = Infinity;
  for (const section of sectionEntries) {
    const dx = seat.cx - section.cx;
    const dy = seat.cy - section.cy;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = section;
    }
  }
  return best;
}

function buildReferenceAlignment(matchedPairs) {
  if (matchedPairs.length < 3) return null;

  const refMinX = Math.min(...matchedPairs.map((pair) => pair.refCx));
  const refMaxX = Math.max(...matchedPairs.map((pair) => pair.refCx));
  const refMinY = Math.min(...matchedPairs.map((pair) => pair.refCy));
  const refMaxY = Math.max(...matchedPairs.map((pair) => pair.refCy));
  const expMinX = Math.min(...matchedPairs.map((pair) => pair.expCx));
  const expMaxX = Math.max(...matchedPairs.map((pair) => pair.expCx));
  const expMinY = Math.min(...matchedPairs.map((pair) => pair.expCy));
  const expMaxY = Math.max(...matchedPairs.map((pair) => pair.expCy));
  const scaleX = (expMaxX - expMinX) / (refMaxX - refMinX || 1);
  const scaleY = (expMaxY - expMinY) / (refMaxY - refMinY || 1);

  return {
    toExport(refX, refY) {
      return {
        x: expMinX + (refX - refMinX) * scaleX,
        y: expMinY + (refY - refMinY) * scaleY,
      };
    },
  };
}

function assignBowlSeatsByReference(bowlSections, circleSeats, refBowl) {
  if (!refBowl.length || !bowlSections.length || !circleSeats.length) return;

  const matchedPairs = bowlSections
    .map((section) => {
      const ref = refBowl.find((entry) => entry.num === section.sectionNumber);
      if (!ref) return null;
      return {
        num: section.sectionNumber,
        refCx: ref.cx,
        refCy: ref.cy,
        expCx: section.cx,
        expCy: section.cy,
        zoomable: section.zoomable,
      };
    })
    .filter(Boolean);

  const alignment = buildReferenceAlignment(matchedPairs);
  if (!alignment) return;

  const sectionByNumber = new Map(
    bowlSections.map((section) => [section.sectionNumber, section])
  );

  for (const ref of refBowl) {
    if (sectionByNumber.has(ref.num)) continue;
    const projected = alignment.toExport(ref.cx, ref.cy);
    const synthetic = {
      sectionNumber: ref.num,
      zoomable: ref.zoomable,
      path: null,
      polygon: [],
      cx: projected.x,
      cy: projected.y,
      fill: "#3358D4",
      stroke: "#fff",
      strokeWidth: "3.5",
      identifierPath: null,
      seats: [],
      synthetic: true,
    };
    bowlSections.push(synthetic);
    sectionByNumber.set(ref.num, synthetic);
  }

  const refTargets = refBowl.map((ref) => ({
    num: ref.num,
    ...alignment.toExport(ref.cx, ref.cy),
  }));

  bowlSections.forEach((section) => {
    section.seats = [];
  });

  for (const seat of circleSeats) {
    const center = seatCenter(seat);
    let best = null;
    let bestDist = Infinity;
    for (const target of refTargets) {
      const dist = Math.hypot(center.x - target.x, center.y - target.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = target;
      }
    }
    const section = sectionByNumber.get(best?.num);
    if (section) section.seats.push(seat);
  }
}

function ensureBowlSectionPaths(bowlSections) {
  const populated = [];

  for (const section of bowlSections) {
    if (!section.seats.length) continue;

    const insideCount = section.polygon.length
      ? section.seats.filter((seat) => {
          const center = seatCenter(seat);
          return pointInPolygon(center.x, center.y, section.polygon);
        }).length
      : 0;
    const coverage = insideCount / section.seats.length;

    if (!section.path || section.synthetic || coverage < 0.6) {
      const seatBounds = boundsFromSeats(section.seats);
      if (!seatBounds) continue;
      const padding = 12;
      section.path = boundsToPath({
        minX: seatBounds.minX - padding,
        minY: seatBounds.minY - padding,
        maxX: seatBounds.maxX + padding,
        maxY: seatBounds.maxY + padding,
      });
      section.polygon = pathPoints(section.path);
      section.cx = (seatBounds.minX + seatBounds.maxX) / 2;
      section.cy = (seatBounds.minY + seatBounds.maxY) / 2;
      delete section.synthetic;
    }

    populated.push(section);
  }

  return populated;
}

function parseRawIllustratorFromDocument(doc, options = {}) {
  const referencePath = options.referenceSvg || DEFAULT_REFERENCE;
  const { DOMParser } = require("@xmldom/xmldom");
  const dimensions = getSvgDimensions(doc);
  const viewBounds = {
    minX: 0,
    minY: 0,
    maxX: dimensions.width,
    maxY: dimensions.height,
  };

  let refBowl = [];
  let referenceSeats = [];
  if (fs.existsSync(referencePath)) {
    const refDoc = new DOMParser().parseFromString(
      loadSvgInput(referencePath),
      "image/svg+xml"
    );
    refBowl = extractReferenceSections(refDoc).filter(
      (section) => !section.isTable && Number(section.num) >= 100
    );
    referenceSeats = extractReferenceSeatLabels(referencePath);
  }

  const coverPaths = Array.from(doc.getElementsByTagName("path"))
    .filter(isSectionCoverPath)
    .map((pathEl) => {
      const rawD = getAttr(pathEl, "d");
      const resolved = resolveCoverPath(rawD);
      const bounds = pathBounds(resolved.path);
      return {
        el: pathEl,
        d: resolved.path,
        rawD,
        identifierPath: resolved.identifierPath,
        polygon: pathPoints(resolved.path),
        fill: getAttr(pathEl, "fill") || "#3358D4",
        stroke: getAttr(pathEl, "stroke") || "#fff",
        strokeWidth: getAttr(pathEl, "stroke-width") || "3.5",
        ...bounds,
      };
    });

  const coverMatches = matchByCentroid(
    coverPaths,
    refBowl.map((section) => ({
      num: section.num,
      zoomable: section.zoomable,
      cx: section.cx,
      cy: section.cy,
    }))
  );

  const matchedCoverSet = new Set(coverMatches.map((match) => match.source.d));
  const unmatchedCovers = coverPaths.filter(
    (cover) => !matchedCoverSet.has(cover.d)
  );

  let bowlSections = coverMatches.map((match) =>
    buildSectionEntry(
      {
        sectionNumber: match.num,
        zoomable: match.zoomable,
        path: match.source.d,
        polygon: match.source.polygon,
        cx: match.source.cx,
        cy: match.source.cy,
        fill: match.source.fill,
        stroke: match.source.stroke,
        strokeWidth: match.source.strokeWidth,
        identifierPath: match.source.identifierPath,
        seats: [],
      },
      doc
    )
  );

  const gaSections = unmatchedCovers.map((cover, index) =>
    buildSectionEntry(
      {
        sectionNumber: index === 0 ? "ga" : `ga-${index + 1}`,
        zoomable: false,
        path: cover.d,
        polygon: cover.polygon,
        cx: cover.cx,
        cy: cover.cy,
        fill: cover.fill,
        stroke: cover.stroke,
        strokeWidth: cover.strokeWidth,
        seats: [],
      },
      doc
    )
  );

  const circleSeats = Array.from(doc.getElementsByTagName("path"))
    .filter(isSeatPath)
    .flatMap((pathEl) => {
      const token = seatTokenFromElement(pathEl);
      return extractSeatsFromPath(pathEl).map((seat) => ({
        ...seat,
        sectionNumber: token?.sectionNumber,
        rowNumber: token?.rowNumber,
        seatNumber: token?.seatNumber,
      }));
    })
    .filter((seat) => seatInViewBounds(seat, viewBounds));

  if (refBowl.length) {
    assignBowlSeatsByReference(bowlSections, circleSeats, refBowl);
    bowlSections = ensureBowlSectionPaths(bowlSections);
  } else {
    for (const seat of circleSeats) {
      const section = assignSeatToSection(seat, bowlSections);
      if (section) section.seats.push(seat);
    }
  }

  const rectSeats = Array.from(doc.getElementsByTagName("rect"))
    .map((rectEl) => {
      const token = seatTokenFromElement(rectEl);
      return {
        ...bakeRectMetrics(rectEl),
        sectionNumber: token?.sectionNumber,
        rowNumber: token?.rowNumber,
        seatNumber: token?.seatNumber,
      };
    })
    .filter((seat) => seatInViewBounds(seat, viewBounds));
  const tableGroups = clusterTableSeats(rectSeats);
  const tableSections = tableGroups.map((group) => {
    const bounds = boundsFromSeats(group.seats);
    return {
      sectionNumber: group.sectionNumber,
      zoomable: true,
      path: bounds ? boundsToPath(bounds) : null,
      polygon: bounds
        ? [
            { x: bounds.minX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.minY },
            { x: bounds.maxX, y: bounds.maxY },
            { x: bounds.minX, y: bounds.maxY },
          ]
        : [],
      cx: bounds ? (bounds.minX + bounds.maxX) / 2 : 0,
      cy: bounds ? (bounds.minY + bounds.maxY) / 2 : 0,
      fill: null,
      stroke: null,
      strokeWidth: null,
      seats: group.seats,
    };
  });

  const logicalSections = [...bowlSections, ...tableSections, ...gaSections];

  const arenaCenter =
    gaSections.length > 0
      ? { x: gaSections[0].cx, y: gaSections[0].cy }
      : arenaCenterFromDimensions(dimensions);

  const sections = {};
  const rows = {};
  const seats = {};

  logicalSections.forEach((section, sortIndex) => {
    const sectionId = uuidv4();
    const rowIds = [];
    const sectionSeatMetrics = [];

    if (section.zoomable && section.seats.length) {
      const groupedRows = groupSeatsIntoRows(
        section.seats,
        section.sectionNumber,
        arenaCenter,
        referenceSeats
      );
      groupedRows.forEach((row) => {
        const rowId = uuidv4();
        const seatIds = [];
        row.seats.forEach((seat) => {
          const seatId = uuidv4();
          seats[seatId] = {
            seatId,
            sectionId,
            rowId,
            sectionNumber: section.sectionNumber,
            rowNumber: seat.rowNumber,
            seatNumber: seat.seatNumber,
            accessible: Boolean(accessibleSeatSuffix(seat.seatNumber)),
            cx: seat.cx,
            cy: seat.cy,
            w: seat.w,
            h: seat.h,
          };
          seatIds.push(seatId);
          sectionSeatMetrics.push(seat);
        });
        rows[rowId] = {
          rowId,
          sectionId,
          sectionNumber: section.sectionNumber,
          rowNumber: row.rowNumber,
          seats: seatIds,
        };
        rowIds.push(rowId);
      });
    }

    const sectionEntry = {
      sectionId,
      sectionNumber: section.sectionNumber,
      sectionName:
        section.sectionNumber === "ga"
          ? "GA Floor"
          : `Section ${section.sectionNumber}`,
      path: section.path,
      rows: rowIds,
      zoomable: section.zoomable,
      fill: section.fill,
      stroke: section.stroke,
      strokeWidth: section.strokeWidth,
      identifier: section.identifier || {
        path: null,
        fill: null,
        opacity: null,
      },
      sortOrder: section.cy || sortIndex,
    };

    if (!section.zoomable && options.gaSpots > 0) {
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
      gaSections: gaSections.length,
      bowlSections: bowlSections.length,
      tableSections: tableSections.length,
      matchedCovers: coverMatches.length,
      gaCovers: gaSections.length,
      dimensions,
      normalizedSections: 0,
      bakedTransforms: 0,
      parser: "raw-illustrator",
      referenceUsed: refBowl.length > 0,
      referenceSeats: referenceSeats.length,
      sellOrderApplied: Boolean(options.hotspot),
    },
  };
}

function isBlockticketsSvg(doc) {
  const groups = doc.getElementsByTagName("g");
  for (let i = 0; i < groups.length; i++) {
    const group = groups.item(i);
    const cls = getAttr(group, "class");
    if (/^sec-[^\s-]+\s+(YZ|NZ)$/i.test(cls)) return true;

    const id = getAttr(group, "id");
    if (/^sec-[^-]+_(YZ|NZ)$/i.test(id) && !id.includes("-row-")) {
      return true;
    }

    const token = id || cls.split(/\s+/).filter(Boolean)[0] || "";
    if (ROW_GROUP_RE.test(token)) return true;
  }

  const rects = doc.getElementsByTagName("rect");
  for (let i = 0; i < rects.length; i++) {
    const token =
      (getAttr(rects.item(i), "class") || getAttr(rects.item(i), "id") || "")
        .split(/\s+/)[0];
    if (ROW_SEAT_RE.test(token)) return true;
  }

  const paths = doc.getElementsByTagName("path");
  for (let i = 0; i < paths.length; i++) {
    const token =
      (getAttr(paths.item(i), "class") || getAttr(paths.item(i), "id") || "")
        .split(/\s+/)[0];
    if (ROW_SEAT_RE.test(token)) return true;
  }

  return false;
}

module.exports = {
  parseRawIllustratorFromDocument,
  isBlockticketsSvg,
  DEFAULT_REFERENCE,
};
