const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");


function sandboxRequire(id) {
  if (id === "@/lib/market-intelligence/advanced-validation") {
    const ts = require("typescript");
    const file = path.join(__dirname, "../../lib/market-intelligence/advanced-validation.ts");
    const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const box = { exports: {}, module: { exports: {} } }; box.module.exports = box.exports;
    require("node:vm").runInNewContext(compiled, box, { filename: "advanced-validation.cjs" });
    return box.module.exports;
  }
  return require(id);
}

test("market intelligence engine source is registered and avoids indicator-driven scoring", () => {
  const file = path.join(__dirname, "../../lib/market-intelligence/engine.ts");
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /findPivots/);
  assert.match(source, /historicalMatches/);
  assert.match(source, /walkForwardBacktest/);
  assert.match(source, /bullish-choch/);
  assert.match(source, /multiTimeframeCandles/);
  assert.match(source, /sweep/);
  assert.match(source, /buildMarketForecast/);
  assert.doesNotMatch(source, /calculateRSI|calculateEMA|EMA crossover/i);
});

test("API is analysis-only and forwards existing broker authentication", () => {
  const file = path.join(__dirname, "../../app/api/market-intelligence/route.ts");
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /\/api\/market/);
  assert.match(source, /headers\.set\("authorization"/);
  assert.match(source, /headers\.set\("cookie"/);
  assert.match(source, /const intervals = \["5min", "15min", "1h", "4h", "1day", "1week", "1month"\]/);
  assert.match(source, /comparisonSymbol/);
  assert.match(source, /"1week"/);
  assert.match(source, /"1month"/);
  assert.match(source, /aggregateCandles/);
  assert.doesNotMatch(source, /placeOrder|createOrder|executeTrade/i);
});


test("forecast engine returns bounded, auditable output for a deterministic candle series", () => {
  const ts = require("typescript");
  const os = require("node:os");
  const vm = require("node:vm");
  const enginePath = path.join(__dirname, "../../lib/market-intelligence/engine.ts");
  const source = fs.readFileSync(enginePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} }, require: sandboxRequire };
  sandbox.module.exports = sandbox.exports;
  vm.runInNewContext(compiled, sandbox, { filename: "market-intelligence-engine.cjs" });
  const { buildMarketForecast } = sandbox.module.exports;
  const candles = Array.from({ length: 240 }, (_, i) => {
    const base = 2300 + i * 0.06 + Math.sin(i * 0.23) * 2.4 + Math.sin(i * 0.047) * 1.8;
    const open = base + Math.sin(i * 0.61) * 0.45;
    const close = base + Math.cos(i * 0.37) * 0.62;
    const high = Math.max(open, close) + 0.55 + (i % 5) * 0.04;
    const low = Math.min(open, close) - 0.52 - (i % 7) * 0.03;
    return { time: new Date(Date.UTC(2025, 0, 1) + i * 900000).toISOString(), open, high, low, close, volume: 100 + i };
  });
  const result = buildMarketForecast({
    candles, symbol: "XAU/USD", broker: "ctrader", timeframe: "15min",
    source: "test fixture", mode: "closed",
    higherTimeframeCandles: candles.filter((_, i) => i % 4 === 0),
    higherTimeframe: "1h",
    multiTimeframeCandles: { "5min": candles, "15min": candles, "1h": candles, "4h": candles, "1day": candles },
  });
  assert.ok(["BUY", "SELL", "WAIT"].includes(result.action));
  assert.ok(result.confidence >= 0 && result.confidence <= 82);
  assert.ok(result.confirmation.score >= 0 && result.confirmation.score <= 100);
  assert.ok(["confirmed", "developing", "weak"].includes(result.confirmation.status));
  assert.match(result.confirmation.rule, /displacement/);
  if (result.action !== "WAIT") assert.equal(result.confirmation.status, "confirmed");
  assert.ok(result.historical.matches.length <= 8);
  assert.ok(result.historical.samples >= result.historical.matches.length);
  assert.ok(result.historical.samples >= result.historical.wins + result.historical.losses);
  assert.ok(result.historical.unresolved >= 0);
  assert.ok(result.data.candles <= 2500);
  assert.ok(result.data.requestedCandles >= result.data.candles);
  assert.ok(result.data.oldestCandle);
  assert.ok(result.data.quality.validCandles >= 45);
  assert.equal(result.data.quality.invalidOhlc, 0);
  assert.ok(Array.isArray(result.strategyBacktest.tradeLedger));
  assert.equal(result.strategyBacktest.researchVariants.length, 8);
  assert.ok(result.strategyBacktest.researchVariants.every((variant) => ["insufficient", "descriptive", "exploratory"].includes(variant.status)));
  assert.match(result.strategyBacktest.researchMethodology, /multiple comparisons create selection bias/);
  assert.equal(result.strategyBacktest.riskSensitivity.length, 8);
  assert.equal(result.strategyBacktest.entryQuality.length, 11);
  assert.equal(result.strategyBacktest.liquidityContext.length, 7);
  assert.equal(result.strategyBacktest.advancedValidation.variants.length, 7);
  assert.ok(result.strategyBacktest.advancedValidation.split.finalTestStart);
  assert.ok(result.strategyBacktest.advancedValidation.variants.every((variant) => ["insufficient", "descriptive", "exploratory"].includes(variant.status)));
  assert.match(result.strategyBacktest.advancedValidation.methodology, /60% development \/ 20% validation \/ 20% final test/);
  assert.ok(result.strategyBacktest.liquidityContext.every((variant) => ["insufficient", "descriptive", "exploratory"].includes(variant.status)));
  assert.match(result.strategyBacktest.liquidityContextMethodology, /UTC/);
  assert.ok(result.strategyBacktest.entryQuality.every((variant) => variant.filteredOutCandidates >= 0 && variant.filteredOutWins >= 0 && variant.filteredOutLosses >= 0));
  assert.ok(result.strategyBacktest.entryQuality.every((variant) => variant.medianSweepDepthAtr === null || variant.medianSweepDepthAtr >= 0));
  assert.ok(result.strategyBacktest.entryQuality.some((variant) => variant.name.includes("Sweep quality · strong")));
  assert.ok(result.strategyBacktest.entryQuality.every((variant) => ["insufficient", "descriptive", "exploratory"].includes(variant.status)));
  assert.ok(result.strategyBacktest.entryQuality.every((variant) => variant.outOfSampleMaxDrawdownR >= 0));
  assert.match(result.strategyBacktest.entryQualityMethodology, /causal sweep\/reclaim candidates/);
  assert.match(result.strategyBacktest.entryQualityMethodology, /Sweep depth is wick penetration/);
  assert.deepEqual(Array.from(result.strategyBacktest.riskSensitivity, item => item.targetR), [1, 1.5, 2, 3, 1, 1.5, 2, 3]);
  assert.ok(result.strategyBacktest.riskSensitivity.every(item => ["structural", "atr"].includes(item.stopModel)));
  assert.ok(result.strategyBacktest.riskSensitivity.every(item => item.outOfSampleMaxDrawdownR >= 0));
  assert.equal(result.strategyBacktest.tradeLedger.length, result.strategyBacktest.trades);
  assert.ok(result.backtest.trades >= 0);
  assert.ok(result.strategyBacktest.trades >= 0);
  assert.ok(result.strategyBacktest.maxDrawdownR >= 0);
  assert.ok(Array.isArray(result.strategyBacktest.diagnostics.byDirection));
  assert.ok(Array.isArray(result.strategyBacktest.diagnostics.bySession));
  assert.ok(Array.isArray(result.strategyBacktest.diagnostics.byRegime));
  assert.equal(result.strategyBacktest.diagnostics.byExit.reduce((sum, item) => sum + item.trades, 0), result.strategyBacktest.trades);
  assert.match(result.strategyBacktest.diagnostics.sessionTimezone, /UTC/);
  assert.ok(result.strategyBacktest.diagnostics.byFactor.every((item) => item.trades <= result.strategyBacktest.trades));
  assert.ok(["active", "conditional", "unavailable"].includes(result.riskPlan.status));
  assert.ok(Array.isArray(result.riskPlan.targets));
  assert.ok(result.backtest.maxDrawdownR >= 0);
  assert.match(result.backtest.methodology, /past bars only/);
  assert.equal(result.structure.higherTimeframe, "1h");
  assert.notEqual(result.structure.higherTimeframeTrend, "unavailable");
  assert.equal(result.multiTimeframe.length, 5);
  assert.ok(["bullish-bos", "bearish-bos", "bullish-choch", "bearish-choch", "none"].includes(result.structure.breakType));
});

