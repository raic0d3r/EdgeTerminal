export type AccessTier = "FREE" | "PRO" | "VIP";
export type FeatureRule = { title: string; tier: AccessTier; subscriptionUrl?: string; enabled: boolean };

export const FEATURE_DEFINITIONS: Array<{ title: string; defaultTier: AccessTier }> = [
  { title: "Position Trading Panel", defaultTier: "FREE" },
  { title: "Order Flow Footprint", defaultTier: "VIP" },
  { title: "Volume Profile & Footprint Analysis", defaultTier: "PRO" },
  { title: "Integrated Trade Journal & Analytics", defaultTier: "FREE" },
  { title: "Master Confluence & Probability Engine", defaultTier: "FREE" },
  { title: "Master Scorecard & Key Levels", defaultTier: "PRO" },
  { title: "COT Institutional Sentiment", defaultTier: "FREE" },
  { title: "Institutional Liquidity & Book Depth Map", defaultTier: "FREE" },
  { title: "Institutional Liquidity Heatmap", defaultTier: "FREE" },
  { title: "Volumetric Delta & VWAP Bands", defaultTier: "FREE" },
  { title: "Intermarket Correlation Matrix", defaultTier: "FREE" },
  { title: "Monetary Policy Watch & Macro Events", defaultTier: "PRO" },
];

export function defaultFeatureRules(): FeatureRule[] {
  const proUrl = process.env.NEXT_PUBLIC_PRO_SUBSCRIPTION_URL || process.env.PRO_SUBSCRIPTION_URL || "";
  const vipUrl = process.env.NEXT_PUBLIC_VIP_SUBSCRIPTION_URL || process.env.VIP_SUBSCRIPTION_URL || "";
  return FEATURE_DEFINITIONS.map(({ title, defaultTier }) => ({
    title,
    tier: defaultTier,
    enabled: true,
    subscriptionUrl: defaultTier === "VIP" ? vipUrl : defaultTier === "PRO" ? proUrl : "",
  }));
}

export function normalizeFeatureRules(input: unknown): FeatureRule[] {
  const defaults = defaultFeatureRules();
  if (!Array.isArray(input)) return defaults;
  const byTitle = new Map<string, Record<string, unknown>>();
  for (const item of input) if (item && typeof item === "object" && typeof (item as {title?: unknown}).title === "string") byTitle.set((item as {title: string}).title, item as Record<string, unknown>);
  return defaults.map((fallback) => {
    const item = byTitle.get(fallback.title);
    if (!item) return fallback;
    const tier = item.tier === "PRO" || item.tier === "VIP" || item.tier === "FREE" ? item.tier : fallback.tier;
    return { title: fallback.title, tier, enabled: typeof item.enabled === "boolean" ? item.enabled : true, subscriptionUrl: typeof item.subscriptionUrl === "string" ? item.subscriptionUrl.slice(0, 2000) : fallback.subscriptionUrl };
  });
}

export function validateFeatureRules(input: unknown): FeatureRule[] {
  if (!Array.isArray(input)) {
    throw new Error("Feature rules must be an array.");
  }

  if (input.length !== FEATURE_DEFINITIONS.length) {
    throw new Error("All feature rules must be provided.");
  }

  const byTitle = new Map<string, FeatureRule>();

  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Invalid feature rule.");
    }

    const item = raw as Record<string, unknown>;

    const allowedKeys = [
      "title",
      "tier",
      "enabled",
      "subscriptionUrl",
    ];

    if (Object.keys(item).some((key) => !allowedKeys.includes(key))) {
      throw new Error("Unexpected feature rule property.");
    }

    if (typeof item.title !== "string") {
      throw new Error("Feature title must be a string.");
    }

    const definition = FEATURE_DEFINITIONS.find(
      (feature) => feature.title === item.title
    );

    if (!definition) {
      throw new Error(`Unknown feature: ${item.title}`);
    }

    if (byTitle.has(item.title)) {
      throw new Error(`Duplicate feature: ${item.title}`);
    }

    if (
      item.tier !== "FREE" &&
      item.tier !== "PRO" &&
      item.tier !== "VIP"
    ) {
      throw new Error(`Invalid access tier: ${item.title}`);
    }

    if (typeof item.enabled !== "boolean") {
      throw new Error(`Invalid enabled value: ${item.title}`);
    }

    if (
      typeof item.subscriptionUrl !== "string" ||
      item.subscriptionUrl.length > 2000
    ) {
      throw new Error(`Invalid subscription URL: ${item.title}`);
    }

    const subscriptionUrl = item.subscriptionUrl.trim();

    if (subscriptionUrl) {
      try {
        const parsed = new URL(subscriptionUrl);

        if (
          parsed.protocol !== "https:" ||
          !parsed.hostname ||
          parsed.username ||
          parsed.password
        ) {
          throw new Error();
        }
      } catch {
        throw new Error(
          `Subscription link must be a valid HTTPS URL: ${item.title}`
        );
      }
    }

    byTitle.set(item.title, {
      title: item.title,
      tier: item.tier as AccessTier,
      enabled: item.enabled,
      subscriptionUrl,
    });
  }

  return FEATURE_DEFINITIONS.map((feature) => {
    const rule = byTitle.get(feature.title);

    if (!rule) {
      throw new Error(`Missing feature rule: ${feature.title}`);
    }

    return rule;
  });
}