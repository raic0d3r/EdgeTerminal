const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const file = path.join(__dirname, "../../lib/market-intelligence/bias-validation.ts");
const source = fs.readFileSync(file, "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const box = { exports: {}, module: { exports: {} } }; box.module.exports = box.exports;
vm.runInNewContext(compiled, box, { filename: "bias-validation.cjs" });
const { appendBiasSnapshot, evaluateBiasHistory } = box.module.exports;

function snap(minute, price, bias = "Bullish") {
  return { asset: "XAU/USD", timestamp: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(), price, bias, score: 70, sources: [] };
}

test("snapshot recorder stores one observation per 15-minute bucket", () => {
  const first = appendBiasSnapshot([], snap(0, 2000));
  const sameBucket = appendBiasSnapshot(first, snap(14, 2001));
  const nextBucket = appendBiasSnapshot(sameBucket, snap(15, 2002));
  assert.equal(first.length, 1);
  assert.equal(sameBucket.length, 1);
  assert.equal(nextBucket.length, 2);
});

test("forward validation scores bullish and bearish outcomes by subsequent observed prices", () => {
  const history = [];
  for (let i = 0; i <= 24 * 4; i++) {
    const bias = i % 2 ? "Bearish" : "Bullish";
    const price = i % 2 ? 1990 : 2000;
    history.push({ ...snap(i * 15, price, bias), timestamp: new Date(Date.UTC(2026,0,1,0,i*15)).toISOString() });
  }
  const now = Date.UTC(2026,0,2,2);
  const report = evaluateBiasHistory(history, "XAU/USD", now);
  assert.equal(report.snapshots, history.length);
  assert.ok(report.horizons.some(h => h.horizonHours === 1));
  assert.ok(report.horizons.find(h => h.horizonHours === 1).matured > 0);
  assert.match(report.methodology, /prospective/i);
  assert.ok(report.limitations.some(x => x.includes("local storage")));
});

test("other instruments are not mixed into the selected asset report", () => {
  const history = [snap(0, 2000), { ...snap(15, 30), asset: "XAG/USD" }];
  const report = evaluateBiasHistory(history, "XAU/USD", Date.UTC(2026,0,1,3));
  assert.equal(report.snapshots, 1);
});

test("master scorecard exposes prospective validation and local snapshot storage", () => {
  const component = fs.readFileSync(path.join(__dirname, "../../components/master-scorecard.tsx"), "utf8");
  assert.match(component, /Historical bias validation/);
  assert.match(component, /edge-unified-bias-history:/);
  assert.match(component, /evaluateBiasHistory/);
});


test("validation report provides a chronological daily performance timeline for all horizons", () => {
  const history = [];
  for (let i = 0; i <= 24 * 12; i++) {
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, i * 15)).toISOString();
    history.push({ ...snap(i * 15, 2000 + i * 0.2, i % 2 ? "Bullish" : "Bearish"), timestamp });
  }
  const report = evaluateBiasHistory(history, "XAU/USD", Date.UTC(2026, 0, 5));
  assert.ok(Array.isArray(report.performanceTimeline));
  assert.ok(report.performanceTimeline.some(point => point.horizonHours === 1));
  assert.ok(report.performanceTimeline.every(point => point.samples >= 0));
  assert.ok(report.performanceTimeline.every(point => /^2026-01-/.test(point.date)));
});

test("Gold and Silver validation histories remain separate", () => {
  const gold = [snap(0, 2000), snap(15, 2001)];
  const silver = gold.map(row => ({ ...row, asset: "XAG/USD", price: 30 }));
  assert.equal(evaluateBiasHistory(gold, "XAU/USD", Date.UTC(2026,0,2)).snapshots, 2);
  assert.equal(evaluateBiasHistory(silver, "XAG/USD", Date.UTC(2026,0,2)).snapshots, 2);
  assert.equal(evaluateBiasHistory(gold, "XAG/USD", Date.UTC(2026,0,2)).snapshots, 0);
});

test("scorecard exposes historical chart, cross-asset comparison and signal ledger", () => {
  const component = fs.readFileSync(path.join(__dirname, "../../components/master-scorecard.tsx"), "utf8");
  assert.match(component, /Historical performance chart/);
  assert.match(component, /Gold \/ Silver comparison/);
  assert.match(component, /Recent signal history/);
  assert.match(component, /Latest 8 · \{interval\.toUpperCase\(\)\} outcome tracking/);
  assert.match(component, /edge-unified-bias-history:/);
});