test("spot order-flow endpoint has no paid provider dependency and labels broker-only data", () => {
  const route = fs.readFileSync(path.join(__dirname, "../../app/api/orderflow/absorption/route.ts"), "utf8");
  const env = fs.readFileSync(path.join(__dirname, "../../.env.example"), "utf8");
  assert.match(route, /broker-only/);
  assert.match(route, /tick volume/);
  assert.doesNotMatch(route, /Databento|DATABENTO_API_KEY/);
  assert.doesNotMatch(env, /DATABENTO/);
  assert.equal(fs.existsSync(path.join(__dirname, "../../lib/orderflow/providers/databento.ts")), false);
});

test("liquidity map is explicitly candle-derived and reports FVG/sweep fields", () => {
  const file = path.join(__dirname, "../../lib/market-intelligence/liquidity-analysis.ts");
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /fairValueGaps/);
  assert.match(source, /equalHighs/);
  assert.match(source, /equalLows/);
  assert.match(source, /not actual buyer\/seller aggressor flow/);
  assert.match(source, /brokerVolume/);
  const route = fs.readFileSync(path.join(__dirname, "../../app/api/market-intelligence/route.ts"), "utf8");
  assert.match(route, /analyzeLiquidity\(primary\.candles\)/);
});

test("broker tick-volume proxy reports relative activity without claiming aggressor flow", () => {
  const ts = require("typescript");
  const vm = require("node:vm");
  const file = path.join(__dirname, "../../lib/market-intelligence/liquidity-analysis.ts");
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.module.exports = sandbox.exports;
  vm.runInNewContext(compiled, sandbox, { filename: "liquidity-analysis.cjs" });
  const candles = Array.from({ length: 20 }, (_, i) => ({
    time: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString(),
    open: 100 + i, close: 101 + i, high: 102 + i, low: 99 + i, volume: 100 + i,
  }));
  const result = sandbox.module.exports.analyzeLiquidity(candles);
  assert.equal(result.brokerVolume.available, true);
  assert.ok(result.brokerVolume.latest > 0);
  assert.ok(result.brokerVolume.relative > 0);
  assert.equal(result.brokerVolume.directionalBias, "buyer-leaning");
  assert.match(result.note, /not actual buyer\/seller aggressor flow/);
});

