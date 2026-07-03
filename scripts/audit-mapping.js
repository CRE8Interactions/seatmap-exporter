#!/usr/bin/env node
/**
 * Validates seatmap mapping JSON for duplicate/missing row-seat labels.
 *
 * Usage:
 *   node scripts/audit-mapping.js mapping.json
 *   node scripts/audit-mapping.js path/to/map.svg
 */
const fs = require("fs");
const path = require("path");
const { loadSvgInput } = require("../src/loadInput");
const { parseSeatmap } = require("../src/parseSeatmap");

function auditMapping(mapping) {
  const issues = [];
  const sectionSummaries = [];

  for (const section of Object.values(mapping.sections || {})) {
    if (!section.zoomable) continue;

    const rows = (section.rows || []).map((rowId) => mapping.rows[rowId]).filter(Boolean);
    const seats = rows.flatMap((row) =>
      (row.seats || []).map((seatId) => mapping.seats[seatId]).filter(Boolean)
    );

    const pairCounts = new Map();
    let unlabeled = 0;
    let row1Seat1 = 0;

    for (const seat of seats) {
      if (!seat.rowNumber || !seat.seatNumber) {
        unlabeled++;
        continue;
      }
      if (seat.rowNumber === "1" && seat.seatNumber === "1") row1Seat1++;
      const key = `${seat.rowNumber}-${seat.seatNumber}`;
      pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    }

    const duplicatePairs = [...pairCounts.entries()].filter(([, count]) => count > 1);
    const summary = {
      sectionNumber: section.sectionNumber,
      seats: seats.length,
      rows: rows.length,
      unlabeled,
      duplicatePairs: duplicatePairs.length,
      row1Seat1,
      uniquePairs: pairCounts.size,
    };
    sectionSummaries.push(summary);

    if (unlabeled > 0) {
      issues.push(`Section ${section.sectionNumber}: ${unlabeled} seat(s) missing row/seat labels`);
    }
    if (duplicatePairs.length > 0) {
      issues.push(
        `Section ${section.sectionNumber}: ${duplicatePairs.length} duplicate row/seat pair(s) (e.g. ${duplicatePairs[0][0]} x${duplicatePairs[0][1]})`
      );
    }
    if (row1Seat1 > 1) {
      issues.push(
        `Section ${section.sectionNumber}: ${row1Seat1} seats labeled row 1 seat 1`
      );
    }
  }

  return {
    ok: issues.length === 0,
    sections: sectionSummaries.length,
    seats: Object.keys(mapping.seats || {}).length,
    rows: Object.keys(mapping.rows || {}).length,
    issues,
    sectionSummaries,
  };
}

function main() {
  const inputPath = path.resolve(process.argv[2]);
  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error("Usage: node scripts/audit-mapping.js <mapping.json|map.svg>");
    process.exit(1);
  }

  let mapping;
  if (/\.svg(qc)?$/i.test(inputPath)) {
    const { mapping: parsed } = parseSeatmap(loadSvgInput(inputPath), {});
    mapping = parsed;
  } else {
    mapping = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  }

  const result = auditMapping(mapping);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { auditMapping };