test("selected timeframe histories remain isolated for the same instrument", () => {
  const rows = [
    { ...snap(0, 2000), timeframe: "15m" },
    { ...snap(15, 2010), timeframe: "1h" },
    { ...snap(30, 2020), asset: "XAG/USD", timeframe: "15m" },
  ];
  assert.equal(evaluateBiasHistory(rows, "XAU/USD", Date.UTC(2026,0,2), "15m").snapshots, 1);
  assert.equal(evaluateBiasHistory(rows, "XAU/USD", Date.UTC(2026,0,2), "1h").snapshots, 1);
  assert.equal(evaluateBiasHistory(rows, "XAG/USD", Date.UTC(2026,0,2), "15m").snapshots, 1);
});

test("header timeframe selection synchronizes every chart and is passed to dashboard modules", () => {
  const page = fs.readFileSync(path.join(__dirname, "../../app/page.tsx"), "utf8");
  assert.match(page, /onClick=\{\(\)=>setAllChartTimeframes\(value\)\}/);
  assert.match(page, /<MasterScorecard asset=\{asset\} interval=\{tf\}/);
  assert.match(page, /<MarketIntelligence asset=\{asset\} interval=\{/);
  assert.match(page, /<OrderFlowFootprint asset=\{asset\} interval=\{/);
  assert.match(page, /\[\["1m","1m"\],\["5m","5m"\],\["10m","10m"\]/);
});

test("historical snapshots are keyed and evaluated by instrument plus selected timeframe", () => {
  const component = fs.readFileSync(path.join(__dirname, "../../components/master-scorecard.tsx"), "utf8");
  assert.match(component, /edge-unified-bias-history:\$\{item\}:\$\{interval\}/);
  assert.match(component, /edge-unified-bias-history:\$\{asset\}:\$\{interval\}/);
  assert.match(component, /timeframe: interval/);
  assert.match(component, /evaluateBiasHistory\(next, asset, Date\.now\(\), interval, validationBrokerCandles\)/);
});

test("validation reports pending, missing-price, correct, incorrect, flat and neutral separately", () => {
  const base = Date.UTC(2026, 0, 1, 0, 0);
  const history = [
    { ...snap(0, 2000, "Bullish"), timestamp: new Date(base).toISOString() },
    { ...snap(60, 2010, "Bearish"), timestamp: new Date(base + 60*60000).toISOString() },
    { ...snap(120, 2000, "Neutral"), timestamp: new Date(base + 120*60000).toISOString() },
  ];
  const report = evaluateBiasHistory(history, "XAU/USD", base + 90*60000);
  const oneHour = report.horizons.find(row => row.horizonHours === 1);
  assert.equal(oneHour.pending, 2);
  assert.equal(oneHour.awaitingPrice, 0);
  assert.equal(oneHour.matured, 1);
  assert.equal(oneHour.correct, 1);
  assert.equal(oneHour.neutralSignals, 0);
  const later = evaluateBiasHistory(history, "XAU/USD", base + 240*60000).horizons.find(row => row.horizonHours === 1);
  assert.ok(later.pending >= 0);
  assert.equal(typeof later.incorrect, "number");
  assert.equal(typeof later.flat, "number");
});

test("neutral forecasts are excluded from directional accuracy but reported separately", () => {
  const base = Date.UTC(2026, 0, 1);
  const history = [
    { ...snap(0, 2000, "Neutral"), timestamp: new Date(base).toISOString() },
    { ...snap(60, 2005, "Bullish"), timestamp: new Date(base + 60*60000).toISOString() },
  ];
  const report = evaluateBiasHistory(history, "XAU/USD", base + 60*60000);
  const oneHour = report.horizons.find(row => row.horizonHours === 1);
  assert.equal(oneHour.neutralSignals, 1);
  assert.equal(oneHour.directionalSignals, 0);
  assert.equal(oneHour.accuracy, null);
  assert.ok(Math.abs(oneHour.neutralAverageAbsoluteReturnPct - 0.25) < 1e-9);
});

test("matured forecasts are evaluated against completed broker 1H candle closes", () => {
  const base = Date.UTC(2026, 0, 1, 10, 0);
  const history = [
    { ...snap(0, 2000, "Bullish"), timestamp: new Date(base).toISOString(), timeframe: "15m" },
    { ...snap(15, 2001, "Bearish"), timestamp: new Date(base + 15 * 60000).toISOString(), timeframe: "15m" },
  ];
  const brokerCandles = [
    { time: new Date(base).toISOString(), close: 2010 },
    { time: new Date(base + 60 * 60000).toISOString(), close: 1990 },
  ];
  const report = evaluateBiasHistory(history, "XAU/USD", base + 3 * 3600000, "15m", brokerCandles);
  const oneHour = report.horizons.find(row => row.horizonHours === 1);
  assert.equal(oneHour.matured, 2);
  assert.equal(oneHour.correct, 2);
  assert.equal(oneHour.awaitingPrice, 0);
  assert.match(report.methodology, /completed broker 1H candle close/i);
});

test("broker candle evaluation does not substitute saved snapshots when broker history is supplied but missing", () => {
  const base = Date.UTC(2026, 0, 1, 10, 0);
  const history = [
    { ...snap(0, 2000), timestamp: new Date(base).toISOString() },
    { ...snap(60, 2010), timestamp: new Date(base + 60 * 60000).toISOString() },
  ];
  const report = evaluateBiasHistory(history, "XAU/USD", base + 3 * 3600000, "15m", []);
  const oneHour = report.horizons.find(row => row.horizonHours === 1);
  assert.equal(oneHour.matured, 0);
  assert.equal(oneHour.awaitingPrice, 2);
});

test("selected timeframe outcomes use the selected candle duration rather than a fixed 1H horizon", () => {
  const { evaluateSelectedTimeframeOutcomes } = box.module.exports;
  const start = Date.UTC(2026, 0, 1, 10, 0);
  const history = [{ ...snap(0, 2000, "Bullish"), timestamp: new Date(start).toISOString(), timeframe: "15m" }];
  const candles = [
    { time: new Date(start).toISOString(), close: 2001 },
    { time: new Date(start + 15 * 60_000).toISOString(), close: 2002 },
  ];
  const rows = evaluateSelectedTimeframeOutcomes(history, "XAU/USD", "15m", candles, start + 31 * 60_000);
  assert.equal(rows[0].outcome, "Correct");
  assert.equal(rows[0].endPrice, 2001);
  const hourlyHistory = [{ ...history[0], timeframe: "1h" }];
  const pending = evaluateSelectedTimeframeOutcomes(hourlyHistory, "XAU/USD", "1h", candles, start + 30 * 60_000);
  assert.equal(pending[0].outcome, "Pending");
});

test("recent signal history shows only Bullish and Bearish; Neutral remains research-only", () => {
  const { getDirectionalSignalHistory } = box.module.exports;
  const rows = [
    { ...snap(0, 2000, "Neutral"), timestamp: new Date(Date.UTC(2026,0,1,0,0)).toISOString() },
    { ...snap(1, 2001, "Bullish"), timestamp: new Date(Date.UTC(2026,0,1,0,1)).toISOString() },
    { ...snap(2, 2002, "Neutral"), timestamp: new Date(Date.UTC(2026,0,1,0,2)).toISOString() },
    { ...snap(3, 2003, "Bearish"), timestamp: new Date(Date.UTC(2026,0,1,0,3)).toISOString() },
  ];
  const visible = getDirectionalSignalHistory(rows, 8);
  assert.deepEqual(visible.map(row => row.bias), ["Bearish", "Bullish"]);
  assert.equal(rows.length, 4, "Neutral research observations are preserved in source history");
});

test("a directional bias change within one 15-minute bucket is recorded as a new signal", () => {
  let rows = appendBiasSnapshot([], snap(0, 2000, "Neutral"));
  rows = appendBiasSnapshot(rows, snap(5, 2001, "Bullish"));
  rows = appendBiasSnapshot(rows, snap(10, 2002, "Bullish"));
  rows = appendBiasSnapshot(rows, snap(12, 2003, "Bearish"));
  assert.deepEqual(Array.from(rows, row => row.bias), ["Neutral", "Bullish", "Bearish"]);
});
