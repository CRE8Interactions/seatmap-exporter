const HOTSPOT_COLORS = [
  "rgba(227, 81, 81, 1)",
  "rgba(84, 227, 141, 0.58)",
  "rgba(85, 227, 227, 0.71)",
  "rgba(86, 151, 227, 0.84)",
  "rgba(110, 81, 227, 1)",
];

const COLOR_SCALE_DOMAIN = [0.2, 0.4, 0.6, 0.8, 1];

function scaleLinear(domain, range, value) {
  if (domain.length !== range.length || domain.length < 2) {
    return range[range.length - 1];
  }
  if (value <= domain[0]) return range[0];
  if (value >= domain[domain.length - 1]) return range[range.length - 1];

  for (let i = 0; i < domain.length - 1; i++) {
    const d0 = domain[i];
    const d1 = domain[i + 1];
    if (value >= d0 && value <= d1) {
      const t = (value - d0) / (d1 - d0);
      return interpolateColor(range[i], range[i + 1], t);
    }
  }

  return range[range.length - 1];
}

function parseRgba(color) {
  const match = color.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/
  );
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  };
}

function interpolateColor(from, to, t) {
  const a = parseRgba(from);
  const b = parseRgba(to);
  if (!a || !b) return to;
  const mix = (start, end) => start + (end - start) * t;
  return `rgba(${Math.round(mix(a.r, b.r))}, ${Math.round(mix(a.g, b.g))}, ${Math.round(mix(a.b, b.b))}, ${mix(a.a, b.a)})`;
}

function euclideanDistance(seat, hotspot) {
  const xDiff = hotspot.x - seat.cx;
  const yDiff = hotspot.y - seat.cy;
  return Math.sqrt(xDiff * xDiff + yDiff * yDiff);
}

function computeRowSortOrder(row, mapping) {
  let hotspotFill = null;
  let minSortOrder = 10;

  row.seats.forEach((seatId) => {
    const targetSeat = mapping.seats[seatId];
    if (!targetSeat || targetSeat.sortOrder === undefined) return;
    if (targetSeat.sortOrder < minSortOrder) {
      minSortOrder = targetSeat.sortOrder;
      hotspotFill = targetSeat.hotspotFill;
    }
  });

  return { sortOrder: minSortOrder, hotspotFill };
}

function computeSectionSortOrder(section, mapping) {
  let hotspotFill = null;
  let minSortOrder = 10;

  section.rows.forEach((rowId) => {
    const targetRow = mapping.rows[rowId];
    if (!targetRow || targetRow.sortOrder === undefined) return;
    if (targetRow.sortOrder < minSortOrder) {
      minSortOrder = targetRow.sortOrder;
      hotspotFill = targetRow.hotspotFill;
    }
  });

  return { sortOrder: minSortOrder, hotspotFill };
}

function resolveTargetSectionIds(mapping, targetSectionIds) {
  if (Array.isArray(targetSectionIds) && targetSectionIds.length) {
    const allowed = new Set(targetSectionIds);
    return Object.values(mapping.sections)
      .filter((section) => allowed.has(section.sectionId))
      .map((section) => section.sectionId);
  }

  return Object.values(mapping.sections)
    .filter((section) => section.zoomable)
    .map((section) => section.sectionId);
}

function applySellOrder(mapping, hotspot, options = {}) {
  if (!mapping?.seats || !hotspot || !Number.isFinite(hotspot.x) || !Number.isFinite(hotspot.y)) {
    return mapping;
  }

  const targetSectionIds = resolveTargetSectionIds(
    mapping,
    options.targetSectionIds
  );
  const targetSet = new Set(targetSectionIds);
  const distances = [];

  Object.values(mapping.seats).forEach((seat) => {
    if (!targetSet.has(seat.sectionId)) return;
    const distance = euclideanDistance(seat, hotspot);
    seat.distance = distance;
    distances.push(distance);
  });

  if (!distances.length) {
    return mapping;
  }

  const maxDistance = Math.max(...distances);
  const minDistance = Math.min(...distances);
  const distanceSpan = maxDistance - minDistance;

  Object.values(mapping.seats).forEach((seat) => {
    if (!targetSet.has(seat.sectionId)) return;

    const normalizedDistance =
      distanceSpan === 0
        ? 0
        : (seat.distance - minDistance) / distanceSpan;

    seat.hotspotFill = scaleLinear(
      COLOR_SCALE_DOMAIN,
      HOTSPOT_COLORS,
      normalizedDistance
    );
    seat.sortOrder = normalizedDistance;
  });

  Object.values(mapping.rows).forEach((row) => {
    const { sortOrder, hotspotFill } = computeRowSortOrder(row, mapping);
    row.sortOrder = sortOrder;
    row.hotspotFill = hotspotFill;
  });

  Object.values(mapping.sections).forEach((section) => {
    if (section.zoomable) {
      const { sortOrder, hotspotFill } = computeSectionSortOrder(section, mapping);
      section.sortOrder = sortOrder;
      section.hotspotFill = hotspotFill;
    } else {
      section.sortOrder = 0;
    }
  });

  return mapping;
}

function prepareMappingForExport(mapping) {
  const cleaned = JSON.parse(JSON.stringify(mapping));
  const previewProps = [
    "hotspotFill",
    "screenshot",
    "allAssigned",
    "selected",
    "floorfill",
    "distance",
  ];

  Object.values(cleaned.sections || {}).forEach((section) => {
    previewProps.forEach((prop) => delete section[prop]);
  });

  Object.values(cleaned.rows || {}).forEach((row) => {
    previewProps.forEach((prop) => delete row[prop]);
  });

  Object.values(cleaned.seats || {}).forEach((seat) => {
    previewProps.forEach((prop) => delete seat[prop]);
    delete seat.sortOrder;
  });

  return cleaned;
}

module.exports = {
  applySellOrder,
  prepareMappingForExport,
  HOTSPOT_COLORS,
};
