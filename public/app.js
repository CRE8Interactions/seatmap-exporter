let latestResult = null;

const svgInput = document.getElementById("svgInput");
const processBtn = document.getElementById("processBtn");
const statusEl = document.getElementById("status");
const statsPanel = document.getElementById("statsPanel");
const gaCapacityPanel = document.getElementById("gaCapacityPanel");
const gaCapacityList = document.getElementById("gaCapacityList");
const previewPanel = document.getElementById("previewPanel");
const sectionPreviewPanel = document.getElementById("sectionPreviewPanel");
const highlightsPanel = document.getElementById("highlightsPanel");
const highlightSectionSelect = document.getElementById("highlightSectionSelect");
const highlightPreviewImage = document.getElementById("highlightPreviewImage");
const statsEl = document.getElementById("stats");
const dimensionsEl = document.getElementById("dimensions");
const previewSvg = document.getElementById("previewSvg");
const previewViewport = document.getElementById("previewViewport");
const previewStage = document.getElementById("previewStage");
const seatTooltip = document.getElementById("seatTooltip");
const sectionPreviewSvg = document.getElementById("sectionPreviewSvg");
const sectionPreviewViewport = document.getElementById("sectionPreviewViewport");
const measureSvg = document.getElementById("measureSvg");
const backgroundImage = document.getElementById("backgroundImage");
const seatLayer = document.getElementById("seatLayer");
const sectionLayer = document.getElementById("sectionLayer");

let previewViewportController = null;
let sectionViewport = null;
const gaCapacities = {};
const sellOrderUi = createSellOrderUi({
  getLatestResult: () => latestResult,
  setLatestResult: (result) => {
    latestResult = result;
  },
});

svgInput.addEventListener("change", () => {
  processBtn.disabled = !svgInput.files?.length;
  statusEl.textContent = svgInput.files?.length
    ? `Selected ${svgInput.files[0].name}`
    : "Choose an SVG to begin.";
});

processBtn.addEventListener("click", async () => {
  const file = svgInput.files?.[0];
  if (!file) return;

  processBtn.disabled = true;
  statusEl.textContent = "Processing...";

  try {
    const formData = new FormData();
    formData.append("svg", file);
    formData.append("gaSpots", "0");

    const response = await fetch("/api/process", {
      method: "POST",
      body: formData,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(
        "Server returned HTML instead of JSON. The API is not running — deploy as a Web Service with `npm start`, not as a Static Site."
      );
    }
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Processing failed.");
    }

    latestResult = payload;
    statsEl.textContent = JSON.stringify(payload.stats, null, 2);
    statsPanel.classList.remove("hidden");
    renderGaCapacityPanel(payload.mapping, payload.capacities);
    previewPanel.classList.remove("hidden");
    sectionPreviewPanel.classList.remove("hidden");
    renderHighlightsPanel(payload);
    sellOrderUi.resetWorkflow();
    sellOrderUi.showPanel();
    renderPreview(payload);
    previewViewportController = mountSvgViewport({
      container: previewViewport,
      svgEl: previewSvg,
      viewBox: payload.dimensions.viewBox,
    });
    renderSectionPreview({
      mapping: payload.mapping,
      dimensions: payload.dimensions,
      backgroundPng: payload.backgroundPng,
      svgEl: sectionPreviewSvg,
      measureSvg,
    });
    sectionViewport = mountSvgViewport({
      container: sectionPreviewViewport,
      svgEl: sectionPreviewSvg,
      viewBox: payload.dimensions.viewBox,
    });
    statusEl.textContent = "Processed successfully.";
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    processBtn.disabled = false;
  }
});

function hideSeatTooltip() {
  seatTooltip.classList.add("hidden");
  seatTooltip.textContent = "";
}

function showSeatTooltip(seat, clientX, clientY) {
  const label = `Section ${seat.sectionNumber} · Row ${seat.rowNumber} · Seat ${seat.seatNumber}`;
  seatTooltip.textContent = label;
  seatTooltip.classList.remove("hidden");

  const stageRect = previewStage.getBoundingClientRect();
  const tooltipRect = seatTooltip.getBoundingClientRect();
  let left = clientX - stageRect.left + 12;
  let top = clientY - stageRect.top - tooltipRect.height - 10;

  if (left + tooltipRect.width > stageRect.width - 8) {
    left = stageRect.width - tooltipRect.width - 8;
  }
  if (left < 8) left = 8;
  if (top < 8) top = clientY - stageRect.top + 12;

  seatTooltip.style.left = `${left}px`;
  seatTooltip.style.top = `${top}px`;
}