test("v6 liquidity analysis exposes ranked pools, confirmed sweeps, FVG quality and order-block proxies", () => {
  const ts = require("typescript");
  const vm = require("node:vm");
  const file = path.join(__dirname, "../../lib/market-intelligence/liquidity-analysis.ts");
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.module.exports = sandbox.exports;
  vm.runInNewContext(compiled, sandbox, { filename: "liquidity-analysis-v6.cjs" });
  const candles = Array.from({ length: 90 }, (_, i) => {
    const center = 2000 + Math.sin(i * 0.34) * 2 + Math.sin(i * 0.09) * 1.5;
    const open = center + (i % 2 ? 0.35 : -0.3);
    const close = center + (i % 3 ? -0.2 : 0.45);
    return { time: new Date(Date.UTC(2026, 0, 1) + i * 900000).toISOString(), open, close, high: Math.max(open, close) + 0.8, low: Math.min(open, close) - 0.8, volume: 100 + i };
  });
  const result = sandbox.module.exports.analyzeLiquidity(candles);
  assert.ok(Array.isArray(result.pools));
  assert.ok(Array.isArray(result.sweepEvents));
  assert.ok(Array.isArray(result.orderBlocks));
  assert.ok(result.fairValueGaps.every(gap => gap.strength >= 1 && gap.strength <= 5 && ["open", "partially-mitigated", "mitigated"].includes(gap.status)));
  assert.match(result.note, /not verified institutional orders/);
});


test("v7 confirmation gate prevents directional forecasts without trigger and displacement", () => {
  const engine = fs.readFileSync(path.join(__dirname, "../../lib/market-intelligence/engine.ts"), "utf8");
  assert.match(engine, /setupConfirmed/);
  assert.match(engine, /alignedDisplacement/);
  assert.match(engine, /confirmationScore >= 60/);
  assert.match(engine, /hasTrigger/);
  assert.match(engine, /directionalCandidate/);
});


