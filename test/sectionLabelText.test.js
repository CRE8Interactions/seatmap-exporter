const test = require("node:test");
const assert = require("node:assert/strict");
const {
  humanizeSectionLabel,
  sectionDisplayName,
  sectionLabelLookupKeys,
  isGeneralAdmissionToken,
} = require("../src/sectionLabelText");

test("humanizes general admission section tokens", () => {
  assert.equal(humanizeSectionLabel("generaladmission"), "General Admission");
  assert.equal(humanizeSectionLabel("ga"), "General Admission");
  assert.equal(humanizeSectionLabel("ga-2"), "General Admission");
  assert.equal(humanizeSectionLabel("GA_3"), "General Admission");
  assert.equal(
    humanizeSectionLabel("generaladmission", "Section generaladmission"),
    "General Admission"
  );
  assert.equal(
    humanizeSectionLabel("generaladmission", "General Admission"),
    "General Admission"
  );
});

test("sectionDisplayName keeps numbered sections prefixed", () => {
  assert.equal(sectionDisplayName("101"), "Section 101");
  assert.equal(sectionDisplayName("generaladmission"), "General Admission");
  assert.equal(sectionDisplayName("club"), "Club");
});

test("lookup keys include GENERAL ADMISSION variants", () => {
  const keys = sectionLabelLookupKeys("generaladmission", "General Admission");
  assert.ok(keys.has("GENERAL_ADMISSION") || keys.has("general_admission"));
  assert.ok(keys.has("generaladmission"));
  assert.ok(isGeneralAdmissionToken("generaladmission"));
});