function renderPreview(payload) {
  const { mapping, dimensions, backgroundPng } = payload;
  previewSvg.setAttribute("viewBox", dimensions.viewBox);
  previewSvg.setAttribute("overflow", "hidden");
  backgroundImage.setAttribute("width", dimensions.width);
  backgroundImage.setAttribute("height", dimensions.height);
  backgroundImage.setAttribute(
    "href",
    backgroundPng
      ? `data:image/png;base64,${backgroundPng}`
      : ""
  );

  seatLayer.innerHTML = "";
  sectionLayer.innerHTML = "";
  hideSeatTooltip();

  const [viewMinX, viewMinY, viewWidth, viewHeight] = dimensions.viewBox
    .split(/\s+/)
    .map(Number);
  const viewMaxX = viewMinX + viewWidth;
  const viewMaxY = viewMinY + viewHeight;

  function appendSeat(seat) {
    const cx = seat.cx + seat.w / 2;
    const cy = seat.cy + seat.h / 2;
    if (cx < viewMinX || cx > viewMaxX || cy < viewMinY || cy > viewMaxY) {
      return;
    }
    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", seat.cx);
    rect.setAttribute("y", seat.cy);
    rect.setAttribute("width", seat.w);
    rect.setAttribute("height", seat.h);
    rect.setAttribute("rx", Math.min(seat.w, seat.h) / 2);
    rect.setAttribute("class", "seat-dot seat-dot-interactive");
    rect.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    rect.addEventListener("click", (event) => {
      event.stopPropagation();
      showSeatTooltip(seat, event.clientX, event.clientY);
    });
    seatLayer.appendChild(rect);
  }

  Object.values(mapping.seats).forEach(appendSeat);

  Object.values(mapping.sections).forEach((section) => {
    if (!section.path) return;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", section.path);
    path.setAttribute("class", section.zoomable ? "section-hit" : "section-ga");
    if (section.stroke) path.setAttribute("stroke", section.stroke);
    if (section.strokeWidth) path.setAttribute("stroke-width", section.strokeWidth);
    sectionLayer.appendChild(path);
  });

  dimensionsEl.textContent = JSON.stringify(dimensions, null, 2);
}

function gaSections(mapping) {
  return Object.values(mapping.sections)
    .filter((section) => !section.zoomable)
    .sort((a, b) =>
      String(a.sectionNumber).localeCompare(String(b.sectionNumber), undefined, {
        numeric: true,
      })
    );
}

function svgQcSectionNumber(sectionNumber) {
  return String(sectionNumber).trim().replace(/[\s-]+/g, "_");
}

function renderGaCapacityPanel(mapping, importedCapacities = {}) {
  const sections = gaSections(mapping);
  gaCapacityList.innerHTML = "";

  Object.keys(gaCapacities).forEach((key) => delete gaCapacities[key]);

  if (!sections.length) {
    gaCapacityPanel.classList.add("hidden");
    return;
  }

  gaCapacityPanel.classList.remove("hidden");

  sections.forEach((section) => {
    const importedCapacity = Math.max(
      0,
      Number(
        importedCapacities[String(section.sectionNumber)] ??
          importedCapacities[svgQcSectionNumber(section.sectionNumber)]
      ) || 0
    );
    gaCapacities[section.sectionId] = importedCapacity;

    const row = document.createElement("div");
    row.className = "ga-capacity-row";

    const label = document.createElement("div");
    label.className = "ga-capacity-label";
    label.innerHTML = `
      <strong>${section.sectionName || `Section ${section.sectionNumber}`}</strong>
      <span>Section ${section.sectionNumber} · non-zoomable GA area from SVG</span>
    `;

    const inputWrap = document.createElement("div");
    inputWrap.className = "ga-capacity-input";

    const inputLabel = document.createElement("label");
    inputLabel.className = "inline-label";
    inputLabel.innerHTML = `
      <span>Ticket spots</span>
      <input
        type="number"
        min="0"
        step="1"
        value="${importedCapacity}"
        data-section-id="${section.sectionId}"
      />
    `;

    const input = inputLabel.querySelector("input");
    input.addEventListener("input", () => {
      gaCapacities[section.sectionId] = Math.max(
        0,
        parseInt(input.value || "0", 10) || 0
      );
    });

    inputWrap.appendChild(inputLabel);
    row.appendChild(label);
    row.appendChild(inputWrap);
    gaCapacityList.appendChild(row);
  });
}

