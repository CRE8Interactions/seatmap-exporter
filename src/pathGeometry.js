const ARC_RE = /a4\.1 4\.1/;

function tokenizePath(d) {
  if (!d) return [];
  const tokens = [];
  const re = /([MmLlHhVvZzCcSsQqTtAa])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  let match;
  while ((match = re.exec(d))) {
    if (match[1]) tokens.push({ type: "cmd", value: match[1] });
    else tokens.push({ type: "num", value: parseFloat(match[2]) });
  }
  return tokens;
}

function pathPoints(d) {
  const tokens = tokenizePath(d);
  const points = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let cmd = "";

  const read = () => tokens[i++].value;

  while (i < tokens.length) {
    if (tokens[i].type === "cmd") cmd = tokens[i++].value;
    else if (!cmd) break;

    switch (cmd) {
      case "M":
        x = read();
        y = read();
        startX = x;
        startY = y;
        points.push({ x, y });
        cmd = "L";
        break;
      case "m":
        x += read();
        y += read();
        startX = x;
        startY = y;
        points.push({ x, y });
        cmd = "l";
        break;
      case "L":
        x = read();
        y = read();
        points.push({ x, y });
        break;
      case "l":
        x += read();
        y += read();
        points.push({ x, y });
        break;
      case "H":
        x = read();
        points.push({ x, y });
        break;
      case "h":
        x += read();
        points.push({ x, y });
        break;
      case "V":
        y = read();
        points.push({ x, y });
        break;
      case "v":
        y += read();
        points.push({ x, y });
        break;
      case "Z":
      case "z":
        x = startX;
        y = startY;
        points.push({ x, y });
        break;
      case "A":
      case "a": {
        const nums = [];
        while (i < tokens.length && tokens[i].type === "num") nums.push(read());
        // SVG allows multiple arc segments after one A/a command (7 args each).
        for (let offset = 0; offset + 6 < nums.length; offset += 7) {
          if (cmd === "A") {
            x = nums[offset + 5];
            y = nums[offset + 6];
          } else {
            x += nums[offset + 5];
            y += nums[offset + 6];
          }
          points.push({ x, y });
        }
        break;
      }
      default: {
        const upper = cmd.toUpperCase();
        const argCount = { C: 6, S: 4, Q: 4, T: 2 }[upper] || 0;
        const nums = [];
        while (i < tokens.length && tokens[i].type === "num") nums.push(read());
        if (argCount && nums.length >= argCount) {
          for (let offset = 0; offset + argCount - 1 < nums.length; offset += argCount) {
            const endX = nums[offset + argCount - 2];
            const endY = nums[offset + argCount - 1];
            if (cmd === upper) {
              x = endX;
              y = endY;
            } else {
              x += endX;
              y += endY;
            }
            points.push({ x, y });
          }
        }
        break;
      }
    }
  }

  return points;
}