test("v8 exposes conditional ATR/swing risk levels and a separate liquidity-confirmation walk-forward backtest", () => {
  const engine = fs.readFileSync(path.join(__dirname, "../../lib/market-intelligence/engine.ts"), "utf8");
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(engine, /function liquidityConfirmationBacktest/);
  assert.match(engine, /strategyBacktest/);
  assert.match(engine, /riskPlan/);
  assert.match(engine, /action === "WAIT" \? "conditional" : "active"/);
  assert.match(engine, /\[1, 2, 3\]\.map/);
  assert.match(component, /Liquidity-confirmation strategy backtest/);
  assert.match(component, /Dynamic risk plan/);
});


test("v9 strategy validation reports chronological holdout, costs, monthly stats and timeframe comparisons", () => {
  const ts = require("typescript");
  const vm = require("node:vm");
  const file = path.join(__dirname, "../../lib/market-intelligence/engine.ts");
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} }, require: sandboxRequire };
  sandbox.module.exports = sandbox.exports;
  vm.runInNewContext(compiled, sandbox, { filename: "market-intelligence-v9.cjs" });
  const candles = Array.from({ length: 240 }, (_, i) => {
    const base = 2300 + Math.sin(i * 0.23) * 2.4 + Math.sin(i * 0.047) * 1.8;
    const open = base + Math.sin(i * 0.61) * 0.45;
    const close = base + Math.cos(i * 0.37) * 0.62;
    return { time: new Date(Date.UTC(2025, 0, 1) + i * 900000).toISOString(), open, high: Math.max(open, close) + 0.55, low: Math.min(open, close) - 0.52, close, volume: 100 + i };
  });
  const result = sandbox.module.exports.buildMarketForecast({
    candles, symbol: "XAU/USD", broker: "ctrader", timeframe: "15min", source: "test", mode: "closed",
    higherTimeframeCandles: candles.filter((_, i) => i % 4 === 0), higherTimeframe: "1h",
    multiTimeframeCandles: { "5min": candles, "15min": candles, "1h": candles, "4h": candles, "1day": candles },
  });
  const report = result.strategyBacktest;
  assert.ok(report.outOfSample.trades >= 0);
  assert.ok(report.inSample.trades >= 0);
  assert.equal(report.costSensitivity.length, 4);
  assert.equal(Array.from(report.costSensitivity, x => x.costR).join(","), "0,0.05,0.1,0.2");
  assert.ok(Array.isArray(report.monthly));
  assert.ok(["insufficient", "limited", "developing", "larger-sample"].includes(report.sampleAdequacy));
  assert.match(report.methodology, /final 30% is a chronological holdout/);
  assert.equal(result.strategyByTimeframe.length, 5);
  assert.ok(result.strategyByTimeframe.every(x => ["available", "insufficient"].includes(x.status)));
  assert.equal(result.strategyByInstrument.length, 2);
  assert.equal(result.strategyByInstrument[1].symbol, "XAG/USD");
});

test("Market Intelligence is rendered once in the feature accordion and v9 validation UI is present", () => {
  const page = fs.readFileSync(path.join(__dirname, "../../app/page.tsx"), "utf8");
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.equal((page.match(/<MarketIntelligence\b/g) || []).length, 1);
  assert.match(component, /OUT-OF-SAMPLE/);
  assert.match(component, /mi-validation-timeframes/);
  assert.match(component, /illustrative R-based sensitivity checks/);
});


test("v10 requests paginated broker history and retains up to 2,500 bars for strategy validation", () => {
  const ctrader = fs.readFileSync(path.join(__dirname, "../../lib/ctrader/candles.ts"), "utf8");
  const exness = fs.readFileSync(path.join(__dirname, "../../lib/exness/market-data.ts"), "utf8");
  const marketRoute = fs.readFileSync(path.join(__dirname, "../../app/api/market/route.ts"), "utf8");
  const intelligenceRoute = fs.readFileSync(path.join(__dirname, "../../app/api/market-intelligence/route.ts"), "utf8");
  const engine = fs.readFileSync(path.join(__dirname, "../../lib/market-intelligence/engine.ts"), "utf8");
  assert.match(ctrader, /requestedBars[\s\S]*2500/);
  assert.match(ctrader, /cursor = oldest - 1/);
  assert.match(exness, /pageSize = 500/);
  assert.match(exness, /for \(let page = 0; page < pages; page \+= 1\)/);
  assert.match(marketRoute, /historyBars/);
  assert.match(intelligenceRoute, /loadCandles\(timeframe, symbol, 2500\)/);
  assert.match(engine, /slice\(-2500\)/);
  assert.match(engine, /oldestCandle/);
  assert.doesNotMatch(engine, /slice\(-500\);\s*if \(candles.length < 45\)/);
});


