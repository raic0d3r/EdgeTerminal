# Edge Terminal — Absorption Candidates (Step 1)

This patch adds a provider-neutral heuristic detector and a read-only API endpoint.

## Files
- `lib/orderflow/engine.ts`: adds `detectAbsorptionCandidates`.
- `app/api/orderflow/absorption/route.ts`: returns candidates from stored GC/SI trade prints.

## Test
Start the app and request:
`/api/orderflow/absorption?instrument=GC`

Optional range parameters `from` and `to` are Unix timestamps in milliseconds. The maximum range is seven days.

A successful response includes `status`, `storedTradeCount`, `candidateCount`, and `candidates`.

## Interpretation and limitations
- Heavy aggressive selling followed by little/no downside progress is classified as a possible buy-absorption candidate.
- Heavy aggressive buying followed by little/no upside progress is classified as a possible sell-absorption candidate.
- These are heuristics, not proof of passive liquidity or institutional activity.
- Synthetic records remain simulated. Do not use these candidates as trading signals until validated against a suitable real trade feed and depth data.
