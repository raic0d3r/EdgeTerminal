const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'components/unified-trading-decision.tsx'), 'utf8');

test('Unified Decision consumes the existing market intelligence and market-context modules', () => {
  assert.match(source, /\/api\/market-intelligence/);
  assert.match(source, /\/api\/market-context/);
  assert.match(source, /calculateUnifiedBias\(/);
  assert.match(source, /weight:40/);
  assert.match(source, /weight:20/);
  assert.match(source, /weight:15/);
  assert.match(source, /weight:25/);
});

test('Unified Decision includes actual liquidity, support/resistance, flow, historical and risk evidence', () => {
  for (const label of ['Liquidity', 'Support \/ resistance', 'Order Flow', 'Historical validation', 'Dynamic risk plan']) {
    assert.match(source, new RegExp(label));
  }
  assert.match(source, /\/api\/orderflow\/absorption/);
  assert.match(source, /forecast\.historical/);
  assert.match(source, /forecast\.riskPlan/);
});

test('BUY and SELL require selected-timeframe confirmation, lower-timeframe confirmation and active risk plan', () => {
  assert.match(source, /forecast\.confirmation\.status==="confirmed"/);
  assert.match(source, /entryConfirmed/);
  assert.match(source, /forecast\.riskPlan\.status==="active"/);
  assert.match(source, /compositeConflict/);
});

test('Missing feeds are excluded and no automatic order execution is introduced', () => {
  assert.match(source, /active:context\?\.cot\?\.status==="connected"/);
  assert.match(source, /active:context\?\.retailSentiment\?\.status==="connected"/);
  assert.match(source, /active:context\?\.fundamentals\?\.status==="connected"/);
  assert.match(source, /No automatic execution/);
  assert.doesNotMatch(source, /placeOrder|submitOrder|\/api\/trade/);
});

test('Unified decision performance validation records only final directional signals and groups by instrument/timeframe', () => {
  const validation = fs.readFileSync(path.join(root, 'lib/market-intelligence/unified-decision-validation.ts'), 'utf8');
  assert.match(validation, /appendUnifiedDecisionSnapshot/);
  assert.match(validation, /evaluateUnifiedDecisionPerformance/);
  assert.match(validation, /asset: string/);
  assert.match(validation, /timeframe: string/);
  assert.match(validation, /validationAccuracy/);
  assert.match(validation, /BUY/);
  assert.match(validation, /SELL/);
  assert.match(source, /model\.decision !== "BUY" && model\.decision !== "SELL"/);
  assert.match(source, /LIVE DECISION PERFORMANCE/);
  assert.match(source, /localStorage/);
});

test('Market intelligence exposes historical close observations for prospective outcome matching', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/market-intelligence/route.ts'), 'utf8');
  assert.match(route, /validationPrices: primary\.candles\.map/);
});
