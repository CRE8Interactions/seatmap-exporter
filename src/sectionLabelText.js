function compactSectionToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

function isGeneralAdmissionToken(value) {
  const compact = compactSectionToken(value);
  if (!compact) return false;
  if (compact === "generaladmission") return true;
  if (compact === "ga") return true;
  return /^ga\d+$/.test(compact);
}

/**
 * Turn SVG section tokens like "generaladmission" / "ga-2" into display labels.
 */
function humanizeSectionLabel(sectionNumber, sectionName) {
  const name = String(sectionName ?? "").trim();
  if (name && !/^section\s+/i.test(name)) {
    return name;
  }

  const raw = String(sectionNumber ?? "").trim();
  if (!raw) return name;

  if (isGeneralAdmissionToken(raw) || isGeneralAdmissionToken(name)) {
    return "General Admission";
  }

  if (/^\d+$/.test(raw)) return raw;

  if (/[\s_-]/.test(raw)) {
    return raw
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  return name || raw;
}

function sectionDisplayName(sectionNumber, sectionName) {
  const normalized = String(sectionNumber ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "club") return "Club";
  if (normalized === "suites") return "Suites";

  const humanized = humanizeSectionLabel(sectionNumber, sectionName);
  if (humanized && humanized !== String(sectionNumber ?? "").trim()) {
    return humanized;
  }
  if (!String(sectionNumber ?? "").trim()) return humanized || "";
  return `Section ${sectionNumber}`;
}

function sectionLabelLookupKeys(sectionNumber, sectionName) {
  const values = [
    sectionNumber,
    sectionName,
    humanizeSectionLabel(sectionNumber, sectionName),
    sectionDisplayName(sectionNumber, sectionName),
    `Section ${sectionNumber}`,
  ];
  const keys = new Set();
  values.forEach((value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;
    const underscored = raw.replace(/[\s-]+/g, "_");
    keys.add(underscored);
    keys.add(underscored.toLowerCase());
    keys.add(compactSectionToken(raw));
  });
  return keys;
}

module.exports = {
  compactSectionToken,
  isGeneralAdmissionToken,
  humanizeSectionLabel,
  sectionDisplayName,
  sectionLabelLookupKeys,
};
