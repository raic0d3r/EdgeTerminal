const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const file = path.join(__dirname, "../../lib/market-intelligence/unified-bias.ts");
const source = fs.readFileSync(file, "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const sandbox = { exports: {}, module: { exports: {} } };
sandbox.module.exports = sandbox.exports;
vm.runInNewContext(compiled, sandbox, { filename: "unified-bias.cjs" });
const { calculateUnifiedBias } = sandbox.module.exports;

test("unified bias weights active technical, COT, retail and macro sources", () => {
  const result = calculateUnifiedBias([
    { key: "technical", label: "Technical", bias: "Bearish", weight: 40, active: true },
    { key: "cot", label: "COT", bias: "Bearish", weight: 20, active: true },
    { key: "retail", label: "Retail", bias: "Bullish", weight: 15, active: true },
    { key: "macro", label: "Macro", bias: "Bearish", weight: 25, active: true },
  ]);
  assert.equal(result.bias, "Bearish");
  assert.equal(result.score, 15);
  assert.equal(result.confidence, 100);
  assert.equal(result.activeInputs, 4);
  assert.equal(result.sources.find(x => x.key === "retail").contribution, 15);
});

test("missing feeds are excluded and remaining weights are renormalized", () => {
  const result = calculateUnifiedBias([
    { key: "technical", label: "Technical", bias: "Bullish", weight: 40, active: true },
    { key: "cot", label: "COT", bias: "Bearish", weight: 20, active: false },
    { key: "retail", label: "Retail", bias: "Neutral", weight: 15, active: false },
    { key: "macro", label: "Macro", bias: "Bullish", weight: 25, active: true },
  ]);
  assert.equal(result.bias, "Bullish");
  assert.equal(result.score, 100);
  assert.equal(result.confidence, 65);
  assert.equal(result.activeInputs, 2);
  assert.equal(result.sources.find(x => x.key === "cot").contribution, 0);
  assert.equal(result.sources.find(x => x.key === "cot").active, false);
});

test("no available inputs returns neutral with no score and zero confidence", () => {
  const result = calculateUnifiedBias([
    { key: "technical", label: "Technical", bias: "Neutral", weight: 40, active: false },
    { key: "cot", label: "COT", bias: "Neutral", weight: 20, active: false },
  ]);
  assert.equal(result.bias, "Neutral");
  assert.equal(result.score, null);
  assert.equal(result.confidence, 0);
});

test("Master Scorecard renders the unified score, source contribution and confidence coverage", () => {
  const component = fs.readFileSync(path.join(__dirname, "../../components/master-scorecard.tsx"), "utf8");
  assert.match(component, /calculateUnifiedBias/);
  assert.match(component, /weight: 40/);
  assert.match(component, /weight: 20/);
  assert.match(component, /weight: 15/);
  assert.match(component, /weight: 25/);
  assert.match(component, /Source contribution/);
  assert.match(component, /Confidence \{unifiedBias\.confidence\}%/);
  assert.match(component, /Missing feeds are excluded, never treated as bearish/);
});
