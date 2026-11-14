const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const route = fs.readFileSync(path.join(root, 'app/api/market-context/route.ts'), 'utf8');
const scorecard = fs.readFileSync(path.join(root, 'components/master-scorecard.tsx'), 'utf8');

test('COT uses the official CFTC Disaggregated Futures Only dataset for gold and silver', () => {
  assert.match(route, /https:\/\/publicreporting\.cftc\.gov\/resource\/72hh-3qpy\.json/);
  assert.match(route, /asset === "XAU\/USD" \? "088691" : "084691"/);
  assert.match(route, /m_money_positions_long_all/);
  assert.match(route, /m_money_positions_short_all/);
  assert.match(route, /CFTC Disaggregated Futures Only · Managed Money/);
});

test('no IG account or credentials are required; CFTC is not misrepresented as retail sentiment', () => {
  assert.doesNotMatch(route, /IG_API_KEY|IG_USERNAME|IG_PASSWORD|client-sentiment/);
  assert.match(route, /Sentmo public Gold positioning API/);
  assert.match(route, /TradeLytics public XAGUSD composite sentiment dashboard/);
  assert.match(route, /external_only/);
  assert.doesNotMatch(scorecard, /Open provider dashboard|target=\"_blank\"/);
  assert.match(route, /not included in Master Bias/);
  assert.match(route, /revalidate: 900/);
  assert.match(scorecard, /msc-retail-native/);
  assert.match(scorecard, /DATA UNAVAILABLE/);
  assert.doesNotMatch(scorecard, /iframe src={retailProviderUrl}|msc-retail-embed/);
  assert.match(route, /not a verified retail long\/short ratio/);
  assert.match(scorecard, /CFTC COT is institutional trader-category positioning, not retail-client sentiment/);
});


test('Sentmo Gold endpoint is imported, validated, cached for 15 minutes and rendered natively', () => {
  assert.ok(route.includes("https://sentmo-worker.business-41d.workers.dev/api/data/gold"));
  assert.ok(route.includes('body.instrument !== "GOLD"'));
  assert.ok(route.includes("current_data"));
  assert.ok(route.includes("data_24h_ago"));
  assert.ok(route.includes('long > short ? "Bullish" : short > long ? "Bearish" : "Neutral"'));
  assert.ok(route.includes('const contrarianBias'));
  assert.ok(route.includes('long >= 70 ? "Bearish"'));
  assert.ok(route.includes('short >= 70 ? "Bullish"'));
  assert.match(scorecard, /Directional sentiment/);
  assert.match(scorecard, /Contrarian interpretation · crowded positioning/);
  assert.match(route, /revalidate: 900/);
  assert.match(scorecard, /LIVE DATA/);
  assert.match(scorecard, /Long positioning/);
  assert.match(scorecard, /Short positioning/);
  assert.ok(scorecard.includes("currentTimestamp"));
  assert.ok(route.includes("Contrarian crowding heuristic"));
  assert.doesNotMatch(scorecard, /iframe src=/);
});


test('FRED fundamentals fetch four official series and expose auditable readings in Master Scorecard', () => {
  assert.match(route, /process\.env\.FRED_API_KEY/);
  assert.match(route, /https:\/\/api\.stlouisfed\.org\/fred\/series\/observations/);
  for (const series of ["DGS10", "DTWEXBGS", "FEDFUNDS", "CPIAUCSL"]) {
    assert.ok(route.includes(`"${series}"`), `missing FRED series ${series}`);
  }
  assert.match(route, /next: \{ revalidate: 21600 \}/);
  assert.match(route, /tenYearYield/);
  assert.match(route, /broadDollarIndex/);
  assert.match(route, /fedFundsRate/);
  assert.match(route, /cpi/);
  assert.match(route, /comparisonDate/);
  assert.match(scorecard, /10Y Treasury yield/);
  assert.match(scorecard, /Broad USD index/);
  assert.match(scorecard, /Federal Funds Rate/);
  assert.match(scorecard, /CPI index/);
  assert.match(scorecard, /FRED data could not be retrieved/);
  assert.doesNotMatch(scorecard, /NEXT_PUBLIC_FRED_API_KEY/);
});
