import test from "node:test";
import assert from "node:assert/strict";
import {
  analyseRows,
  thermalDifference,
  analyticsReport,
  analyticsCSV,
  pairedSamples,
  correlation,
  analyticsDataset,
} from "../src/analyticsData.js";
import { defaultTargets, normalizeReadings } from "../src/pondData.js";
test("analytics excludes missing values from means and target counts, preserves zero, and requires adjacent valid packets for change", () => {
  const rows = [
    { time: 1000, ph: 7, temperature: 0, air_temperature: 10 },
    { time: 2000, ph: null },
    { time: 3000, ph: 9 },
  ];
  const ph = analyseRows(rows, defaultTargets)[0];
  assert.deepEqual(
    [ph.mean, ph.count, ph.missing, ph.within, ph.assessed, ph.delta],
    [8, 2, 1, 1, 2, null],
  );
  assert.equal(thermalDifference(rows[0]), 10);
  assert.equal(thermalDifference(rows[1]), null);
  assert.equal(analyseRows([], defaultTargets)[0].mean, null);
});
test("scatter excludes incomplete pairs and does not invent correlation for insufficient or constant series", () => {
  const rows = [
    { ph: 0, temperature: 0 },
    { ph: 1, temperature: 2 },
    { ph: 2, temperature: 4 },
    { ph: null, temperature: 9 },
  ];
  assert.equal(pairedSamples(rows, "ph", "temperature").length, 3);
  assert.equal(correlation(rows, "ph", "temperature"), 1);
  assert.equal(correlation(rows.slice(0, 2), "ph", "temperature"), null);
  assert.equal(
    correlation(
      [
        { ph: 1, temperature: 0 },
        { ph: 1, temperature: 1 },
        { ph: 1, temperature: 2 },
      ],
      "ph",
      "temperature",
    ),
    null,
  );
  assert.equal(
    correlation(
      [
        { ph: 1, temperature: 3 },
        { ph: 2, temperature: 2 },
        { ph: 3, temperature: 1 },
      ],
      "ph",
      "temperature",
    ),
    -1,
  );
});
test("JSON dataset carries mode, targets and acquisition time without inserting missing values", () => {
  const data = JSON.parse(
    analyticsDataset({
      profile: { id: "QA", name: "QA" },
      rows: [{ id: "p1", time: 1000, ph: 0 }],
      targets: defaultTargets,
      source: "Example data",
      hours: 6,
      now: 2000,
    }),
  );
  assert.equal(data.source, "Example data");
  assert.equal(data.records[0].timestamp, "1970-01-01T00:00:01.000Z");
  assert.equal(data.records[0].ph, 0);
  assert.equal(data.records[0].temperature, null);
  assert.deepEqual(data.targets, defaultTargets);
});
test('constant decimal measurements do not acquire a spurious correlation through floating-point rounding',()=>{
  assert.equal(correlation(Array.from({length:24},(_,i)=>({ph:7+i/100,temperature:5.8})),'ph','temperature'),null);
});
test("reports escape farm metadata and retain source, missing values, target settings and original timestamps", () => {
  const rows = normalizeReadings({
    one: { timestamp: 1000, ph: 7, temperature: 0 },
  });
  const report = analyticsReport({
    profile: { id: "QA", name: "<script>alert(1)</script>", bodyType: "Tank" },
    rows,
    targets: defaultTargets,
    source: "Saved snapshot",
    hours: 6,
    now: 2000000,
  });
  assert(!report.includes("<script>"));
  assert(report.includes("&lt;script&gt;"));
  assert(report.includes("Saved snapshot"));
  assert(report.includes("Not reported"));
  assert(report.includes("1970-01-01T00:16:40.000Z"));
  const csv = analyticsCSV(rows);
  assert(csv.includes("1970-01-01T00:16:40.000Z,7,0,"));
  assert(!csv.includes("undefined"));
  assert(!csv.includes("null"));
});
