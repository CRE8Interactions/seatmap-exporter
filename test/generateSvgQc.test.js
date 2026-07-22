const test = require("node:test");
const assert = require("node:assert/strict");
const { DOMParser } = require("@xmldom/xmldom");
const {
  createSvgQcProject,
  generateSvgQcSvg,
} = require("../src/generateSvgQc");
const { parseSeatmap } = require("../src/parseSeatmap");

const sourceSvg = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path d="M0 0H100V100H0Z" fill="#f5f6f7"/>
    <g class="sec-101 YZ">
      <path d="M10 10H40V40H10Z" fill="#cccccc"/>
      <rect class="sec-101-row-A-seat-2 DA" x="18" y="12" width="4" height="4" fill="#2DEDB4"/>
    </g>
    <text id="101_label" transform="translate(20 25)" fill="white" font-size="12">
      <tspan>101</tspan>
    </text>
  </svg>
`;

const mapping = {
  sections: {
    seated: {
      sectionId: "seated",
      sectionNumber: "101",
      sectionName: "Section 101",
      path: "M10 10H40V40H10Z",
      rows: ["row-a"],
      zoomable: true,
      fill: "#3358D4",
      identifier: { path: null },
    },
    ga: {
      sectionId: "ga",
      sectionNumber: "ga-1",
      sectionName: "GA Floor",
      path: "M50 50H90V90H50Z",
      rows: [],
      zoomable: false,
      fill: "#3358D4",
    },
  },
  rows: {
    "row-a": {
      rowId: "row-a",
      sectionId: "seated",
      sectionNumber: "101",
      rowNumber: "A",
      seats: ["seat-1", "seat-2"],
    },
  },
  seats: {
    "seat-1": {
      seatId: "seat-1",
      sectionId: "seated",
      rowId: "row-a",
      sectionNumber: "101",
      rowNumber: "A",
      seatNumber: "1",
      cx: 12,
      cy: 12,
      w: 4,
      h: 4,
      accessible: false,
    },
    "seat-2": {
      seatId: "seat-2",
      sectionId: "seated",
      rowId: "row-a",
      sectionNumber: "101",
      rowNumber: "A",
      seatNumber: "2",
      cx: 18,
      cy: 12,
      w: 4,
      h: 4,
      accessible: true,
    },
  },
};

test("generates checker-compatible seat and GA classes", () => {
  const svg = generateSvgQcSvg(sourceSvg, mapping);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const groups = Array.from(doc.getElementsByTagName("g"));
  const rects = Array.from(doc.getElementsByTagName("rect"));

  assert.equal(
    groups.filter((group) => group.getAttribute("class") === "sec-101 YZ").length,
    1
  );
  assert.ok(groups.some((group) => group.getAttribute("class") === "sec-ga_1 NZ"));
  assert.deepEqual(
    rects.map((rect) => rect.getAttribute("class")),
    [
      "sec-101-row-A-seat-1",
      "sec-101-row-A-seat-2 DA accessible",
    ]
  );

  const reparsed = parseSeatmap(svg);
  assert.equal(reparsed.stats.sections, 2);
  assert.equal(reparsed.stats.seats, 2);
  assert.equal(reparsed.stats.gaSections, 1);
});

test("paints covers above seats and keeps section labels on top", () => {
  const svg = generateSvgQcSvg(sourceSvg, mapping);
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const sectionGroup = Array.from(doc.getElementsByTagName("g")).find(
    (group) => group.getAttribute("class") === "sec-101 YZ"
  );
  assert.ok(sectionGroup);

  const children = Array.from(sectionGroup.childNodes).filter(
    (node) => node.nodeType === 1
  );
  assert.equal(children[0].getAttribute("class"), "sec-101-row-A");
  assert.equal(children[1].getAttribute("class"), "identifier sec-101");

  const identifier = children[1];
  const identifierChildren = Array.from(identifier.childNodes).filter(
    (node) => node.nodeType === 1
  );
  assert.equal(identifierChildren[0].tagName.toLowerCase(), "path");
  assert.equal(identifierChildren[0].getAttribute("class"), "sec-101");
  assert.equal(identifierChildren[1].tagName.toLowerCase(), "text");
  assert.match(identifierChildren[1].textContent, /101/);
});

test("stores counted seats and supplied GA capacity", () => {
  const project = createSvgQcProject(sourceSvg, mapping, {
    capacities: { ga: 750 },
  });

  assert.equal(project.version, 1);
  assert.match(project.svg, /<svg/);
  assert.deepEqual(project.capacities, {
    "101": 2,
    ga_1: 750,
  });
});