test("Market Intelligence history counters render safely when API fields are missing", () => {
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(component, /const formatCount = \(value: unknown, fallback = 0\)/);
  assert.match(component, /formatCount\(forecast\.data\?\.candles\)/);
  assert.match(component, /formatCount\(forecast\.data\?\.requestedCandles/);
  assert.doesNotMatch(component, /forecast\.data\.requestedCandles\.toLocaleString\(\)/);
});


test("v11 exposes trade diagnostics by direction, UTC session, regime, exit and confirmation factor", () => {
  const engine = fs.readFileSync(path.join(__dirname, "../../lib/market-intelligence/engine.ts"), "utf8");
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(engine, /byDirection/);
  assert.match(engine, /bySession/);
  assert.match(engine, /byRegime/);
  assert.match(engine, /byExit/);
  assert.match(engine, /byFactor/);
  assert.match(engine, /getUTCHours/);
  assert.match(component, /Why did the strategy win or lose/);
  assert.match(component, /Trading session/);
  assert.match(component, /Market regime/);
});


test("v12 history audit detects duplicate, out-of-order, malformed and timezone-ambiguous broker candles", () => {
  const ts = require("typescript");
  const vm = require("node:vm");
  const file = path.join(__dirname, "../../lib/market-intelligence/engine.ts");
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const sandbox = { exports: {}, module: { exports: {} }, require: sandboxRequire }; sandbox.module.exports = sandbox.exports;
  vm.runInNewContext(compiled, sandbox, { filename: "market-intelligence-audit.cjs" });
  const { auditCandleHistory } = sandbox.module.exports;
  const base = Date.UTC(2026, 0, 1);
  const bar = (minute, timeSuffix = "Z") => ({ time: new Date(base + minute * 60000).toISOString().replace("Z", timeSuffix), open: 100, high: 102, low: 99, close: 101, volume: 10 });
  const malformed = { ...bar(3), high: 98 };
  const result = auditCandleHistory([bar(0), bar(4, ""), bar(1), bar(1), malformed], "1min");
  assert.equal(result.rawCandles, 5);
  assert.equal(result.duplicateTimestamps, 1);
  assert.equal(result.outOfOrderTimestamps, 1);
  assert.equal(result.invalidOhlc, 1);
  assert.equal(result.timezoneOffsetCoveragePercent, 80);
  assert.equal(result.validCandles, 3);
  assert.equal(result.normalizedCandles.length, 3);
  assert.ok(result.internalGapCount >= 1);
  assert.match(result.timestampAssumption, /Naive timestamps/);
});

test("v12 strategy ledger includes auditable prices, timestamps, outcomes and holdout labels", () => {
  const engine = fs.readFileSync(path.join(__dirname, "../../lib/market-intelligence/engine.ts"), "utf8");
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(engine, /tradeLedger:/);
  assert.match(engine, /sample: i < splitIndex \? "development" : "out-of-sample"/);
  assert.match(engine, /exitTime: valid\[exitIndex\]\.time/);
  assert.match(engine, /auditCandleHistory/);
  assert.match(component, /Export trade ledger CSV/);
  assert.match(component, /Broker history quality audit/);
});

test("v13 exposes fixed, chronological confirmation ablation research without auto-selecting a live variant", () => {
  const engine = fs.readFileSync(path.join(__dirname, "../../lib/market-intelligence/engine.ts"), "utf8");
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(engine, /strategyResearchVariants/);
  assert.match(engine, /BOS \+ trend/);
  assert.match(engine, /All three confirmations/);
  assert.match(engine, /multiple comparisons create selection bias/);
  assert.match(engine, /outOfSampleNetExpectancyAt010R/);
  assert.match(component, /Strategy research · fixed confirmation ablations/);
  assert.match(component, /Do not select|must not be selected/i);
  assert.doesNotMatch(engine, /autoSelectBestVariant|selectedWinningVariant|activateBestStrategy/i);
});


test("dashboard tolerates missing strategy research fields from stale API payloads", () => {
  const file = path.join(__dirname, "../../components/market-intelligence.tsx");
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /Array\.isArray\(forecast\?\.strategyBacktest\?\.researchVariants\)/);
  assert.match(source, /researchVariants\.map\(\(variant\)/);
  assert.doesNotMatch(source, /forecast\.strategyBacktest\.researchVariants\.map/);
  assert.match(source, /Research variants are not present in this API response/);
});


test("v14 exposes a pre-declared stop/target sensitivity grid without changing live forecast rules", () => {
  const engine = fs.readFileSync(path.join(__dirname, "../../lib/market-intelligence/engine.ts"), "utf8");
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(engine, /riskConfigurations/);
  assert.match(engine, /Structural stop/);
  assert.match(engine, /1\.0 ATR stop/);
  assert.match(engine, /riskSensitivity/);
  assert.match(component, /Risk parameter sensitivity/);
  assert.match(component, /fixed entry candidates/);
  assert.match(engine, /same-bar stop\/target ties treated as losses/);
});


test("v15 exports all risk sensitivity configurations with instrument, broker and out-of-sample metrics", () => {
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(component, /const downloadRiskSensitivity = \(\) =>/);
  assert.match(component, /outOfSampleExpectancyR/);
  assert.match(component, /outOfSampleMaxDrawdownR/);
  assert.match(component, /netExpectancyAt010RCost/);
  assert.match(component, /risk-sensitivity\.csv/);
  assert.match(component, /Export risk sensitivity CSV/);
  assert.match(component, /Array\.isArray\(forecast\?\.strategyBacktest\?\.riskSensitivity\)/);
});


test("entry-quality research compares fixed entry filters without changing live forecast execution", () => {
  const file = path.join(__dirname, "../../lib/market-intelligence/engine.ts");
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /function entryQualityResearch/);
  assert.match(source, /Sweep quality · balanced/);
  assert.match(source, /filteredOutLosses/);
  assert.match(source, /Sweep \+ displacement \+ BOS/);
  assert.match(source, /entryGapAtr <= 0\.25/);
  assert.match(source, /Pre-declared entry-filter/);
  assert.doesNotMatch(source, /placeOrder|createOrder|executeTrade/i);
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(component, /Export entry research CSV/);
});

