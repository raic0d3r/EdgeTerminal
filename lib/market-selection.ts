import { getIdToken, onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
export type MarketBroker = "ctrader" | "exness";

const STORAGE_KEY = "edge-terminal-active-broker";

export function getActiveMarketBroker(): MarketBroker {
  if (typeof window === "undefined") return "ctrader";
  return window.localStorage.getItem(STORAGE_KEY) === "exness" ? "exness" : "ctrader";
}

export function setActiveMarketBroker(broker: MarketBroker) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, broker);
  window.dispatchEvent(new CustomEvent("edge-terminal-broker-change", { detail: broker }));
}

export function marketApiUrl(symbol: string, interval: string) {
  const query = new URLSearchParams({ symbol, interval, provider: getActiveMarketBroker() });
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
