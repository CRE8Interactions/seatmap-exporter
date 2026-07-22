const test = require("node:test");
const assert = require("node:assert/strict");
const {
  pathBounds,
  resolveCoverPath,
  splitPathSubpaths,
} = require("../src/pathGeometry");

test("resolveCoverPath keeps aisle extension rects in the cover", () => {
  // Main bowl tile + small tongue into the concourse (no curves).
  const main =
    "M1006.38 1359.7L1247 1359.7L1247 1775.8L1006.38 1775.8L1006.38 1359.7Z";
  const tongue =
    "M1053.38 1809.2L1189.24 1809.2L1189.24 1885.5L1053.38 1885.5L1053.38 1809.2Z";
  const compound = `${main}${tongue}`;

  const resolved = resolveCoverPath(compound);
  const subs = splitPathSubpaths(resolved.path);
  const bounds = pathBounds(resolved.path);

  assert.equal(resolved.identifierPath, null);
  assert.equal(subs.length, 2);
  assert.ok(bounds.maxY > 1880, "cover should include the aisle tongue");
});

test("resolveCoverPath still extracts curved label glyphs", () => {
  const main = "M10 10H200V200H10Z";
  const glyph =
    "M40 40C45 35 55 35 60 40C65 45 65 55 60 60C55 65 45 65 40 60C35 55 35 45 40 40Z";
  const compound = `${main}${glyph}`;

  const resolved = resolveCoverPath(compound);

  assert.equal(resolved.path.replace(/\s+/g, ""), main.replace(/\s+/g, ""));
  assert.ok(resolved.identifierPath);
  assert.match(resolved.identifierPath, /C/i);
});