function applyGaSpotsToMapping(mapping) {
  const nextMapping = {
    sections: { ...mapping.sections },
    rows: mapping.rows,
    seats: mapping.seats,
  };

  Object.values(nextMapping.sections).forEach((section) => {
    if (section.zoomable) return;
    const count = gaCapacities[section.sectionId] || 0;
    if (count > 0) {
      nextMapping.sections[section.sectionId] = {
        ...section,
        spots: Array.from({ length: count }, () => crypto.randomUUID()),
      };
    } else if (section.spots) {
      const { spots, ...rest } = section;
      nextMapping.sections[section.sectionId] = rest;
    }
  });

  return nextMapping;
}

function sortedHighlightSections(mapping) {
  return Object.values(mapping.sections)
    .filter((section) => section.path)
    .sort((a, b) =>
      String(a.sectionNumber).localeCompare(String(b.sectionNumber), undefined, {
        numeric: true,
      })
    );
}

function renderHighlightsPanel(payload) {
  const highlights = payload.sectionHighlights;
  if (!highlights || !Object.keys(highlights).length) {
    highlightsPanel.classList.add("hidden");
    return;
  }

  highlightsPanel.classList.remove("hidden");
  highlightSectionSelect.innerHTML = "";

  sortedHighlightSections(payload.mapping).forEach((section) => {
    const key = String(section.sectionNumber).toLowerCase();
    if (!highlights[key]) return;
    const option = document.createElement("option");
    option.value = key;
    option.textContent = section.sectionName || `Section ${section.sectionNumber}`;
    highlightSectionSelect.appendChild(option);
  });

  highlightSectionSelect.onchange = () => {
    updateHighlightPreview(highlights, highlightSectionSelect.value);
  };

  if (highlightSectionSelect.options.length) {
    updateHighlightPreview(highlights, highlightSectionSelect.value);
  }
}

function updateHighlightPreview(highlights, sectionKey) {
  const base64 = highlights[sectionKey];
  if (!base64) {
    highlightPreviewImage.removeAttribute("src");
    return;
  }
  highlightPreviewImage.src = `data:image/png;base64,${base64}`;
}

document.getElementById("downloadHighlightsZipBtn").addEventListener("click", async () => {
  const highlights = latestResult?.sectionHighlights;
  if (!highlights || !window.JSZip) return;

  const zip = new JSZip();
  const folder = zip.folder("highlights");
  Object.entries(highlights).forEach(([sectionNumber, base64]) => {
    folder.file(`${sectionNumber}.png`, base64, { base64: true });
  });

  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, "section-highlights.zip", "application/zip");
});

function getExportMapping() {
  if (!latestResult) return null;
  return prepareMappingForExport(applyGaSpotsToMapping(latestResult.mapping));
}

function getSvgQcCapacities(mapping) {
  const capacities = {};

  Object.values(mapping.sections).forEach((section) => {
    const sectionNumber = svgQcSectionNumber(section.sectionNumber);
    capacities[sectionNumber] = section.zoomable
      ? Object.values(mapping.seats).filter(
          (seat) => seat.sectionId === section.sectionId
        ).length
      : gaCapacities[section.sectionId] || 0;
  });

  return capacities;
}

previewStage.addEventListener("click", (event) => {
  if (event.target.closest(".seat-dot-interactive")) return;
  hideSeatTooltip();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideSeatTooltip();
});

document.getElementById("downloadJsonBtn").addEventListener("click", () => {
  const exportMapping = getExportMapping();
  if (!exportMapping) return;
  downloadBlob(
    JSON.stringify(exportMapping, null, 2),
    "seatmap-mapping.json",
    "application/json"
  );
});

document.getElementById("downloadSvgQcBtn").addEventListener("click", () => {
  if (!latestResult?.svgQcSvg) return;
  const project = {
    version: 1,
    svg: latestResult.svgQcSvg,
    capacities: getSvgQcCapacities(latestResult.mapping),
  };
  downloadBlob(
    JSON.stringify(project),
    "seatmap.svgqc",
    "application/json"
  );
});

document.getElementById("downloadPngBtn").addEventListener("click", () => {
  if (!latestResult?.backgroundPng) return;
  downloadBlob(
    base64ToBlob(latestResult.backgroundPng, "image/png"),
    "seatmap-background.png",
    "image/png"
  );
});

document.getElementById("downloadBgSvgBtn").addEventListener("click", () => {
  if (!latestResult?.backgroundSvg) return;
  downloadBlob(latestResult.backgroundSvg, "seatmap-background.svg", "image/svg+xml");
});

function downloadBlob(content, filename, type) {
  const blob =
    content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function base64ToBlob(base64, type) {
  const bytes = atob(base64);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) array[i] = bytes.charCodeAt(i);
  return new Blob([array], { type });
}
