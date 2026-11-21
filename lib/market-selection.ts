import { getIdToken, onAuthStateChanged, type User } from "@/lib/auth-client";
import { auth } from "@/lib/auth-client";
export type MarketBroker = "ctrader" | "exness";

const STORAGE_KEY = "edge-terminal-active-broker";
const ASSET_STORAGE_KEY = "edge-terminal-broker-by-asset";
export type MarketSymbol = "XAU/USD" | "XAG/USD" | "BTC/USD";

function normalizeSymbol(symbol?: string): MarketSymbol {
  const value = (symbol || "XAU/USD").toUpperCase().replace(/[^A-Z]/g, "");
  if (value === "XAGUSD") return "XAG/USD";
  if (value === "BTCUSD") return "BTC/USD";
  return "XAU/USD";
}

function readProviderMap(): Partial<Record<MarketSymbol, MarketBroker>> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ASSET_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getActiveMarketBroker(symbol?: string): MarketBroker {
  if (typeof window === "undefined") return "ctrader";
  const key = normalizeSymbol(symbol);
  const saved = readProviderMap()[key];
  if (saved === "ctrader" || saved === "exness") return saved;
  // Migrate the previous single global selection into the default instrument.
  const legacy = window.localStorage.getItem(STORAGE_KEY);
  return legacy === "exness" ? "exness" : "ctrader";
}

export function setActiveMarketBroker(broker: MarketBroker, symbol?: string) {
  if (typeof window === "undefined") return;
  const key = normalizeSymbol(symbol);
  const next = { ...readProviderMap(), [key]: broker };
  window.localStorage.setItem(ASSET_STORAGE_KEY, JSON.stringify(next));
  // Keep the legacy key in sync for older components or integrations.
  window.localStorage.setItem(STORAGE_KEY, broker);
  window.dispatchEvent(new CustomEvent("edge-terminal-broker-change", { detail: { symbol: key, broker } }));
}

export function marketApiUrl(symbol: string, interval: string) {
  const query = new URLSearchParams({ symbol, interval, provider: getActiveMarketBroker(symbol) });
  return `/api/market?${query.toString()}`;
}

let authReady: Promise<User | null> | null = null;
function waitForAuthUser(timeoutMs = 8000): Promise<User | null> {
  const firebaseAuth = auth;
  if (!firebaseAuth) return Promise.resolve(null);
  if (firebaseAuth.currentUser) return Promise.resolve(firebaseAuth.currentUser);

  if (!authReady) {
    const pending: Promise<User | null> = new Promise((resolve) => {
      let unsubscribe: () => void = () => {};
      const timer = setTimeout(() => {
        unsubscribe();
        resolve(firebaseAuth.currentUser);
      }, timeoutMs);

      unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(user);
      });
    });
    authReady = pending.finally(() => { authReady = null; });
  }

  return authReady;
}

export async function fetchMarketData(url: string, init: RequestInit = {}) {
  const user = await waitForAuthUser();
  const token = user ? await getIdToken(user) : null;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers, cache: "no-store" });
}