function pathBounds(d) {
  const points = pathPoints(d);
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    w: maxX - minX,
    h: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

function extractCircleCenters(d) {
  const tokens = tokenizePath(d);
  const centers = [];
  const seatSize = 8.2;
  let i = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let anchorX = 0;
  let anchorY = 0;

  const read = () => tokens[i++].value;

  const recordSeat = () => {
    centers.push({
      cx: x - seatSize / 2,
      cy: y - seatSize / 2,
      w: seatSize,
      h: seatSize,
    });
  };

  while (i < tokens.length) {
    if (tokens[i].type === "cmd") cmd = tokens[i++].value;
    else if (!cmd) break;

    switch (cmd) {
      case "M":
        x = read();
        y = read();
        anchorX = x;
        anchorY = y;
        recordSeat();
        cmd = "L";
        break;
      case "m":
        x += read();
        y += read();
        anchorX = x;
        anchorY = y;
        recordSeat();
        cmd = "l";
        break;
      case "Z":
      case "z":
        x = anchorX;
        y = anchorY;
        break;
      case "L":
        x = read();
        y = read();
        break;
      case "l":
        x += read();
        y += read();
        break;
      case "H":
        x = read();
        break;
      case "h":
        x += read();
        break;
      case "V":
        y = read();
        break;
      case "v":
        y += read();
        break;
      case "A":
      case "a": {
        const nums = [];
        while (i < tokens.length && tokens[i].type === "num") nums.push(read());
        for (let offset = 0; offset + 6 < nums.length; offset += 7) {
          if (cmd === "A") {
            x = nums[offset + 5];
            y = nums[offset + 6];
          } else {
            x += nums[offset + 5];
            y += nums[offset + 6];
          }
        }
        break;
      }
      default: {
        const upper = cmd.toUpperCase();
        const argCount = { C: 6, S: 4, Q: 4, T: 2 }[upper] || 0;
        const nums = [];
        while (i < tokens.length && tokens[i].type === "num") nums.push(read());
        if (argCount && nums.length >= argCount) {
          for (let offset = 0; offset + argCount - 1 < nums.length; offset += argCount) {
            const endX = nums[offset + argCount - 2];
            const endY = nums[offset + argCount - 1];
            if (cmd === upper) {
              x = endX;
              y = endY;
            } else {
              x += endX;
              y += endY;
            }
          }
        }
        break;
      }
    }
  }

  return centers;
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 0.000001) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function bakeRectMetrics(rectEl) {
  let x = parseFloat(rectEl.getAttribute("x") || "0");
  let y = parseFloat(rectEl.getAttribute("y") || "0");
  const w = parseFloat(rectEl.getAttribute("width") || "0");
  const h = parseFloat(rectEl.getAttribute("height") || "0");
  const transform = rectEl.getAttribute("transform") || "";
  const rotateMatch = transform.match(
    /^rotate\(\s*(-180|180)\s+([-\d.]+)\s+([-\d.]+)\s*\)$/
  );
  if (rotateMatch) {
    const pivotX = parseFloat(rotateMatch[2]);
    const pivotY = parseFloat(rotateMatch[3]);
    if (Math.abs(pivotX - x) < 0.01 && Math.abs(pivotY - y) < 0.01) {
      x -= w;
      y -= h;
    }
  }
  return { cx: x, cy: y, w, h };
}

const SEAT_BLUE = "#3358d4";
const SEAT_SIZE = 8.2;

function normalizeColor(value) {
  return (value || "").trim().toLowerCase();
}

function isSeatBlueFill(pathEl) {
  return normalizeColor(pathEl.getAttribute("fill")) === SEAT_BLUE;
}

function isWhiteStroke(pathEl) {
  const stroke = normalizeColor(pathEl.getAttribute("stroke"));
  return stroke === "#fff" || stroke === "white" || stroke === "#ffffff";
}

function isSeatCompoundPath(pathEl) {
  const d = pathEl.getAttribute("d") || "";
  return isSeatBlueFill(pathEl) && ARC_RE.test(d);
}

function isIndividualSeatCircle(pathEl) {
  if (!isSeatBlueFill(pathEl) || pathEl.getAttribute("stroke")) return false;

  const d = pathEl.getAttribute("d") || "";
  if (ARC_RE.test(d)) return false;

  const bounds = pathBounds(d);
  if (!bounds) return false;

  const maxDim = Math.max(bounds.w, bounds.h);
  return maxDim > 0 && maxDim <= 15 && /[cC]/.test(d);
}

function isSeatPath(pathEl) {
  return isSeatCompoundPath(pathEl) || isIndividualSeatCircle(pathEl);
}

function extractSeatFromCirclePath(d) {
  const moveMatch = (d || "").match(/^M\s*([-\d.]+)(?:\s+|,)([-\d.]+)/i);
  if (moveMatch) {
    const mx = parseFloat(moveMatch[1]);
    const my = parseFloat(moveMatch[2]);
    return {
      cx: mx,
      cy: my - SEAT_SIZE,
      w: SEAT_SIZE,
      h: SEAT_SIZE,
    };
  }

  const bounds = pathBounds(d);
  if (!bounds) return null;

  return {
    cx: bounds.minX,
    cy: bounds.minY,
    w: SEAT_SIZE,
    h: SEAT_SIZE,
  };
}

function extractSeatsFromPath(pathEl) {
  const d = pathEl.getAttribute("d") || "";
  if (isSeatCompoundPath(pathEl)) return extractCircleCenters(d);
  if (isIndividualSeatCircle(pathEl)) {
    const seat = extractSeatFromCirclePath(d);
    return seat ? [seat] : [];
  }
  return [];
}

function splitPathSubpaths(d) {
  if (!d) return [];
  return d
    .split(/(?=M)/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isLabelBackdropPath(d) {
  if (!d) return false;
  // Outlined section numbers from Illustrator use bezier curves; label
  // backdrop boxes (horizontal rects and corner diamonds) do not.
  return !/[CcSsQqTtAa]/.test(d.replace(/\s+/g, ""));
}

function isIdentifierSizedBounds(bounds) {
  return bounds && bounds.h <= 140 && bounds.w <= 200;
}

function resolveCoverPath(d) {
  const subpaths = splitPathSubpaths(d);
  if (!subpaths.length) {
    return { path: d, identifierPath: null };
  }
  if (subpaths.length === 1) {
    return { path: d, identifierPath: null };
  }

  const scored = subpaths
    .map((path) => {
      const bounds = pathBounds(path);
      return { path, bounds, area: bounds ? bounds.w * bounds.h : 0 };
    })
    .filter((entry) => entry.bounds);

  scored.sort((a, b) => b.area - a.area);
  const primary = scored[0];

  // Bowl covers are usually one large tile + a small label glyph. GA floors
  // are often exported as many large tiles in one compound path — keep them.
  const largeSubpaths = scored.filter(
    (entry) => !isIdentifierSizedBounds(entry.bounds)
  );
  if (largeSubpaths.length > 1) {
    return { path: d, identifierPath: null };
  }

  // Only curved (outlined number) subpaths are label glyphs. Small rects are
  // often cover extensions into aisles/vomitories — keep those in the cover.
  const identifierCandidates = scored.filter(
    (entry) =>
      entry !== primary &&
      isIdentifierSizedBounds(entry.bounds) &&
      !isLabelBackdropPath(entry.path)
  );

  identifierCandidates.sort((a, b) => {
    const aHasCurves = /[CcSsQqTtAa]/.test(a.path) ? 1 : 0;
    const bHasCurves = /[CcSsQqTtAa]/.test(b.path) ? 1 : 0;
    if (aHasCurves !== bHasCurves) return bHasCurves - aHasCurves;
    return a.area - b.area;
  });

  const identifierPath = identifierCandidates[0]?.path || null;
  const coverPath = identifierPath
    ? subpaths.filter((path) => path !== identifierPath).join("")
    : d;

  return {
    path: coverPath || primary?.path || d,
    identifierPath,
  };
}

function isValidBowlCoverBounds(bounds) {
  if (!bounds) return false;
  if (bounds.h > 450) return false;
  if (bounds.w * bounds.h > 200000) return false;
  return true;
}

function isSectionCoverPath(pathEl) {
  const d = pathEl.getAttribute("d") || "";
  if (!isSeatBlueFill(pathEl) || !isWhiteStroke(pathEl)) return false;
  if (ARC_RE.test(d)) return false;
  if (/^M[\d.-]+\s+[\d.-]+h[\d.-]+v[\d.-]+h-/.test(d.replace(/\s+/g, ""))) {
    return false;
  }
  const resolved = resolveCoverPath(d);
  const bounds = pathBounds(resolved.path);
  if (!bounds) return false;
  if (!isValidBowlCoverBounds(bounds)) return false;
  return bounds.w >= 80 && bounds.h >= 80;
}

module.exports = {
  pathBounds,
  pathPoints,
  splitPathSubpaths,
  isLabelBackdropPath,
  resolveCoverPath,
  isValidBowlCoverBounds,
  extractCircleCenters,
  extractSeatsFromPath,
  pointInPolygon,
  bakeRectMetrics,
  isSeatCompoundPath,
  isIndividualSeatCircle,
  isSeatPath,
  isSectionCoverPath,
};
