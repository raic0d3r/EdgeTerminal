export type Direction = "Bullish" | "Bearish" | "Neutral";
export type BiasInput = { key: string; label: string; bias: Direction; weight: number; active: boolean; detail?: string };
export type UnifiedBiasResult = {
  bias: Direction;
  score: number | null;
  confidence: number;
  activeInputs: number;
  totalInputs: number;
  sources: Array<{ key: string; label: string; bias: Direction; weight: number; contribution: number; active: boolean; detail?: string }>;
  methodology: string;
};

/** Weighted directional research composite. Missing sources are excluded and active weights are renormalized. */
export function calculateUnifiedBias(inputs: BiasInput[]): UnifiedBiasResult {
  const totalWeight = inputs.reduce((sum, input) => sum + (Number.isFinite(input.weight) && input.weight > 0 ? input.weight : 0), 0);
  const active = inputs.filter(input => input.active && Number.isFinite(input.weight) && input.weight > 0);
  const activeWeight = active.reduce((sum, input) => sum + input.weight, 0);
  if (!activeWeight || !totalWeight) {
    return {
      bias: "Neutral", score: null, confidence: 0, activeInputs: 0, totalInputs: inputs.length,
      sources: inputs.map(input => ({ ...input, contribution: 0, active: false })),
      methodology: "No verified inputs are available. Missing or unavailable sources are excluded, not treated as bearish.",
    };
  }
  const signed = (bias: Direction) => bias === "Bullish" ? 1 : bias === "Bearish" ? -1 : 0;
  const normalized = active.reduce((sum, input) => sum + signed(input.bias) * input.weight, 0) / activeWeight;
  const score = Math.round(50 + normalized * 50);
  const bias: Direction = score >= 60 ? "Bullish" : score <= 40 ? "Bearish" : "Neutral";
  const sources = inputs.map(input => {
    const isActive = active.includes(input);
    return {
      ...input,
      active: isActive,
      contribution: isActive ? Number((signed(input.bias) * input.weight / activeWeight * 100).toFixed(1)) : 0,
    };
  });
  return {
    bias, score, confidence: Math.round(activeWeight / totalWeight * 100),
    activeInputs: active.length, totalInputs: inputs.length, sources,
    methodology: "Weighted directional research composite: Technical / multi-timeframe 40%, CFTC COT 20%, retail positioning 15%, macro fundamentals 25%. Available-source weights are renormalized when a feed is missing. Retail uses directional positioning; contrarian crowding is displayed separately and is not double-counted. This is research context, not a trade instruction.",
  };
}