test("v18 exposes causal liquidity-context research and avoids order execution", () => {
  const engine = fs.readFileSync(path.join(__dirname, "../../lib/market-intelligence/engine.ts"), "utf8");
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(engine, /function liquidityContextResearch/);
  assert.match(engine, /Previous-day high\/low sweep/);
  assert.match(engine, /Asian-session high\/low sweep/);
  assert.match(engine, /Equal highs\/lows sweep/);
  assert.match(engine, /liquidityContextMethodology/);
  assert.match(component, /Export Liquidity Context CSV/);
  assert.match(component, /liquidity-context\.csv/);
  assert.doesNotMatch(engine, /placeOrder|createOrder|executeTrade/i);
});

test("v22 advanced validation uses three chronological partitions and fixed predeclared variants", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../lib/market-intelligence/advanced-validation.ts"), "utf8");
  assert.match(source, /Math\.floor\(n\s*\*\s*\.6\)/);
  assert.match(source, /Math\.floor\(n\s*\*\s*\.8\)/);
  assert.match(source, /final-test/);
  assert.match(source, /adverse-first/);
  assert.match(source, /netFinalTestAt010R/);
  assert.match(source, /Equal highs\/lows \+ reclaim/);
  assert.match(source, /Asian range sweep \+ reclaim/);
  assert.doesNotMatch(source, /placeOrder|createOrder|executeTrade/i);
  const component = fs.readFileSync(path.join(__dirname, "../../components/market-intelligence.tsx"), "utf8");
  assert.match(component, /v22 · Advanced validation research/);
  assert.match(component, /Export v22 validation CSV/);
});


test("shared broker market route supports aggregated 10-minute, weekly and monthly candles", () => {
  const route = fs.readFileSync(path.join(__dirname, "../../app/api/market/route.ts"), "utf8");
  assert.match(route, /"10min"/);
  assert.match(route, /"1week"/);
  assert.match(route, /"1month"/);
  assert.match(route, /aggregateBrokerCandles/);
  assert.match(route, /sourceInterval = interval === "10min" \? "5min"/);
  assert.match(route, /interval: sourceInterval/);
});
