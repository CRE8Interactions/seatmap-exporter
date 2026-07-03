function parseViewBox(viewBox) {
  const [x, y, width, height] = String(viewBox || "0 0 100 100")
    .trim()
    .split(/\s+/)
    .map(Number);
  return { x, y, width, height };
}

function formatViewBox(box) {
  return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mountSvgViewport({ container, svgEl, viewBox, minZoom = 0.25, maxZoom = 8 }) {
  const base = parseViewBox(viewBox);
  let current = { ...base };
  let isPanning = false;
  let panStart = null;

  const zoomOutBtn = container.querySelector("[data-zoom='out']");
  const zoomInBtn = container.querySelector("[data-zoom='in']");
  const resetBtn = container.querySelector("[data-zoom='reset']");
  const zoomLabel = container.querySelector("[data-zoom-label]");
  const stage = container.querySelector(".preview-viewport-stage");

  function applyViewBox() {
    svgEl.setAttribute("viewBox", formatViewBox(current));
    updateZoomLabel();
  }

  function updateZoomLabel() {
    if (!zoomLabel) return;
    const pct = Math.round((base.width / current.width) * 100);
    zoomLabel.textContent = `${pct}%`;
  }

  function resetFit() {
    current = { ...base };
    applyViewBox();
  }

  function clientToSvg(clientX, clientY) {
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return {
        x: current.x + current.width / 2,
        y: current.y + current.height / 2,
      };
    }

    const xRatio = (clientX - rect.left) / rect.width;
    const yRatio = (clientY - rect.top) / rect.height;
    return {
      x: current.x + xRatio * current.width,
      y: current.y + yRatio * current.height,
    };
  }

  function zoomAt(factor, clientX, clientY) {
    const anchor = clientToSvg(clientX, clientY);
    const nextWidth = clamp(
      current.width / factor,
      base.width / maxZoom,
      base.width / minZoom
    );
    const nextHeight = clamp(
      current.height / factor,
      base.height / maxZoom,
      base.height / minZoom
    );
    const widthRatio = (anchor.x - current.x) / current.width;
    const heightRatio = (anchor.y - current.y) / current.height;

    current = {
      x: anchor.x - widthRatio * nextWidth,
      y: anchor.y - heightRatio * nextHeight,
      width: nextWidth,
      height: nextHeight,
    };
    applyViewBox();
  }

  function onWheel(event) {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomAt(factor, event.clientX, event.clientY);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    isPanning = true;
    panStart = {
      x: event.clientX,
      y: event.clientY,
      viewBox: { ...current },
    };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-panning");
  }

  function onPointerMove(event) {
    if (!isPanning || !panStart) return;
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const dx = ((event.clientX - panStart.x) / rect.width) * panStart.viewBox.width;
    const dy = ((event.clientY - panStart.y) / rect.height) * panStart.viewBox.height;
    current = {
      ...panStart.viewBox,
      x: panStart.viewBox.x - dx,
      y: panStart.viewBox.y - dy,
    };
    applyViewBox();
  }

  function onPointerUp(event) {
    if (!isPanning) return;
    isPanning = false;
    panStart = null;
    stage.classList.remove("is-panning");
    stage.releasePointerCapture(event.pointerId);
  }

  zoomOutBtn?.addEventListener("click", () => {
    const rect = svgEl.getBoundingClientRect();
    zoomAt(1 / 1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  zoomInBtn?.addEventListener("click", () => {
    const rect = svgEl.getBoundingClientRect();
    zoomAt(1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  resetBtn?.addEventListener("click", resetFit);

  stage.addEventListener("wheel", onWheel, { passive: false });
  stage.addEventListener("pointerdown", onPointerDown);
  stage.addEventListener("pointermove", onPointerMove);
  stage.addEventListener("pointerup", onPointerUp);
  stage.addEventListener("pointercancel", onPointerUp);

  svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
  resetFit();

  return { resetFit, zoomAt };
}
