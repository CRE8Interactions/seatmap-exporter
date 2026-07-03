function createSellOrderUi({
  getLatestResult,
  setLatestResult,
  onStatusChange,
}) {
  const panel = document.getElementById("sellOrderPanel");
  const floorCountInput = document.getElementById("floorCount");
  const startBtn = document.getElementById("startSellOrderBtn");
  const resetBtn = document.getElementById("resetSellOrderBtn");
  const floorSetupPanel = document.getElementById("floorSetupPanel");
  const sellOrderViewport = document.getElementById("sellOrderViewport");
  const sellOrderStage = document.getElementById("sellOrderStage");
  const sellOrderSvg = document.getElementById("sellOrderSvg");
  const sellOrderBackground = document.getElementById("sellOrderBackground");
  const sellOrderSeatLayer = document.getElementById("sellOrderSeatLayer");
  const sellOrderSectionLayer = document.getElementById("sellOrderSectionLayer");
  const hotspotHandle = document.getElementById("sellOrderHotspotHandle");
  const sellOrderStatus = document.getElementById("sellOrderStatus");

  const FLOOR_COLORS = [
    "#c82264",
    "#32f5bf",
    "#f97b0a",
    "#2fd7c9",
    "#5478f1",
    "#8bdde7",
    "#976c4e",
    "#ce486e",
    "#d82d91",
    "#29873e",
  ];

  let viewport = null;
  let phase = "idle";
  let floorCount = 1;
  let selectingFloorIndex = 0;
  let settingFloorIndex = 0;
  let sectionsByFloor = [];
  let hotspotByFloor = [];
  let selectedSectionIds = new Set();
  let draggingHotspot = false;

  function setStatus(message) {
    sellOrderStatus.textContent = message;
    onStatusChange?.(message);
  }

  function resetWorkflow() {
    phase = "idle";
    selectingFloorIndex = 0;
    settingFloorIndex = 0;
    sectionsByFloor = [];
    hotspotByFloor = [];
    selectedSectionIds = new Set();
    floorSetupPanel.classList.add("hidden");
    sellOrderViewport.classList.add("hidden");
    hotspotHandle.classList.add("hidden");
    resetBtn.disabled = true;
  }

  function zoomableSections(mapping) {
    return Object.values(mapping.sections).filter((section) => section.zoomable);
  }

  function renderFloorSetup() {
    floorSetupPanel.innerHTML = "";
    floorSetupPanel.classList.remove("hidden");

    if (phase === "select") {
      const card = document.createElement("div");
      card.className = "floor-card active-floor";
      card.innerHTML = `
        <div>
          <h3>Select sections for floor ${selectingFloorIndex + 1}</h3>
          <p>Click seated sections on the map to assign them to this floor.</p>
          <div class="floor-selected-list" id="selectedSectionsList"></div>
        </div>
        <button type="button" id="floorSelectContinueBtn">Continue</button>
      `;
      floorSetupPanel.appendChild(card);
      updateSelectedSectionsList();
      document
        .getElementById("floorSelectContinueBtn")
        .addEventListener("click", continueSectionSelection);
      return;
    }

    if (phase === "hotspot") {
      const card = document.createElement("div");
      card.className = "floor-card active-floor";
      card.innerHTML = `
        <div>
          <h3>Place hotspot for floor ${settingFloorIndex + 1}</h3>
          <p>Drag the hotspot onto the stage area, then release to compute sell order for this floor.</p>
        </div>
        <button type="button" id="floorHotspotContinueBtn" disabled>Continue</button>
      `;
      floorSetupPanel.appendChild(card);
      document
        .getElementById("floorHotspotContinueBtn")
        .addEventListener("click", continueHotspotPlacement);
    }
  }

  function updateSelectedSectionsList() {
    const list = document.getElementById("selectedSectionsList");
    if (!list) return;
    list.innerHTML = "";
    const mapping = getLatestResult()?.mapping;
    if (!mapping) return;

    Array.from(selectedSectionIds).forEach((sectionId) => {
      const section = mapping.sections[sectionId];
      if (!section) return;
      const chip = document.createElement("span");
      chip.className = "floor-chip";
      chip.style.backgroundColor = FLOOR_COLORS[selectingFloorIndex] || "#5478f1";
      chip.textContent = section.sectionNumber;
      list.appendChild(chip);
    });
  }

  function renderSellOrderMap() {
    const result = getLatestResult();
    if (!result) return;

    const { mapping, dimensions, backgroundPng } = result;
    sellOrderSvg.setAttribute("viewBox", dimensions.viewBox);
    sellOrderBackground.setAttribute("width", dimensions.width);
    sellOrderBackground.setAttribute("height", dimensions.height);
    sellOrderBackground.setAttribute(
      "href",
      backgroundPng ? `data:image/png;base64,${backgroundPng}` : ""
    );

    sellOrderSeatLayer.innerHTML = "";
    sellOrderSectionLayer.innerHTML = "";

    Object.values(mapping.sections).forEach((section) => {
      if (!section.path) return;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", section.path);
      path.dataset.sectionId = section.sectionId;
      path.setAttribute(
        "class",
        section.zoomable ? "section-hit sell-order-section" : "section-ga"
      );
      if (section.stroke) path.setAttribute("stroke", section.stroke);
      if (section.strokeWidth) {
        path.setAttribute("stroke-width", section.strokeWidth);
      }

      if (phase === "select" && section.zoomable) {
        path.addEventListener("click", () => toggleSectionSelection(section.sectionId));
      }

      sellOrderSectionLayer.appendChild(path);
    });

    Object.values(mapping.seats).forEach((seat) => {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", seat.cx);
      rect.setAttribute("y", seat.cy);
      rect.setAttribute("width", seat.w);
      rect.setAttribute("height", seat.h);
      rect.setAttribute("rx", Math.min(seat.w, seat.h) / 2);
      rect.setAttribute("fill", seat.hotspotFill || "#3358d4");
      rect.dataset.seatId = seat.seatId;
      sellOrderSeatLayer.appendChild(rect);
    });

    sellOrderViewport.classList.remove("hidden");
    viewport = mountSvgViewport({
      container: sellOrderViewport,
      svgEl: sellOrderSvg,
      viewBox: dimensions.viewBox,
    });
  }

  function toggleSectionSelection(sectionId) {
    if (phase !== "select") return;

    const alreadyAssigned = sectionsByFloor.some(
      (floorSections, index) =>
        index !== selectingFloorIndex && floorSections.includes(sectionId)
    );
    if (alreadyAssigned) {
      setStatus("That section is already assigned to another floor.");
      return;
    }

    if (selectedSectionIds.has(sectionId)) {
      selectedSectionIds.delete(sectionId);
    } else {
      selectedSectionIds.add(sectionId);
    }
    updateSelectedSectionsList();
  }

  function continueSectionSelection() {
    if (!selectedSectionIds.size) {
      setStatus("Select at least one section for this floor.");
      return;
    }

    sectionsByFloor[selectingFloorIndex] = Array.from(selectedSectionIds);
    selectedSectionIds = new Set();

    if (selectingFloorIndex >= floorCount - 1) {
      phase = "hotspot";
      settingFloorIndex = 0;
      renderFloorSetup();
      renderSellOrderMap();
      showHotspotForCurrentFloor();
      setStatus(`Place the hotspot for floor ${settingFloorIndex + 1}.`);
      return;
    }

    selectingFloorIndex += 1;
    renderFloorSetup();
    setStatus(`Select sections for floor ${selectingFloorIndex + 1}.`);
  }

  function showHotspotForCurrentFloor() {
    const hotspot = hotspotByFloor[settingFloorIndex];
    if (hotspot) {
      positionHotspotAtSvgPoint(hotspot);
      hotspotHandle.classList.remove("hidden");
      document.getElementById("floorHotspotContinueBtn").disabled = false;
      return;
    }

    hotspotHandle.classList.remove("hidden");
    positionHotspotAtSvgPoint(getDefaultHotspotPoint());
  }

  function getDefaultHotspotPoint() {
    const viewBox = sellOrderSvg.viewBox.baseVal;
    return {
      x: viewBox.x + viewBox.width / 2,
      y: viewBox.y + viewBox.height / 2,
    };
  }

  function clientToSvgPoint(clientX, clientY) {
    const pt = sellOrderSvg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(sellOrderSvg.getScreenCTM().inverse());
  }

  function positionHotspotAtSvgPoint(point) {
    const stageRect = sellOrderStage.getBoundingClientRect();
    const screenPoint = sellOrderSvg.createSVGPoint();
    screenPoint.x = point.x;
    screenPoint.y = point.y;
    const transformed = screenPoint.matrixTransform(sellOrderSvg.getScreenCTM());
    hotspotHandle.style.left = `${transformed.x - stageRect.left}px`;
    hotspotHandle.style.top = `${transformed.y - stageRect.top}px`;
  }

  function applyHotspotForCurrentFloor(point) {
    const result = getLatestResult();
    if (!result) return;

    const targetSectionIds = sectionsByFloor[settingFloorIndex] || [];
    const updatedMapping = applySellOrder(result.mapping, point, {
      targetSectionIds,
    });

    hotspotByFloor[settingFloorIndex] = point;
    setLatestResult({ ...result, mapping: updatedMapping });
    renderSellOrderMap();
    positionHotspotAtSvgPoint(point);
    document.getElementById("floorHotspotContinueBtn").disabled = false;
    resetBtn.disabled = false;
  }

  function continueHotspotPlacement() {
    if (!hotspotByFloor[settingFloorIndex]) {
      setStatus("Drag the hotspot onto the map before continuing.");
      return;
    }

    if (settingFloorIndex >= floorCount - 1) {
      phase = "done";
      floorSetupPanel.classList.add("hidden");
      hotspotHandle.classList.add("hidden");
      setStatus("Sell order set for all floors. Download JSON to export row and section sortOrder values.");
      return;
    }

    settingFloorIndex += 1;
    renderFloorSetup();
    showHotspotForCurrentFloor();
    setStatus(`Place the hotspot for floor ${settingFloorIndex + 1}.`);
  }

  hotspotHandle.addEventListener("dragstart", () => {
    draggingHotspot = true;
  });

  hotspotHandle.addEventListener("drag", (event) => {
    if (!draggingHotspot || event.clientX === 0) return;
    const stageRect = sellOrderStage.getBoundingClientRect();
    hotspotHandle.style.left = `${event.clientX - stageRect.left}px`;
    hotspotHandle.style.top = `${event.clientY - stageRect.top}px`;
  });

  hotspotHandle.addEventListener("dragend", (event) => {
    draggingHotspot = false;
    if (phase !== "hotspot") return;

    const point = clientToSvgPoint(event.clientX, event.clientY);
    applyHotspotForCurrentFloor(point);
    setStatus(`Sell order applied for floor ${settingFloorIndex + 1}.`);
  });

  startBtn.addEventListener("click", () => {
    const result = getLatestResult();
    if (!result?.mapping) {
      setStatus("Process an SVG before setting sell order.");
      return;
    }

    floorCount = Math.max(1, parseInt(floorCountInput.value || "1", 10));
    sectionsByFloor = Array.from({ length: floorCount }, () => []);
    hotspotByFloor = Array.from({ length: floorCount }, () => null);

    if (floorCount === 1) {
      sectionsByFloor[0] = zoomableSections(result.mapping).map(
        (section) => section.sectionId
      );
      phase = "hotspot";
      settingFloorIndex = 0;
      panel.classList.remove("hidden");
      renderFloorSetup();
      renderSellOrderMap();
      showHotspotForCurrentFloor();
      setStatus("Drag the hotspot onto the stage to set sell order.");
      return;
    }

    phase = "select";
    selectingFloorIndex = 0;
    selectedSectionIds = new Set();
    panel.classList.remove("hidden");
    renderFloorSetup();
    renderSellOrderMap();
    setStatus(`Select sections for floor ${selectingFloorIndex + 1}.`);
  });

  resetBtn.addEventListener("click", () => {
    resetWorkflow();
    setStatus("Sell order reset. Click Set sell order to start again.");
  });

  return {
    showPanel() {
      panel.classList.remove("hidden");
    },
    resetWorkflow,
  };
}
