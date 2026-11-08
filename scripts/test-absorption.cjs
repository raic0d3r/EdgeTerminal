#!/usr/bin/env node
/*
 * Standalone validation for lib/orderflow/engine.ts.
 * Run from the project root: node scripts/test-absorption.cjs
 * Requires the project's existing TypeScript devDependency.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');

const root = process.cwd();
const enginePath = path.join(root, 'lib/orderflow/engine.ts');
if (!fs.existsSync(enginePath)) {
  console.error('Cannot find lib/orderflow/engine.ts. Run this command from your project root.');
  process.exit(1);
}

const source = fs.readFileSync(enginePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  reportDiagnostics: true,
});
const errors = (compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
if (errors.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(errors, {
    getCurrentDirectory: () => root,
    getCanonicalFileName: f => f,
    getNewLine: () => '\n',
  }));
  process.exit(1);
}
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'edge-absorption-'));
let detect;
try {
  const compiledPath = path.join(tempDir, 'engine.cjs');
  fs.writeFileSync(compiledPath, compiled.outputText);
  detect = require(compiledPath).detectAbsorptionCandidates;

  const base = 1_800_000_000_000;
  const tick = 0.1;
  const opts = { tickSize: tick, intervalMs: 60_000, lookaheadTrades: 5,
    minAggressorVolume: 10, dominanceRatio: 1.5, maxFollowThroughTicks: 1 };

  function trade(ms, price, quantity, side) {
    return { timestamp: base + ms, price, quantity, side };
  }
  function quietLevels(center, startMs = 0) {
    return [
      trade(startMs, center - 0.2, 1, 'buy'),
      trade(startMs + 1, center - 0.1, 1, 'sell'),
      trade(startMs + 2, center + 0.1, 1, 'buy'),
      trade(startMs + 3, center + 0.2, 1, 'sell'),
    ];
  }

  // Heavy aggressive selling at 2400.0, followed by no meaningful downside progress.
  const buyAbsorptionInput = [
    trade(10, 2400.0, 100, 'sell'),
    trade(11, 2400.0, 1, 'buy'),
    ...[2399.9, 2399.9, 2399.9, 2399.9, 2399.9].map((p, i) => trade(12 + i, p, 1, i % 2 ? 'sell' : 'buy')),
    ...quietLevels(2400.0, 20),
  ];
  const buyCandidates = detect(buyAbsorptionInput, opts);
  assert(buyCandidates.some(c => c.type === 'buy-absorption' && c.price === 2400.0),
    'Expected buy-absorption candidate for heavy selling with price holding');

  // Heavy aggressive buying at 2400.0, followed by no meaningful upside progress.
  const sellAbsorptionInput = [
    trade(10, 2400.0, 100, 'buy'),
    trade(11, 2400.0, 1, 'sell'),
    ...[2400.1, 2400.1, 2400.1, 2400.1, 2400.1].map((p, i) => trade(12 + i, p, 1, i % 2 ? 'buy' : 'sell')),
    ...quietLevels(2400.0, 20),
  ];
  const sellCandidates = detect(sellAbsorptionInput, opts);
  assert(sellCandidates.some(c => c.type === 'sell-absorption' && c.price === 2400.0),
    'Expected sell-absorption candidate for heavy buying with price holding');

  // Heavy aggressive buying followed by more than one tick of upside progress.
  const noAbsorptionInput = [
    trade(10, 2400.0, 100, 'buy'),
    trade(11, 2400.0, 1, 'sell'),
    ...[2400.2, 2400.3, 2400.4, 2400.5, 2400.6].map((p, i) => trade(12 + i, p, 1, 'buy')),
    ...quietLevels(2400.0, 20),
  ];
  const noCandidates = detect(noAbsorptionInput, opts);
  assert(!noCandidates.some(c => c.type === 'sell-absorption' && c.price === 2400.0),
    'Expected no sell-absorption candidate when price follows aggressive buying higher');

  console.log('PASS 1: Heavy selling + price holds => buy-absorption candidate');
  console.log('PASS 2: Heavy buying + price holds => sell-absorption candidate');
  console.log('PASS 3: Heavy buying + price rises > 1 tick => no sell-absorption candidate');
  console.log('\nAbsorption detector controlled validation: 3/3 passed.');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
