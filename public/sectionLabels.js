const LEFT_STACK_LABEL_SECTIONS = new Set(["101", "102", "103"]);

function isLabelBackdropPath(pathData) {
  if (!pathData) return false;
  return !/[CcSsQqTtAa]/.test(String(pathData).replace(/\s+/g, ""));
}

function getSectionLabelAnchor(rect, sectionNumber) {
  const raw = String(sectionNumber ?? "").trim();
  const y = rect.y + rect.height / 2;
  if (LEFT_STACK_LABEL_SECTIONS.has(raw)) {
    return { x: rect.x + rect.width * 0.3, y };
  }
  return { x: rect.x + rect.width / 2, y };
}

function computeLabelLayout(rect, label) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const rawText = String(label ?? "").trim();
  if (!rawText) return null;

  const upper = rawText.toUpperCase();
  const isNumeric = /^\d+$/.test(upper);
  const isClub = upper.startsWith("CLUB");
  const text =
    upper.includes(" ") && rect.height >= 1.4 * rect.width
      ? upper.replace(/\s+/, "\n")
      : upper;
  const longestLine = text
    .split("\n")
    .reduce((max, line) => Math.max(max, line.length), 1);
  const maxByHeight = rect.height * (isNumeric ? 0.24 : isClub ? 0.2 : 0.22);
  const maxByWidth = rect.width / (longestLine * 0.72);
  const maxFont = isNumeric ? 44 : isClub ? 28 : 36;

  const anchor = getSectionLabelAnchor(rect, label);
  return {
    text,
    x: anchor.x,
    y: anchor.y,
    fontSize: Math.max(9, Math.min(maxFont, maxByHeight, maxByWidth)),
  };
}

function measurePathBox(svg, pathData) {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  svg.appendChild(path);
  const box = path.getBBox();
  svg.removeChild(path);
  return box;
}

function computeIdentifierTransform(sectionBox, identifierBox, sectionNumber) {
  if (
    !sectionBox?.width ||
    !sectionBox?.height ||
    !identifierBox?.width ||
    !identifierBox?.height
  ) {
    return null;
  }

  const rawNumber = String(sectionNumber ?? "").trim();
  const isNumeric = /^\d+$/.test(rawNumber);
  const isGa = /^ga/i.test(rawNumber);
  const widthCap = isNumeric ? 0.42 : isGa ? 0.46 : 0.5;
  const heightCap = isNumeric ? 0.28 : isGa ? 0.3 : 0.34;
  const scale = Math.min(
    (sectionBox.width * widthCap) / identifierBox.width,
    (sectionBox.height * heightCap) / identifierBox.height,
    1
  );

  const anchor = getSectionLabelAnchor(sectionBox, sectionNumber);
  const idCenterX = identifierBox.x + identifierBox.width / 2;
  const idCenterY = identifierBox.y + identifierBox.height / 2;

  return `translate(${anchor.x},${anchor.y}) scale(${scale}) translate(${-idCenterX},${-idCenterY})`;
}

function appendSectionLabel(labelLayer, sectionLayer, section, measureSvg) {
  const sectionPath = sectionLayer.querySelector(
    `[data-section-id="${section.sectionId}"]`
  );
  if (!sectionPath) return;

  const sectionBox = sectionPath.getBBox();

  if (section.identifier?.path && !isLabelBackdropPath(section.identifier.path)) {
    const idBox = measurePathBox(measureSvg, section.identifier.path);
    const transform = computeIdentifierTransform(
      sectionBox,
      idBox,
      section.sectionNumber
    );
    if (!transform) return;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", section.identifier.path);
    path.setAttribute("transform", transform);
    path.setAttribute("fill", section.identifier.fill || "#ffffff");
    if (section.identifier.opacity) {
      path.setAttribute("opacity", section.identifier.opacity);
    }
    path.setAttribute("class", "section-label-art");
    labelLayer.appendChild(path);
    return;
  }

  const layout = computeLabelLayout(sectionBox, section.sectionNumber);
  if (!layout) return;

  const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
  text.setAttribute("x", layout.x);
  text.setAttribute("y", layout.y);
  text.setAttribute("fill", "#ffffff");
  text.setAttribute("font-size", layout.fontSize);
  text.setAttribute("font-weight", "700");
  text.setAttribute(
    "font-family",
    'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
  );
  text.setAttribute("text-anchor", "middle");
  text.setAttribute("dominant-baseline", "middle");
  text.setAttribute("class", "section-label-text");

  layout.text.split("\n").forEach((line, index) => {
    const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    tspan.setAttribute("x", layout.x);
    tspan.setAttribute("dy", index === 0 ? 0 : layout.fontSize * 0.9);
    tspan.textContent = line;
    text.appendChild(tspan);
  });

  labelLayer.appendChild(text);
}

function renderSectionPreview({ mapping, dimensions, backgroundPng, svgEl, measureSvg }) {
  svgEl.setAttribute("viewBox", dimensions.viewBox);
  svgEl.setAttribute("overflow", "hidden");
  svgEl.innerHTML = "";

  const backgroundImage = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "image"
  );
  backgroundImage.setAttribute("width", dimensions.width);
  backgroundImage.setAttribute("height", dimensions.height);
  backgroundImage.setAttribute(
    "href",
    backgroundPng ? `data:image/png;base64,${backgroundPng}` : ""
  );
  svgEl.appendChild(backgroundImage);

  const sectionLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  sectionLayer.setAttribute("id", "sectionPreviewLayer");
  svgEl.appendChild(sectionLayer);

  const labelLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  labelLayer.setAttribute("id", "sectionLabelLayer");
  svgEl.appendChild(labelLayer);

  Object.values(mapping.sections).forEach((section) => {
    if (!section.path) return;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", section.path);
    path.setAttribute("data-section-id", section.sectionId);
    path.setAttribute(
      "class",
      section.zoomable ? "section-preview-hit" : "section-preview-ga"
    );

    if (section.zoomable) {
      if (section.stroke) path.setAttribute("stroke", section.stroke);
      if (section.strokeWidth) {
        path.setAttribute("stroke-width", section.strokeWidth);
      }
    }

    sectionLayer.appendChild(path);
  });

  Object.values(mapping.sections).forEach((section) => {
    if (!section.path) return;
    appendSectionLabel(labelLayer, sectionLayer, section, measureSvg);
  });
}
