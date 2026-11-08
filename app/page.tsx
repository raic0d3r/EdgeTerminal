 "use client";

import { useEffect, useState } from "react";
import TradingViewChart from "@/components/trading-view-chart";
import { getActiveMarketBroker, setActiveMarketBroker, fetchMarketData, type MarketBroker } from "@/lib/market-selection";
import LiveTradingPanel from "@/components/live-trading-panel";
import GroupChat from "@/components/group-chat";
import PrivateInbox from "@/components/private-inbox";
import AdminUserManagement from "@/components/admin-user-management";
import AuthGate from "@/components/auth-gate";
import IntermarketCorrelation from "@/components/intermarket-correlation";
import CotSentimentWidgets from "@/components/cot-sentiment-widgets";
import VolumetricVwap from "@/components/volumetric-vwap";
import OrderFlowFootprint from "@/components/order-flow-footprint";
import OrderFlowMarketReplay from "@/components/order-flow-market-replay";
import VolumeProfileAnalysis from "@/components/volume-profile-analysis";
import FeatureGate from "@/components/feature-gate";
import InstitutionalLiquidityMap from "@/components/institutional-liquidity-map";
import InstitutionalLiquidityHeatmap from "@/components/institutional-liquidity-heatmap";
import EconomicCalendar from "@/components/economic-calendar";
import NewsCenter, { NewsTicker } from "@/components/news-center";
import MasterConfluenceEngine from "@/components/master-confluence-engine";
import MasterScorecard from "@/components/master-scorecard";
import TradeJournal from "@/components/trade-journal";
import FeatureSuggestions from "@/components/feature-suggestions";
import PlatformDocumentation from "@/components/platform-documentation";
import FaqModal from "@/components/faq-modal";
import { getIdToken, onAuthStateChanged, updateProfile, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  Activity, BarChart3, Bell, BookOpen, BrainCircuit, CalendarDays, ChevronDown, LayoutGrid,
  ChevronRight, Clock3, Crown, Gauge, Globe2, Layers3, LockKeyhole, Menu,
  Newspaper, Settings, ShieldCheck, Sun, Moon, Users, Waves, X, Zap, Calculator, Search, MessageCircle, Download, Lightbulb, LogOut, SlidersHorizontal, CircleHelp, Bot, ArrowUpRight, Sparkles, Copy, Scale
} from "lucide-react";

type DashboardFeatureRule = { title: string; tier: "FREE" | "PRO" | "VIP"; enabled: boolean; subscriptionUrl?: string };

const modules: { title: string; sub: string; tier: string; icon: any }[] = [
  { title: "Volume Profile & Footprint Analysis", sub: "Session volume distribution, value area and footprint context", tier: "PRO", icon: BarChart3 },
  { title: "Institutional Liquidity Heatmap", sub: "Visualize liquidity concentrations and price areas", tier: "VIP", icon: Waves },
  { title: "Institutional Liquidity & Book Depth Map", sub: "Explore liquidity zones and available book-depth context", tier: "VIP", icon: Layers3 },
  { title: "Master Scorecard & Key Levels", sub: "Review market structure, scorecards and important levels", tier: "VIP", icon: Gauge },
  { title: "Master Confluence & Probability Engine", sub: "Combine technical context and setup evidence", tier: "VIP", icon: BrainCircuit },
  { title: "COT Institutional Sentiment", sub: "Commitments of Traders positioning and sentiment context", tier: "PRO", icon: Users },
  { title: "Volumetric Delta & VWAP Bands", sub: "Review delta estimates, VWAP and related bands", tier: "PRO", icon: Activity },
  { title: "Intermarket Correlation Matrix", sub: "Compare relationships across related markets", tier: "PRO", icon: Globe2 },
  { title: "Integrated Trade Journal & Analytics", sub: "Record trades, review execution and analyze performance", tier: "PRO", icon: BookOpen },
  { title: "Monetary Policy Watch & Macro Events", sub: "Monitor central-bank decisions and economic releases", tier: "FREE", icon: CalendarDays },
];


type FxSession = { city: string; zone: string; openHour: number; closeHour: number };
const FX_SESSIONS: FxSession[] = [
  { city: "Sydney", zone: "Australia/Sydney", openHour: 8, closeHour: 17 },
  { city: "Tokyo", zone: "Asia/Tokyo", openHour: 9, closeHour: 18 },
  { city: "London", zone: "Europe/London", openHour: 8, closeHour: 17 },
  { city: "New York", zone: "America/New_York", openHour: 8, closeHour: 17 },
];
function zonedParts(date: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  return Object.fromEntries(parts.map(p => [p.type, p.value])) as Record<string, string>;
}
function sessionIsOpen(date: Date, session: FxSession) {
  const p = zonedParts(date, session.zone);
  const day = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(p.weekday);
  const minute = Number(p.hour) * 60 + Number(p.minute);
  return day && minute >= session.openHour * 60 && minute < session.closeHour * 60;
}
function sessionDisplay(now: Date, session: FxSession) {
  const p = zonedParts(now, session.zone);
  const isOpen = sessionIsOpen(now, session);
  let transition = new Date(now);
  for (let i = 1; i <= 8 * 24 * 60; i++) {
    const candidate = new Date(now.getTime() + i * 60000);
    if (sessionIsOpen(candidate, session) !== isOpen) { transition = candidate; break; }
  }
  const ms = Math.max(0, transition.getTime() - now.getTime());
  const total = Math.ceil(ms / 60000);
  const days = Math.floor(total / 1440), hours = Math.floor((total % 1440) / 60), minutes = total % 60;
  const countdown = `${days ? `${days}d ` : ""}${hours}h ${minutes}m`;
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: session.zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  return { clock, state: isOpen ? "OPEN" : "CLOSED", action: isOpen ? "Closes in" : "Opens in", countdown };
}
function isForexWeekend(now: Date) {
  const p = zonedParts(now, "America/New_York");
  const minute = Number(p.hour) * 60 + Number(p.minute);
  return (p.weekday === "Fri" && minute >= 17 * 60) || p.weekday === "Sat" || (p.weekday === "Sun" && minute < 17 * 60);
}



function Dashboard() {
  const [asset, setAsset] = useState<"XAU/USD" | "XAG/USD">("XAU/USD");
  const [activeBroker, setActiveBroker] = useState<MarketBroker>("ctrader");
  useEffect(() => { const sync = () => setActiveBroker(getActiveMarketBroker()); sync(); window.addEventListener("edge-terminal-broker-change", sync); return () => window.removeEventListener("edge-terminal-broker-change", sync); }, []);
  const [tf, setTf] = useState("15m");
  const [toolbarQuote, setToolbarQuote] = useState<{ price: number | null; changePercent: number | null; source: string; updatedAt: string | null; status: string } | null>(null);
  const [toolbarQuoteError, setToolbarQuoteError] = useState(false);
  const [ctraderConnected, setCtraderConnected] = useState<boolean | null>(null);
  const [ctraderConfigured, setCtraderConfigured] = useState<boolean | null>(null);
  const [sessionNow, setSessionNow] = useState(() => new Date());

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshCTraderStatus = async () => {
      try {
        const currentUser = auth?.currentUser;
        const idToken = currentUser ? await currentUser.getIdToken() : "";
        const response = await fetch("/api/ctrader/status", { cache: "no-store", headers: idToken ? { Authorization: `Bearer ${idToken}` } : {} });
        const result = await response.json();
        if (!stopped) {
          setCtraderConnected(Boolean(result?.connected));
          setCtraderConfigured(Boolean(result?.configured));
        }
      } catch {
        if (!stopped) {
          setCtraderConnected(null);
          setCtraderConfigured(null);
        }
      } finally {
        if (!stopped) timer = setTimeout(refreshCTraderStatus, 20000);
      }
    };
    void refreshCTraderStatus();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);
  useEffect(() => { const timer = window.setInterval(() => setSessionNow(new Date()), 30_000); return () => window.clearInterval(timer); }, []);
  const connectCTrader = async () => {
    const user = auth?.currentUser;
    if (!user) { window.alert("Please sign in before connecting cTrader."); return; }
    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/ctrader/connect", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const body = await response.json();
      if (!response.ok || !body.authorizeUrl) throw new Error(body.error || "Could not start cTrader connection.");
      window.location.assign(body.authorizeUrl);
    } catch (error) { window.alert(error instanceof Error ? error.message : "cTrader connection failed."); }
  };


  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const refreshQuote = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetchMarketData(`/api/market?symbol=${encodeURIComponent(asset)}&interval=1min&provider=${activeBroker}&purpose=toolbar`, {
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || result?.data?.price == null || !Number.isFinite(Number(result.data.price))) {
          throw new Error("Current quote unavailable");
        }
        if (!stopped) {
          setToolbarQuote({
            price: Number(result.data.price),
            changePercent: result.data.changePercent == null ? null : Number(result.data.changePercent),
            source: String(result.data.source || "Market provider"),
            updatedAt: result.data.updatedAt ? String(result.data.updatedAt) : null,
            status: String(result.status || result.data.mode || "unavailable"),
          });
          setToolbarQuoteError(false);
        }
      } catch (error) {
        if (!stopped && !(error instanceof Error && error.name === "AbortError")) {
          setToolbarQuote(null);
          setToolbarQuoteError(true);
        }
      } finally {
        if (!stopped) timer = setTimeout(refreshQuote, 3000);
      }
    };

    setToolbarQuote(null);
    setToolbarQuoteError(false);
    void refreshQuote();
    return () => {
      stopped = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
    };
  }, [asset, activeBroker]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [capital, setCapital] = useState("10000");
  const [risk, setRisk] = useState("1");
  const [entry, setEntry] = useState("3995.38");
  const [stop, setStop] = useState("3985.38");
  const [notice, setNotice] = useState("");
  const [toolManagerOpen, setToolManagerOpen] = useState(false);
  const [mainSidebarOpen, setMainSidebarOpen] = useState(true);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [vipAreaOpen, setVipAreaOpen] = useState(false);
  const [vipAccess, setVipAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [activeChat, setActiveChat] = useState<{ key: string; title: string; subtitle: string; emoji: string } | null>(null);
  const [workspaceEmpty, setWorkspaceEmpty] = useState(false);
  const [featureSuggestionsOpen, setFeatureSuggestionsOpen] = useState(false);
  const [documentationOpen, setDocumentationOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [installAppOpen, setInstallAppOpen] = useState(false);
  const [installPlatform, setInstallPlatform] = useState<"ios" | "android">("ios");
  const [supportFormOpen, setSupportFormOpen] = useState(false);
  const [supportName, setSupportName] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [supportQuery, setSupportQuery] = useState("");
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportFeedback, setSupportFeedback] = useState("");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [aiAnalystOpen, setAiAnalystOpen] = useState(false);
  const [railPanel, setRailPanel] = useState<"calendar" | "news" | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [presence, setPresence] = useState("Online");
  const [geminiKey, setGeminiKey] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [exnessApiKey, setExnessApiKey] = useState("");
  const [exnessPrivateKey, setExnessPrivateKey] = useState("");
  const [exnessAccountId, setExnessAccountId] = useState("");
  const [exnessGateway, setExnessGateway] = useState("");
  const [exnessBusy, setExnessBusy] = useState(false);
  const [exnessStatus, setExnessStatus] = useState("");
  const [exnessConnected, setExnessConnected] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiGuideVisible, setAiGuideVisible] = useState(false);
  const [aiGuideTab, setAiGuideTab] = useState(0);
  const [aiSymbol, setAiSymbol] = useState("XAU/USD");
  const [aiTimeframe, setAiTimeframe] = useState("5m");
  const [aiAutoRefresh, setAiAutoRefresh] = useState(false);
  const [aiLastAction, setAiLastAction] = useState("Ready for analysis");
  const [chartMode, setChartMode] = useState<"chart" | "position" | "risk" | "combined">("chart");
  const [lightTheme, setLightTheme] = useState(false);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [chartFullscreen, setChartFullscreen] = useState(false);
  const [chartLayoutCount, setChartLayoutCount] = useState(1);
  const [chartLayoutOpen, setChartLayoutOpen] = useState(false);
  const [orderFlowOpen, setOrderFlowOpen] = useState(false);
  const [chartTimeframes, setChartTimeframes] = useState<string[]>(() => Array(16).fill("15m"));
  const setAllChartTimeframes = (value: string) => { setTf(value); setChartTimeframes(Array(16).fill(value)); };
  const setChartTimeframe = (index: number, value: string) => { setChartTimeframes(current => current.map((item, i) => i === index ? value : item)); };
  useEffect(() => {
    let cancelled = false;
    async function checkAccess() {
      try {
        const current = auth?.currentUser;
        if (!current) return;
        const token = await current.getIdToken();
        const response = await fetch("/api/access", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const data = await response.json();
        if (!cancelled && response.ok) setVipAccess(Boolean(data.isVip));
      } catch { /* access remains denied unless verified by the server */ }
      finally { if (!cancelled) setAccessChecked(true); }
    }
    void checkAccess();
    try {
      setLightTheme(localStorage.getItem("edge-terminal-theme") === "light");
    } catch {}
    const current = auth?.currentUser;
    setDisplayName(current?.displayName || current?.email?.split("@")[0] || "Edge User");
    setSupportName(current?.displayName || current?.email?.split("@")[0] || "");
    setSupportEmail(current?.email || "");
    setUsername(current?.email?.split("@")[0] || "");
    try {
      setAvatarUrl(localStorage.getItem("edge-profile-avatar") || "");
      setBio(localStorage.getItem("edge-profile-bio") || "");
      setPresence(localStorage.getItem("edge-profile-presence") || "Online");
      setGeminiKey(localStorage.getItem("edge-gemini-api-key") || "");
    } catch {}
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("edge-terminal-theme", lightTheme ? "light" : "dark");
    } catch {}
  }, [lightTheme]);

  async function saveSettings() {
    setSettingsNotice("");
    try {
      if (auth?.currentUser) await updateProfile(auth.currentUser, { displayName: displayName.trim() || username || "Edge User", photoURL: avatarUrl.trim() || null });
      localStorage.setItem("edge-profile-avatar", avatarUrl.trim());
      localStorage.setItem("edge-profile-bio", bio);
      localStorage.setItem("edge-profile-presence", presence);
      localStorage.setItem("edge-gemini-api-key", geminiKey.trim());
      setSettingsNotice("Settings saved on this device.");
    } catch (e) {
      setSettingsNotice(e instanceof Error ? e.message : "Could not save settings.");
    }
  }
  async function connectExness() {
    setExnessBusy(true); setExnessStatus("");
    try {
      if (!auth?.currentUser) throw new Error("Sign in before connecting Exness.");
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/exness/connect", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ apiKey: exnessApiKey, privateKey: exnessPrivateKey, accountId: exnessAccountId, gatewayUrl: exnessGateway }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Exness connection failed.");
      setExnessConnected(true); setExnessPrivateKey(""); setExnessApiKey(""); setExnessStatus(`Connected · Account ${data.accountId}${data.account?.currency ? ` · ${data.account.currency}` : ""}`);
    } catch (error) { setExnessConnected(false); setExnessStatus(error instanceof Error ? error.message : "Could not connect Exness."); }
    finally { setExnessBusy(false); }
  }
  async function disconnectExness() {
    setExnessBusy(true);
    try {
      if (!auth?.currentUser) throw new Error("Sign in required.");
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/exness/disconnect", { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("Could not disconnect Exness.");
      setExnessConnected(false); setExnessApiKey(""); setExnessPrivateKey(""); setExnessAccountId(""); setExnessStatus("Exness disconnected. Stored credentials were deleted.");
    } catch (error) { setExnessStatus(error instanceof Error ? error.message : "Disconnect failed."); }
    finally { setExnessBusy(false); }
  }
  async function checkExnessStatus() {
    try {
      if (!auth?.currentUser) return;
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/exness/status", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json(); setExnessConnected(Boolean(data.connected));
      if (data.connected) setExnessStatus(`Connected · Account ${data.accountId}${data.account?.currency ? ` · ${data.account.currency}` : ""}`);
    } catch { setExnessConnected(false); }
  }
  async function submitSupportQuery() {
    setSupportFeedback("");
    if (!supportName.trim() || !supportEmail.trim() || !supportQuery.trim()) { setSupportFeedback("Please complete your name, email address, and query."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail.trim())) { setSupportFeedback("Enter a valid email address."); return; }
    if (!auth?.currentUser) { setSupportFeedback("Please sign in before contacting support."); return; }
    setSupportBusy(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ body: `Support request\nName: ${supportName.trim()}\nEmail: ${supportEmail.trim()}\n\n${supportQuery.trim()}` }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "Could not submit your support request.");
      setSupportFeedback("Your request has been sent privately to the support team.");
      setSupportQuery("");
    } catch (error) { setSupportFeedback(error instanceof Error ? error.message : "Could not submit your support request."); }
    finally { setSupportBusy(false); }
  }

  async function runGeminiAnalysis() {
    if (!geminiKey.trim()) { setSettingsOpen(true); setSettingsNotice("Add your Gemini API key in AI Market Analysis (BYOK) first."); return; }
    if (!aiPrompt.trim()) { setAiReply("Enter a market question to analyze."); return; }
    setAiBusy(true); setAiReply("");
    try {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" + encodeURIComponent(geminiKey.trim()), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: `You are Edge Terminal AI Market Analyst. Provide educational, conditional market analysis, not financial advice. Never invent live prices, candles, bid/ask delta, CVD, POC, VAH, VAL, footprint clusters, institutional orders, or data that was not provided. If the user has not supplied live telemetry, explicitly say that the analysis is a framework based on the question rather than a verified live-footprint scan. State assumptions, bullish and bearish scenarios, invalidation conditions, and risk considerations. Active instrument: ${aiSymbol}; selected timeframe: ${aiTimeframe}. User request: ${aiPrompt.trim()}` }] }] })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "Gemini request failed.");
      setAiReply(data?.candidates?.[0]?.content?.parts?.map((p: {text?: string}) => p.text || "").join("\n") || "No response returned.");
    } catch (e) { setAiReply(e instanceof Error ? e.message : "Gemini analysis failed."); }
    finally { setAiBusy(false); }
  }
  const [visibleModules, setVisibleModules] = useState<string[]>(modules.map((m) => m.title));
  const [dashboardFeatureRules, setDashboardFeatureRules] = useState<DashboardFeatureRule[]>([]);
  useEffect(() => {
    let active = true;
    const loadFeatureRules = async (user: User | null) => {
      try {
        const headers: Record<string, string> = {};
        if (user) headers.Authorization = `Bearer ${await getIdToken(user)}`;
        const response = await fetch("/api/feature-access", { headers, cache: "no-store" });
        if (!response.ok) throw new Error("Could not load feature access settings");
        const data = await response.json() as { rules?: DashboardFeatureRule[] };
        if (active) setDashboardFeatureRules(Array.isArray(data.rules) ? data.rules : []);
      } catch {
        if (active) setDashboardFeatureRules([]);
      }
    };
    const unsubscribe = auth ? onAuthStateChanged(auth, user => { void loadFeatureRules(user); }) : () => { void loadFeatureRules(null); };
    const refresh = () => { void loadFeatureRules(auth?.currentUser || null); };
    window.addEventListener("focus", refresh);
    window.addEventListener("edge-terminal-feature-access-updated", refresh);
    return () => {
      active = false;
      unsubscribe();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("edge-terminal-feature-access-updated", refresh);
    };
  }, []);
  useEffect(() => {
    const closeChat = () => setActiveChat(null);
    window.addEventListener("edge-terminal-close-chat", closeChat);
    return () => window.removeEventListener("edge-terminal-close-chat", closeChat);
  }, []);
  const positionPanelEnabled = dashboardFeatureRules.find(rule => rule.title === "Position Trading Panel")?.enabled !== false;
  useEffect(() => {
    if (!positionPanelEnabled && chartMode === "position") setChartMode("chart");
  }, [positionPanelEnabled, chartMode]);
  const riskDollars = (Number(capital) || 0) * (Number(risk) || 0) / 100;
  const stopDistance = Math.abs((Number(entry) || 0) - (Number(stop) || 0));
  const contractSize = asset === "XAG/USD" ? 5000 : 100;
  const positionLots = stopDistance > 0 ? riskDollars / (stopDistance * contractSize) : 0;
  const positionUnits = positionLots * contractSize;
  const intervalMap: Record<string, string> = { "1m": "1", "5m": "5", "10m": "10", "15m": "15", "30m": "30", "1h": "60", "4h": "240", "1d": "D", "1w": "W", "1mo": "M" };

	return (
	  <main className={`terminal-shell ${lightTheme ? "light-theme" : ""} ${chartFullscreen ? "chart-fullscreen-active" : ""}`}>
    <aside className="icon-rail">
      <button className={`rail-icon ${mainSidebarOpen ? "rail-active" : ""}`} aria-label="Toggle main sidebar" onClick={() => setMainSidebarOpen((v) => !v)}><Menu size={17}/></button>
      <div className="rail-spacer"/>
      <button
        className={`rail-icon ${mainSidebarOpen && quickActionsOpen ? "rail-active" : ""}`}
        aria-label="Open Quick Actions"
        title="Quick Actions"
        onClick={() => {
          setMainSidebarOpen(true);
          setQuickActionsOpen((v) => !v);
          setNotice("");
        }}
      ><Zap size={17}/></button>
      {[BarChart3, Bot, LockKeyhole, Users, CalendarDays, Newspaper].map((Icon, i) =>
        <button
          key={i}
          className={`rail-icon ${i===0 ? "rail-active" : i===1 && aiAnalystOpen ? "rail-active" : i===2 && mainSidebarOpen && vipAreaOpen ? "rail-active" : i===3 && mainSidebarOpen && groupsOpen ? "rail-active" : i===4 && railPanel === "calendar" ? "rail-active" : i===5 && railPanel === "news" ? "rail-active" : ""}`}
          aria-label={i===1 ? "Open AI Market Analyst" : i===2 ? "Toggle VIP Area" : i===3 ? "Toggle Groups" : i===4 ? "Open Economic Calendar" : i===5 ? "Open News" : `Navigation ${i+2}`}
          title={i===1 ? "AI Market Analyst" : i===2 ? "VIP Area" : i===3 ? "Groups" : i===4 ? "Economic Calendar" : i===5 ? "News" : undefined}
          onClick={() => {
            if (i === 1) {
              setAiAnalystOpen(true);
              setRailPanel(null);
              setNotice("");
            } else if (i === 2) {
              setMainSidebarOpen(true);
              setVipAreaOpen((current) => !current);
              setNotice("");
            } else if (i === 3) {
              if (!mainSidebarOpen) {
                setMainSidebarOpen(true);
                setGroupsOpen(true);
              } else {
                setGroupsOpen((current) => !current);
              }
              setNotice("");
            } else if (i === 4) {
              setRailPanel((current) => current === "calendar" ? null : "calendar");
              setNotice("");
            } else if (i === 5) {
              setRailPanel((current) => current === "news" ? null : "news");
              setNotice("");
            } else {
              setNotice("This workspace module will be connected in a later integration step.");
            }
          }}
        ><Icon size={17}/></button>
      )}
      <div className="mobile-rail-timeframes" aria-label="Mobile chart timeframes">
        {["1m", "5m", "10m", "15m", "30m", "1h", "4h"].map((value) => (
          <button
            key={value}
            type="button"
            className={tf.toLowerCase() === value.toLowerCase() ? "chosen" : ""}
            aria-pressed={tf.toLowerCase() === value.toLowerCase()}
            onClick={() => setAllChartTimeframes(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <button className={`rail-icon ${toolManagerOpen ? "rail-active" : ""}`} aria-label="Toggle Tool Manager" title="Tool Manager" onClick={() => setToolManagerOpen((v) => !v)}><SlidersHorizontal size={17}/></button>
      <div className="rail-bottom"><button className="rail-icon" aria-label="Settings" title="Settings" onClick={() => { setSettingsNotice(""); setSettingsOpen(true); void checkExnessStatus(); }}><Settings size={17}/></button><button className="rail-icon" aria-label={lightTheme ? "Switch to dark theme" : "Switch to light theme"} title={lightTheme ? "Switch to dark theme" : "Switch to light theme"} onClick={() => setLightTheme(v => !v)}>{lightTheme ? <Moon size={17}/> : <Sun size={17}/>}</button></div>
    </aside>

    {mainSidebarOpen && <aside className="main-sidebar">
      <div className="main-sidebar-header">
        <div className="main-sidebar-brand"><h2>Edge Terminal</h2><p>Built for the trading community!</p></div>
        <button className="main-sidebar-toggle" aria-label="Open Tool Manager" title="Tool Manager" onClick={() => setToolManagerOpen(true)}><Menu size={20}/></button>
      </div>
      <div className="main-sidebar-scroll">
        <label className="sidebar-search"><Search size={17}/><input value={sidebarSearch} onChange={e=>setSidebarSearch(e.target.value)} placeholder="Search messages and channels..."/></label>
        <button className="quick-actions-toggle" onClick={() => setQuickActionsOpen(v=>!v)}><span><Zap size={18}/> Quick Actions</span><ChevronDown size={17} className={quickActionsOpen?"":"rotated"}/></button>
        {quickActionsOpen && <nav className="community-links quick-actions-links">
          <button onClick={()=>setFaqOpen(true)}><BookOpen size={18}/> FAQs</button>
          <button onClick={()=>{setSupportFeedback("");setSupportFormOpen(true);}}><MessageCircle size={18}/> Support & Feedback</button>
          <button onClick={()=>setInstallAppOpen(true)}><Download size={18}/> Install App</button>
          <button onClick={()=>setDocumentationOpen(true)}><BookOpen size={18}/> Documentation</button>
          <button onClick={()=>{setFeatureSuggestionsOpen(true);setActiveChat(null);setWorkspaceEmpty(false);}}><Lightbulb size={18}/> Feature Suggestions</button>
        </nav>}
{auth?.currentUser?.email &&
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .includes((auth?.currentUser?.email || "").toLowerCase()) && (
      <button
        className="community-admin-link"
        onClick={() => setAdminOpen(true)}
      >
        <ShieldCheck size={18} /> Admin User Management
      </button>
    )}
		<button className="sidebar-logout" onClick={() => window.dispatchEvent(new Event("edge-terminal-sign-out"))}><LogOut size={18}/> Log Out</button>
        <button className="sidebar-app-card" onClick={() => { setFeatureSuggestionsOpen(false); setActiveChat(null); setWorkspaceEmpty(false); setExpanded(null); }} aria-label="Return to Edge Terminal dashboard">
          <span className="app-card-icon"><BarChart3 size={23}/></span><div><b>Edge Terminal</b><p><span className="live-pill">● PREVIEW</span> Market Terminal</p></div><Activity size={19} className="app-pulse"/>
        </button>
        <button className="sidebar-promo ai-promo" onClick={()=>setAiAnalystOpen(true)}><span className="promo-icon"><Bot size={18}/></span><b>AI Market Analyst</b><small>♛ VIP</small></button>
        <button
          type="button"
          className={`sidebar-promo vip-promo ${vipAreaOpen ? "promo-expanded" : ""}`}
          aria-expanded={vipAreaOpen}
          aria-controls="vip-area-submenu"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setVipAreaOpen((isOpen) => !isOpen);
          }}
        >
          <span><LockKeyhole size={18}/> VIP Area</span>
          <ChevronDown size={20} className={vipAreaOpen ? "" : "promo-chevron-closed"}/>
        </button>
        {vipAreaOpen && <div id="vip-area-submenu" className="sidebar-submenu vip-submenu">
          {vipAccess ? <>
            <button className={`sidebar-submenu-item ${activeChat?.key === "vip-lounge" ? "selected" : ""}`} onClick={()=>{setFeatureSuggestionsOpen(false);setWorkspaceEmpty(false);setActiveChat({key:"vip-lounge",title:"VIP Lounge",subtitle:"Private VIP member discussion",emoji:"📉"});}}><span className="submenu-emoji-icon">📉</span><span><b>VIP Lounge</b><small>VIP members & admins</small></span></button>
            <button className={`sidebar-submenu-item ${activeChat?.key === "important-vip" ? "selected" : ""}`} onClick={()=>{setFeatureSuggestionsOpen(false);setWorkspaceEmpty(false);setActiveChat({key:"important-vip",title:"Important VIP",subtitle:"Private important VIP discussion",emoji:"🔥"});}}><span className="submenu-emoji-icon">🔥</span><span><b>Important VIP</b><small>VIP members & admins</small></span></button>
          </> : <div className="vip-access-notice"><LockKeyhole size={15}/><span><b>VIP access required</b><small>{accessChecked ? "This area is only for VIP members and admins." : "Verifying membership…"}</small></span></div>}
        </div>}
        <button className={`sidebar-promo groups-promo ${groupsOpen ? "promo-expanded" : ""}`} aria-expanded={groupsOpen} onClick={()=>setGroupsOpen(v=>!v)}><span><Users size={18}/> Groups</span><ChevronDown size={20} className={groupsOpen ? "" : "promo-chevron-closed"}/></button>
        {groupsOpen && <div className="sidebar-submenu groups-submenu">
          <button className={`sidebar-submenu-item ${activeChat?.key === "general-silver" ? "selected" : ""}`} onClick={()=>{setFeatureSuggestionsOpen(false);setWorkspaceEmpty(false);setActiveChat({key:"general-silver",title:"General Silver",subtitle:"General Silver Discussion",emoji:"🥈"});}}><span className="submenu-emoji-icon silver-medal">🥈</span><span><b>General Silver</b><small>General Silver Discussion</small></span></button>
          <button className={`sidebar-submenu-item ${activeChat?.key === "general-gold" ? "selected" : ""}`} onClick={()=>{setFeatureSuggestionsOpen(false);setWorkspaceEmpty(false);setActiveChat({key:"general-gold",title:"General Gold",subtitle:"General Gold Discussion",emoji:"🥇"});}}><span className="submenu-emoji-icon gold-medal">🥇</span><span><b>General Gold</b><small>General Gold Discussion</small></span></button>
        </div>}
        <div className="dm-heading">DIRECT MESSAGES</div>
        <button className={`dm-row ${activeChat?.key === "support" ? "selected" : ""}`} onClick={()=>{setFeatureSuggestionsOpen(false);setWorkspaceEmpty(false);setActiveChat({key:"support",title:"Support",subtitle:"Private support conversation",emoji:"🛟"});}}><span className="dm-avatar support-avatar">S</span><span><b>Support</b><small>Private · visible to you and admins</small></span></button>
        <button className={`dm-row ${activeChat?.key === "private-notes" ? "selected" : ""}`} onClick={()=>{setFeatureSuggestionsOpen(false);setWorkspaceEmpty(false);setActiveChat({key:"private-notes",title:"Private Notes",subtitle:"Personal notes",emoji:"📝"});}}><span className="dm-avatar notes-avatar">{(displayName.trim()[0] || username?.[0] || "U").toUpperCase()}</span><span><b>Message yourself</b><small>Private notes · only you</small></span></button>
        {auth?.currentUser?.email && (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "").split(",").map(email=>email.trim().toLowerCase()).includes((auth?.currentUser?.email || "").toLowerCase()) && <button className={`dm-row admin-support-row ${activeChat?.key === "support-admin" ? "selected" : ""}`} onClick={()=>{setFeatureSuggestionsOpen(false);setWorkspaceEmpty(false);setActiveChat({key:"support-admin",title:"Support Inbox",subtitle:"Admin-only support tickets",emoji:"🛡️"});}}><span className="dm-avatar admin-avatar">A</span><span><b>Support Inbox</b><small>Admin only · private tickets</small></span></button>}
      </div>
      <div className="main-sidebar-profile">
        <span className="profile-avatar">{avatarUrl ? <img src={avatarUrl} alt="" /> : (displayName.trim()[0] || "U").toUpperCase()}</span><div className="profile-copy"><b>{displayName || username || "Edge User"}</b><small>@{username || "member"}</small></div>
        <button aria-label={lightTheme ? "Switch to dark theme" : "Switch to light theme"} title={lightTheme ? "Switch to dark theme" : "Switch to light theme"} onClick={()=>setLightTheme(v=>!v)}>{lightTheme ? <Moon size={18}/> : <Sun size={18}/>}</button><button aria-label="Settings" title="Settings" onClick={()=>{setSettingsNotice("");setSettingsOpen(true);void checkExnessStatus();}}><Settings size={18}/></button>
        <div className="sidebar-legal"><span className="sidebar-built-by">Built for Edge Terminal</span><button type="button" onClick={() => setTermsOpen(true)}>Terms of Use &amp; Legal Disclosures</button></div>
      </div>
    </aside>}
    <section className="terminal-main">
      {!featureSuggestionsOpen && <><NewsTicker />

      <header className="terminal-toolbar">
        <div className="mini-brand"><span className="mini-logo"><Activity size={16}/></span><span>Real-time analysis & target zones.</span></div>
        <div className="toolbar-controls">
          <label className="active-broker-selector" style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700}}>
            <select aria-label="Active broker" value={activeBroker} onChange={event => { const next = event.target.value as MarketBroker; setActiveBroker(next); setActiveMarketBroker(next); window.location.reload(); }} style={{background:"var(--panel, #111827)",color:"inherit",border:"1px solid var(--border, #374151)",borderRadius:6,padding:"7px 9px"}}>
              <option value="ctrader">cTrader</option><option value="exness">Exness</option>
            </select>
          </label>
          <div className="gold-silver-switch">
            <button className={asset==="XAU/USD"?"chosen":""} onClick={()=>{setAsset("XAU/USD");setEntry(asset==="XAG/USD"?"53.828":"3995.38");setStop(asset==="XAG/USD"?"53.328":"3985.38")}}>◆ XAU/USD</button>
            <button className={asset==="XAG/USD"?"chosen":""} onClick={()=>{setAsset("XAG/USD");setEntry("53.828");setStop("53.328")}}>◆ XAG/USD</button>
          </div>
          <div className="compact-timeframes">{[["1m","1m"],["5m","5m"],["10m","10m"],["15m","15m"],["30m","30m"],["1h","1h"],["4h","4h"],["1d","1d"],["1w","1w"],["1mo","1M"]].map(([value,label])=><button key={value} className={tf.toLowerCase()===value.toLowerCase()?"chosen":""} onClick={()=>setTf(value)}>{label}</button>)}</div>
        </div>
        <div className={`toolbar-current-price ${toolbarQuote?.changePercent == null ? "price-no-change" : toolbarQuote.changePercent >= 0 ? "price-up" : "price-down"}`} title={toolbarQuote ? `Source: ${toolbarQuote.source}${toolbarQuote.updatedAt ? ` · Updated ${new Date(toolbarQuote.updatedAt).toLocaleTimeString()}` : ""}` : "Waiting for market quote"} aria-live="polite">
          <strong>{toolbarQuote?.price != null ? toolbarQuote.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 }) : "—"}</strong>
          {toolbarQuote?.changePercent != null && <span className="toolbar-price-change">{toolbarQuote.changePercent > 0 ? "▲" : toolbarQuote.changePercent < 0 ? "▼" : "•"} {Math.abs(toolbarQuote.changePercent).toFixed(2)}%</span>}
          {activeBroker === "ctrader" && ctraderConnected === false ? (
            <button className="toolbar-connect-ctrader" onClick={connectCTrader} disabled={!ctraderConfigured} title={ctraderConfigured ? "Connect your cTrader account" : "cTrader connection is not configured by the administrator"}>
              {ctraderConfigured ? "CONNECT" : "NOT CONFIGURED"}
            </button>
          ) : (
            <span className={`toolbar-price-status ${toolbarQuote && toolbarQuote.status === "live" ? "" : "is-delayed"}`}>
              {toolbarQuote ? (toolbarQuote.status === "live" ? toolbarQuote.source : toolbarQuote.status === "closed" ? "LAST CLOSE" : "DELAYED") : (ctraderConnected === null && activeBroker === "ctrader" ? "CHECKING" : toolbarQuoteError ? "UNAVAILABLE" : "LOADING")}
            </span>
          )}
        </div>
        <div className="toolbar-right"><button className="pill-btn" onClick={()=>window.open("https://discord.gg/Sda9EvjnwQ","_blank","noopener,noreferrer")}>↗ Join Telegram</button><button className="pill-btn purple" onClick={()=>setAiAnalystOpen(true)}>✦ AI Analyst</button><button className="round-btn" aria-label={lightTheme ? "Switch to dark theme" : "Switch to light theme"} onClick={()=>setLightTheme(v=>!v)}>{lightTheme ? <Moon size={16}/> : <Sun size={16}/>}</button><button className="round-btn" aria-label="Close current workspace" title="Close current workspace" onClick={()=>{setActiveChat(null);setWorkspaceEmpty(true);setAiAnalystOpen(false);setSettingsOpen(false);setChartFullscreen(false);}}><X size={16}/></button></div>
      </header></>}

      <div className={`terminal-content ${activeChat ? "chat-terminal-content" : ""} ${featureSuggestionsOpen ? "feature-suggestions-terminal-content" : ""}`}>
        {featureSuggestionsOpen ? <FeatureSuggestions onBack={() => setFeatureSuggestionsOpen(false)} /> : workspaceEmpty ? <div className="empty-workspace"><div className="empty-workspace-icon"><MessageCircle size={28}/></div><p>No conversation selected</p></div> : activeChat?.key === "private-notes" ? <PrivateInbox key={activeChat.key} mode="notes" title={activeChat.title}/> : activeChat?.key === "support" ? <PrivateInbox key={activeChat.key} mode="support" title={activeChat.title}/> : activeChat?.key === "support-admin" ? <PrivateInbox key={activeChat.key} mode="admin" title={activeChat.title}/> : activeChat ? <GroupChat key={activeChat.key} groupKey={activeChat.key} title={activeChat.title} subtitle={activeChat.subtitle} emoji={activeChat.emoji} /> : <>
{isForexWeekend(sessionNow) && <div className="market-closed">FOREX MARKET CLOSED FOR WEEKEND <span>|</span> Trading normally resumes Sunday at 17:00 New York time</div>}

        <div className="session-grid">
          {FX_SESSIONS.map(session => { const info = sessionDisplay(sessionNow, session); return <div className="session-tile" key={session.city}><div className="clock-face"><Clock3 size={21}/></div><div className="session-text"><b>{session.city} <small>{info.state}</small></b><span>{info.clock} <em>{info.action} {session.closeHour.toString().padStart(2,"0")}:00 / {session.openHour.toString().padStart(2,"0")}:00 local</em></span><a>{info.action} {info.countdown}</a></div></div>; })}
        </div>

        <section className="advanced-panel" id="trading-chart-section">
          <div className="panel-title"><h1>Advanced Trading Chart</h1><span>⌃</span></div>
          <div className="chart-mode-row"><div className="mode-switch"><button className={chartMode==="chart"?"mode-selected":""} onClick={()=>setChartMode("chart")}>▥ Chart</button>{positionPanelEnabled && <button className={chartMode==="position"?"mode-selected":""} onClick={()=>setChartMode("position")}>▣ Position</button>}<button className={chartMode==="risk"?"mode-selected":""} onClick={()=>setChartMode("risk")}>▤ Risk Calc</button><button className={chartMode==="combined"?"mode-selected":""} onClick={()=>setChartMode("combined")}>▰ Combined</button></div><div className="mode-tools">{chartMode!=="risk" && <div className="chart-layout-picker"><button type="button" className={`tool-button layout-trigger ${chartLayoutOpen?"tool-active":""}`} aria-label="Choose chart layout" aria-expanded={chartLayoutOpen} title="Choose chart layout" onClick={()=>setChartLayoutOpen(v=>!v)}><LayoutGrid size={13}/></button>{chartLayoutOpen && <div className="chart-layout-menu" role="dialog" aria-label="Choose chart layout"><div className="layout-menu-heading">Chart layout <span>{chartLayoutCount} {chartLayoutCount===1?"chart":"charts"}</span></div><div className="layout-options">{[1,2,3,4,6,8,9,12,16].map(count=><button type="button" key={count} className={chartLayoutCount===count?"selected":""} aria-label={`${count} chart layout`} title={`${count} charts`} onClick={()=>{setChartLayoutCount(count);setChartLayoutOpen(false);}}><span className={`layout-preview layout-preview-${count}`}>{Array.from({length:count},(_,i)=><i key={i}/>)}</span><small>{count}</small></button>)}</div></div>}</div>}<div className="small-timeframes">{[["1m","1m"],["5m","5m"],["15m","15m"],["1h","1h"],["4h","4h"],["1d","1d"],["1w","1w"],["1mo","1M"]].map(([value,label])=><button key={value} className={tf.toLowerCase()===value.toLowerCase()?"chosen":""} onClick={()=>setAllChartTimeframes(value)}>{label}</button>)}</div>{chartMode!=="risk" && <button type="button" aria-pressed={toolsVisible} title={toolsVisible ? "Hide left drawing tools" : "Show left drawing tools"} className={`tool-button ${toolsVisible?"tool-active":""}`} onClick={()=>setToolsVisible(v=>!v)}>♧ Tools</button>}<button className="tool-button" onClick={()=>setChartFullscreen(v=>!v)}>⛶ {chartFullscreen?"Close Fullscreen":"Fullscreen"}</button></div></div>

          <div className={`chart-risk-grid mode-${chartMode}`}>
            <div className={`chart-layout-grid chart-layout-count-${chartLayoutCount}`}>
              {Array.from({length: chartLayoutCount}, (_, index) => <div className="chart-frame" key={`${chartLayoutCount}-${index}`}>
                <div className="chart-symbolbar"><b>⌕ {asset==="XAU/USD"?"XAUUSD":"XAGUSD"}</b><span>＋</span><div className="chart-quick-tf" aria-label={`Timeframe for chart ${index+1}`}>{[["1m","1m"],["5m","5m"],["15m","15m"],["30m","30m"],["1h","1h"],["4h","4h"],["1d","1d"],["1w","1w"],["1mo","1M"]].map(([value,label])=><button type="button" key={value} aria-pressed={(chartTimeframes[index] || "15m").toLowerCase()===value.toLowerCase()} className={(chartTimeframes[index] || "15m").toLowerCase()===value.toLowerCase()?"chosen":""} onClick={()=>setChartTimeframe(index,value)}>{label}</button>)}</div><span className="chart-label">{chartLayoutCount>1?`Chart ${index+1}`:"TradingView chart"} · {chartTimeframes[index] || "15m"}</span></div>
                <div className="chart-embed"><TradingViewChart symbol={asset==="XAU/USD"?"OANDA:XAUUSD":"OANDA:XAGUSD"} interval={intervalMap[chartTimeframes[index] || "15m"] || "15"} showTools={toolsVisible}/></div>
              </div>)}
            </div>

            {chartMode === "position" && positionPanelEnabled && <aside className="risk-panel risk-trading-sidebar"><LiveTradingPanel symbol={asset} entry={entry} stop={stop} capital={capital} risk={risk} lots={positionLots} /></aside>}
            {(chartMode === "risk" || chartMode === "combined") && (            <aside className="risk-panel risk-calculator-sidebar">
              <div className="risk-heading"><div className="risk-icon"><Calculator size={18}/></div><div><h2>Risk & Position Size</h2><p>Capital Protection & Lot Sizing</p></div><button onClick={()=>{setCapital("10000");setRisk("1");setEntry("3995.38");setStop("3985.38")}}>↻</button></div>
              <div className="risk-market"><b>{asset}</b><span>{contractSize.toLocaleString("en-US")} oz/lot</span><strong>↗ BUY / LONG</strong></div>
              <label className="risk-label">＄ Account Balance ($)<input value={capital} onChange={e=>setCapital(e.target.value)} inputMode="decimal"/></label>
              <label className="risk-label">％ Risk Percentage (%) <b>${riskDollars.toFixed(2)}</b><input value={risk} onChange={e=>setRisk(e.target.value)} inputMode="decimal"/></label>
              <div className="risk-presets">{["0.5","1","1.5","2","3"].map(v=><button key={v} className={risk===v?"chosen":""} onClick={()=>setRisk(v)}>{v}%</button>)}</div>
              <div className="price-fields"><label>Entry Price<input value={entry} onChange={e=>setEntry(e.target.value)} inputMode="decimal"/></label><label>Stop Loss Price<input value={stop} onChange={e=>setStop(e.target.value)} inputMode="decimal"/></label></div>
              <div className="stop-distance">Stop Distance: <b>${stopDistance.toFixed(2)} ({Number(entry)?(stopDistance/Number(entry)*100).toFixed(2):"0.00"}%)</b></div>
              <div className="risk-result-grid"><div className="risk-total"><small>TOTAL RISK ($)</small><b>${riskDollars.toFixed(2)}</b><span>{risk}% of balance</span></div><div className="risk-size"><small>POSITION SIZE</small><b>{positionLots.toFixed(2)} <small>Lots</small></b><span>{positionUnits.toFixed(1)} oz units</span></div></div>
              <div className="risk-extra"><span>Position value estimate</span><b>${(positionUnits*(Number(entry)||0)).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</b><span>Stop-distance sizing only</span></div>
              <p className="risk-disclaimer">*Illustrative calculation. Actual lot sizing depends on contract specifications, tick value, broker rules, spread and fees.</p>
            </aside>)}

          </div>
        </section>


        <div className={`dashboard-orderflow-section ${orderFlowOpen ? "is-open" : ""}`} id="order-flow-footprint">
            <button
              type="button"
              className="dashboard-orderflow-toggle"
              aria-expanded={orderFlowOpen}
              aria-controls="dashboard-orderflow-content"
              onClick={() => setOrderFlowOpen(open => !open)}
            >
              <span className="dashboard-orderflow-title">
                <span>Order Flow Footprint</span>
                <span className="dashboard-orderflow-tier-badges">
                  <small className="tier-tag"><LockKeyhole size={9}/> PRO</small>
                  <small className="tier-tag vip"><Crown size={9}/> VIP</small>
                </span>
              </span>
              <ChevronDown size={17} className={`dashboard-orderflow-chevron ${orderFlowOpen ? "rotated" : ""}`} />
            </button>
            {orderFlowOpen && (
              <div id="dashboard-orderflow-content" className="dashboard-orderflow-content">
                <FeatureGate title="Order Flow Footprint">
                  <OrderFlowFootprint
                    asset={asset}
                    interval={tf === "1m" ? "1min" : tf === "5m" ? "5min" : tf === "15m" ? "15min" : tf === "30m" ? "30min" : tf === "1h" ? "1h" : tf === "4h" ? "4h" : tf === "1d" ? "1d" : tf === "1w" ? "1w" : tf === "1mo" ? "1mo" : "15min"}
                  />
                </FeatureGate>
              </div>
            )}
          </div>

        {modules.length > 0 && <section className="feature-accordions">
          {modules.filter(({title}) => visibleModules.includes(title)).map(({title,sub,tier,icon:Icon}, index)=>{
            const featureRule = dashboardFeatureRules.find(rule => rule.title === title);
            const configuredTier = featureRule?.tier || "FREE";
            const showProBadge = featureRule?.enabled !== false && configuredTier === "PRO";
            const showVipBadge = featureRule?.enabled !== false && (configuredTier === "VIP" || configuredTier === "PRO");
            const showNewBadge = tier === "NEW";
            return <div className={`feature-accordion ${expanded===title?"expanded":""}`} key={title} id={`module-${index}`}><button className="accordion-trigger" onClick={()=>setExpanded(expanded===title?null:title)}><span className="accordion-name">{title}{(showProBadge || (featureRule?.enabled !== false && configuredTier === "VIP")) && <span className="tier-badge-group">{showProBadge && <small className="tier-tag"><LockKeyhole size={9}/> PRO</small>}{showVipBadge && <small className="tier-tag vip"><Crown size={9}/> VIP</small>}</span>}{showNewBadge && <small className="tier-tag new">NEW</small>}</span><ChevronDown size={16}/></button>{expanded === title && (
              title === "Order Flow Footprint" ? (
                <div className="accordion-body order-flow-accordion-body">
                  <FeatureGate title="Order Flow Footprint"><OrderFlowFootprint asset={asset} interval={tf === "1m" ? "1min" : tf === "5m" ? "5min" : tf === "15m" ? "15min" : tf === "30m" ? "30min" : tf === "1h" ? "1h" : tf === "4h" ? "4h" : tf === "1d" ? "1d" : tf === "1w" ? "1w" : tf === "1mo" ? "1mo" : "15min"} /></FeatureGate>
                  <OrderFlowMarketReplay />
                </div>
              ) : title === "Volume Profile & Footprint Analysis" ? (
                <div className="accordion-body volume-profile-accordion-body">
                  <FeatureGate title="Volume Profile & Footprint Analysis"><VolumeProfileAnalysis asset={asset} interval={tf} theme={lightTheme ? "light" : "dark"} /></FeatureGate>
                </div>
              ) : title === "Integrated Trade Journal & Analytics" ? (
                <FeatureGate title="Integrated Trade Journal & Analytics"><TradeJournal asset={asset} interval={tf} /></FeatureGate>
              ) : title === "Intermarket Correlation Matrix" ? (
                <div className="accordion-body intermarket-accordion-body">
                  <FeatureGate title="Intermarket Correlation Matrix"><IntermarketCorrelation /></FeatureGate>
                </div>
              ) : title === "Master Confluence & Probability Engine" ? (
                <div className="accordion-body mce-accordion-body">
                  <FeatureGate title="Master Confluence & Probability Engine"><MasterConfluenceEngine asset={asset} interval={tf} /></FeatureGate>
                </div>
              ) : title === "Master Scorecard & Key Levels" ? (
                <div className="accordion-body msc-accordion-body">
                  <FeatureGate title="Master Scorecard & Key Levels"><MasterScorecard asset={asset} interval={tf} theme={lightTheme ? "light" : "dark"} /></FeatureGate>
                </div>
              ) : title === "COT Institutional Sentiment" ? (
                <div className="accordion-body cot-accordion-body">
                  <FeatureGate title="COT Institutional Sentiment"><CotSentimentWidgets asset={asset} theme={lightTheme ? "light" : "dark"} /></FeatureGate>
                </div>
              ) : title === "Institutional Liquidity & Book Depth Map" ? (
                <div className="accordion-body liquidity-map-accordion-body" style={{ display: "block", width: "100%", minWidth: 0 }}>
                  <FeatureGate title="Institutional Liquidity & Book Depth Map"><InstitutionalLiquidityMap asset={asset} interval={tf} theme={lightTheme ? "light" : "dark"} /></FeatureGate>
                </div>
              ) : title === "Institutional Liquidity Heatmap" ? (
                <div className="accordion-body liquidity-heatmap-accordion-body" style={{ display: "block", width: "100%", minWidth: 0 }}>
                  <FeatureGate title="Institutional Liquidity Heatmap"><InstitutionalLiquidityHeatmap asset={asset} interval={tf} theme={lightTheme ? "light" : "dark"} /></FeatureGate>
                </div>
              ) : title === "Volumetric Delta & VWAP Bands" ? (
                <div className="accordion-body volumetric-accordion-body">
                  <FeatureGate title="Volumetric Delta & VWAP Bands"><VolumetricVwap asset={asset} interval={tf} theme={lightTheme ? "light" : "dark"} /></FeatureGate>
                </div>
              ) : title === "Monetary Policy Watch & Macro Events" ? (
                <div className="accordion-body macro-calendar-body" style={{ display: "block", width: "100%", minWidth: 0, overflow: "hidden" }}>
                  <div className="macro-calendar-header" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                    <div className="accordion-icon"><CalendarDays size={20} /></div>
                    <div>
                      <b>Economic Calendar</b>
                      <p>Monitor upcoming economic releases and central-bank events.</p>
                    </div>
                  </div>
                  <FeatureGate title="Monetary Policy Watch & Macro Events"><EconomicCalendar /></FeatureGate>
                </div>
              ) : (
                <div className="accordion-body">
                  <div className="accordion-icon"><Icon size={20} /></div>
                  <div>
                    <b>{title}</b>
                    <p>{sub}. This module is part of the Edge Terminal roadmap. Live functionality will be enabled only after the relevant data source and calculations have been implemented.</p>
                    <button onClick={() => setNotice(`${title}: module requirements saved for the next implementation phase.`)}>Explore module <ChevronRight size={14} /></button>
                  </div>
                </div>
              )
            )}</div>;
          })}
        </section>}
        <footer className="terminal-footer"><span>EDGE TERMINAL</span><span>Market research tools · Not investment advice</span><span>Preview build 0.3</span></footer>
        </>}
      </div>
    </section>
    {toolManagerOpen && <div className="tool-manager-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setToolManagerOpen(false); }}>
      <aside className="tool-manager-drawer" role="dialog" aria-modal="true" aria-label="Tool Manager">
        <div className="tool-manager-header">
          <div><span className="manager-symbol"><Settings size={17}/></span><h2>Tool Manager</h2></div>
          <button aria-label="Close tool manager" onClick={() => setToolManagerOpen(false)}><X size={19}/></button>
        </div>
        <p className="tool-manager-description">Select which modules to display on your dashboard.</p>
        <div className="tool-manager-list">
          <div className="tool-manager-item">
            <label className="manager-check-row">
              <input type="checkbox" checked={true} readOnly />
              <span className="manager-item-icon"><Activity size={17}/></span>
              <span className="manager-item-copy"><b>Trading Chart</b><small>Interactive Technical Chart</small></span>
            </label>
            <button className="jump-button" onClick={() => { setToolManagerOpen(false); document.getElementById("trading-chart-section")?.scrollIntoView({behavior:"smooth",block:"start"}); }}>Jump</button>
          </div>
          {modules.map(({title,sub,icon:Icon}, index) => {
            const checked = visibleModules.includes(title);
            return <div className="tool-manager-item" key={title}>
              <label className="manager-check-row">
                <input type="checkbox" checked={checked} onChange={() => setVisibleModules((old) => checked ? old.filter((x) => x !== title) : [...old, title])} />
                <span className="manager-item-icon"><Icon size={17}/></span>
                <span className="manager-item-copy"><b>{title}</b><small>{sub}</small></span>
              </label>
              <button className="jump-button" disabled={!checked} onClick={() => { setToolManagerOpen(false); setTimeout(() => { const el = document.getElementById(`module-${index}`); el?.scrollIntoView({behavior:"smooth",block:"start"}); setExpanded(title); }, 120); }}>Jump</button>
            </div>;
          })}
        </div>
        <div className="tool-manager-footer">EDGE TERMINAL · TOOL MANAGER</div>
      </aside>
    </div>}
    {railPanel && <div className="rail-content-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setRailPanel(null); }}>
      <section className="rail-content-drawer" role="dialog" aria-modal="true" aria-label={railPanel === "calendar" ? "Economic Calendar" : "Edge Terminal News"}>
        <header className="rail-content-header">
          <div className="rail-content-heading">
            <span className="rail-content-icon">{railPanel === "calendar" ? <CalendarDays size={21}/> : <Newspaper size={21}/>}</span>
            <div><h2>{railPanel === "calendar" ? "Economic Calendar" : "Edge Terminal News"}</h2><p>{railPanel === "calendar" ? "Upcoming economic releases and central-bank events" : "Market headlines and updates"}</p></div>
          </div>
          <button aria-label="Close panel" onClick={() => setRailPanel(null)}><X size={20}/></button>
        </header>
        <div className="rail-content-body">
          {railPanel === "calendar" ? <EconomicCalendar /> : <NewsCenter />}
        </div>
      </section>
    </div>}
    {aiAnalystOpen && <div className="ai-analyst-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setAiAnalystOpen(false);}}>
      <section className="ai-analyst-drawer" role="dialog" aria-modal="true" aria-label="Edge Terminal AI Market Analyst">
        <header className="ai-analyst-topbar">
          <div className="ai-analyst-brand"><span className="ai-robot">🤖</span><h2>AI Market Analyst</h2><span className="ai-vip-pill"><Crown size={14}/> VIP</span></div>
          <div className="ai-analyst-actions"><button className="ai-guide-toggle" onClick={()=>setAiGuideVisible(v=>!v)}><BookOpen size={17}/>{aiGuideVisible?"Hide Guide":"How It Works"}</button><button className="ai-close-button" onClick={()=>setAiAnalystOpen(false)}><X size={19}/> Close</button></div>
        </header>
        <div className="ai-analyst-scroll">
          {aiGuideVisible && <section className="ai-guide-card">
            <div className="ai-guide-heading"><h3><BookOpen size={18}/> AI Orderflow Analyst — Guide &amp; Architecture</h3><button onClick={()=>setAiGuideVisible(false)}>Close Guide</button></div>
            <nav className="ai-guide-tabs">{["1. How to Use","2. Setup Card","3. Data Pulled","4. Playbooks"].map((label,i)=><button key={label} className={aiGuideTab===i?"active":""} onClick={()=>setAiGuideTab(i)}>{label}</button>)}</nav>
            <div className="ai-guide-content">
              {aiGuideTab===0 && <><article><b>1&nbsp; Real-Time Market Context</b><p>Choose your symbol and timeframe, then run a scan or ask a custom question. The model only receives the market context included in the request; this screen does not automatically read private TradingView chart candles.</p></article><article><b>2&nbsp; Choose a playbook</b><p>Use the six institutional-style scans as structured prompts to examine possible long/short conditions, imbalance concepts, liquidity sweeps, delta traps, and session levels.</p></article><article><b>3&nbsp; Validate before acting</b><p>Review assumptions, alternate scenarios, and invalidation conditions. Confirm any price levels against your live chart before making decisions.</p></article></>}
              {aiGuideTab===1 && <><article className="setup-blue"><b>Bias &amp; conviction</b><p>The response may describe bullish, bearish, or neutral conditions. Conviction is qualitative unless supported by actual measurable data; it is not a probability guarantee.</p></article><article className="setup-entry"><b>Entry trigger zone</b><p>Use only levels you provide or that are explicitly returned by a verified data source. Do not treat illustrative levels as live prices.</p></article><article className="setup-stop"><b>Invalidation / stop loss</b><p>Define what market behavior would disprove the scenario. Position size and risk limits remain your responsibility.</p></article><article className="setup-target"><b>Targets &amp; risk/reward</b><p>Targets are scenario planning ideas, not guaranteed outcomes. Verify reward-to-risk using current market prices and execution costs.</p></article></>}
              {aiGuideTab===2 && <><p>Analysis can use the instrument, timeframe, and question selected here. No verified live footprint feed is connected by this interface alone.</p>{["Instrument and timeframe selected by you","Your custom question or chosen scan prompt","Context you explicitly provide in the prompt","Gemini's generated interpretation of that supplied context"].map((x,i)=><article key={x}><b>{String(i+1).padStart(2,"0")} &nbsp;{x}</b><p>{i===0?"Used to frame the analysis request.":i===1?"Defines the specific market question or playbook to discuss.":i===2?"May include candles, volume, delta, POC, VAH/VAL, or screenshots if you provide them.":"AI-generated text is not independently verified market telemetry."}</p></article>)}</>}
              {aiGuideTab===3 && <>{[{n:"🟢 Long Entries",t:"Look for evidence of seller exhaustion, bullish divergence, and support holding; require chart confirmation."},{n:"🔴 Short Entries",t:"Look for buyer exhaustion, bearish divergence, and resistance rejection; require chart confirmation."},{n:"⚡ Key Imbalances",t:"Review supplied bid/ask imbalance data. Do not infer a numeric imbalance without the ladder data."},{n:"🌊 Liquidity Sweep",t:"Assess whether a move beyond a swing level was rejected or accepted, using supplied price context."},{n:"🔶 Delta Trap Check",t:"Compare supplied delta with candle close and follow-through; delta cannot be inferred from price alone."},{n:"🎯 Session Key Levels",t:"Map supplied session high/low, POC, VAH, VAL, and other verified levels."}].map(x=><article key={x.n}><b>{x.n}</b><p>{x.t}</p></article>)}</>}
            </div>
          </section>}
          <section className="ai-market-controls"><div className="ai-live-row"><span className="ai-live-pill"><i/> ANALYSIS WORKSPACE</span><label>Instrument<select value={aiSymbol} onChange={e=>setAiSymbol(e.target.value)}><option>XAU/USD</option><option>XAG/USD</option><option>EUR/USD</option><option>GBP/USD</option><option>US100</option><option>SPX</option><option>DXY</option></select></label><label>Timeframe<select value={aiTimeframe} onChange={e=>setAiTimeframe(e.target.value)}>{["1m","5m","10m","15m","30m","1H","4H","1D"].map(t=><option key={t}>{t}</option>)}</select></label><label className="ai-refresh-toggle"><input type="checkbox" checked={aiAutoRefresh} onChange={e=>setAiAutoRefresh(e.target.checked)}/> Auto-refresh</label></div>
            {aiAutoRefresh && <p className="ai-note">Auto-refresh is a UI preference only in this build; it does not fetch verified market data or run scans automatically.</p>}
            <button className="ai-force-scan" onClick={()=>{setAiPrompt(`Analyze ${aiSymbol} on the ${aiTimeframe} timeframe. Provide conditional bullish and bearish scenarios, evidence required to confirm each, key levels only if supplied, invalidation conditions, and risk considerations. Clearly state that no verified live footprint telemetry is attached to this request.`);setAiLastAction("Full analysis requested");setTimeout(()=>document.getElementById("ai-custom-question")?.focus(),0);}}><Sparkles size={19}/> Prepare Full Market Analysis</button>
          </section>
          <section className="ai-quickscan-section"><h3>Institutional Quick Scans</h3><div className="ai-quickscan-grid">{[{icon:"🟢",title:"Long",sub:"Entries",prompt:"Assess a potential LONG setup: seller exhaustion, bullish divergence, support response, confirmation needed, invalidation, and risk. Do not invent live data."},{icon:"🔴",title:"Short",sub:"Entries",prompt:"Assess a potential SHORT setup: buyer absorption, bearish divergence, resistance rejection, confirmation needed, invalidation, and risk. Do not invent live data."},{icon:"⚡",title:"Key",sub:"Imbalances",prompt:"Explain how to evaluate key bid/ask imbalance stacks. State that actual ladder values are required and do not invent them."},{icon:"🌊",title:"Liquidity",sub:"Sweep Scan",prompt:"Evaluate a liquidity sweep framework: swing-level breach, rejection versus acceptance, confirmation, and invalidation. No live candles were attached."},{icon:"🔶",title:"Delta",sub:"Trap Check",prompt:"Explain a delta-trap check using delta and candle close. Clearly note that actual delta data is required and cannot be derived from price alone."},{icon:"🎯",title:"Session",sub:"Key Levels",prompt:"Build a session key-level checklist for POC, VAH, VAL, session high/low, and untested levels. Do not invent any prices."}].map(scan=><button key={scan.title} onClick={()=>{setAiPrompt(`For ${aiSymbol} ${aiTimeframe}: ${scan.prompt}`);setAiLastAction(`${scan.title} ${scan.sub} playbook selected`);}}><span>{scan.icon}</span><b>{scan.title}</b><small>{scan.sub}</small></button>)}</div><p className="ai-last-action">{aiLastAction}</p></section>
          <section className="ai-analysis-card"><div className="ai-analysis-card-heading"><h3>📊 INSTITUTIONAL MARKET BRIEFING</h3><button onClick={()=>{void navigator.clipboard?.writeText(aiReply || aiPrompt).then(()=>setAiLastAction("Analysis text copied"));}}><Copy size={15}/> Copy</button></div>
            <label className="ai-prompt-label" htmlFor="ai-custom-question">Custom market question / supplied telemetry</label><textarea id="ai-custom-question" value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder={`Ask about ${aiSymbol} ${aiTimeframe}, or paste verified chart context such as OHLC, volume, delta, POC, VAH/VAL…`}/>
            <button className="ai-run-analysis" onClick={runGeminiAnalysis} disabled={aiBusy}>{aiBusy?"Analyzing with Gemini…":"✦ Analyze with Gemini"}</button>
            {!geminiKey && <p className="ai-key-warning">No Gemini API key is saved in this browser. <button onClick={()=>{setAiAnalystOpen(false);setSettingsOpen(true);}}>Open Settings to configure BYOK</button></p>}
            {aiReply && <div className="ai-response-box"><div className="ai-response-label">GEMINI RESPONSE</div><pre>{aiReply}</pre></div>}
            <div className="ai-data-transparency"><details><summary>🔒 Edge Terminal Data Transparency (BYOK)</summary><p>Your Gemini key is stored in this browser's local storage and is sent directly to Google's Gemini API when you run analysis. This UI does not automatically connect to a live footprint feed. Only include market data you are comfortable sending to Google; never paste passwords or private account credentials.</p></details></div>
            <p className="ai-disclaimer">Educational market analysis only — not financial advice. Confirm prices and data in your trading platform. AI output may be inaccurate.</p>
          </section>
        </div>
      </section>
    </div>}
    {settingsOpen && <div className="settings-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setSettingsOpen(false);}}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="settings-modal-header"><h2>Settings</h2><button aria-label="Close settings" onClick={()=>setSettingsOpen(false)}><X size={24}/></button></header>
        <div className="settings-modal-body">
          <h3>PROFILE</h3>
          <div className="settings-avatar-row"><div className="settings-avatar">{avatarUrl ? <img src={avatarUrl} alt="Profile avatar"/> : (displayName.trim()[0] || "U").toUpperCase()}</div><label>Avatar URL<input value={avatarUrl} onChange={e=>setAvatarUrl(e.target.value)} placeholder="https://example.com/avatar.png"/></label></div>
          <label>Email<input value={auth?.currentUser?.email || ""} readOnly /></label>
          <label>Name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={60}/></label>
          <label>Username <span className="settings-muted">(How others see you)</span><input value={username} onChange={e=>setUsername(e.target.value.replace(/[^a-zA-Z0-9._-]/g,""))} maxLength={30}/></label>
          <label>Bio<textarea value={bio} onChange={e=>setBio(e.target.value)} placeholder="A short bio about yourself..." maxLength={300}/></label>
          <label>Status<select value={presence} onChange={e=>setPresence(e.target.value)}><option>Online</option><option>Away</option><option>Do not disturb</option><option>Offline</option></select></label>
          <button className="settings-primary" onClick={saveSettings}>Update Profile</button>
          <hr/>
          <h3 className="settings-blue-title">BROKER CONNECTIONS</h3>
          <p>Connect your own Exness API account. Credentials are sent only to Edge Terminal's server, encrypted before being stored against your signed-in user account, and never returned to the browser after saving.</p>
          <div className="broker-connection-card">
            <div className="broker-connection-heading"><b>Exness API</b><span className={exnessConnected ? "broker-connected" : "broker-disconnected"}>{exnessConnected ? "CONNECTED" : "NOT CONNECTED"}</span></div>
            <label>API key identifier<input value={exnessApiKey} onChange={e=>setExnessApiKey(e.target.value)} autoComplete="off" placeholder="exnsk-…"/></label>
            <label>Private signing key<input type="password" value={exnessPrivateKey} onChange={e=>setExnessPrivateKey(e.target.value)} autoComplete="new-password" placeholder="128-character hex key or Ed25519 PEM"/></label>
            <label>Trading account ID<input value={exnessAccountId} onChange={e=>setExnessAccountId(e.target.value.replace(/[^0-9]/g,""))} inputMode="numeric" placeholder="Your selected Exness account ID"/></label>
            <label>Gateway URL from Exness Key Management<input value={exnessGateway} onChange={e=>setExnessGateway(e.target.value)} placeholder="https://…"/></label>
            <p className="broker-hint">Use the Gateway URL shown in the Exness API Key Management DNS widget. Do not use a guessed host. Your API key must have account read access; trading scope is only needed for later order execution features.</p>
            <div className="broker-actions"><button type="button" disabled={exnessBusy} onClick={connectExness}>{exnessBusy ? "VERIFYING…" : "CONNECT EXNESS"}</button>{exnessConnected && <button type="button" className="broker-disconnect" disabled={exnessBusy} onClick={disconnectExness}>DISCONNECT</button>}</div>
            {exnessStatus && <div className="settings-feedback">{exnessStatus}</div>}
            <button type="button" className="broker-status-check" onClick={checkExnessStatus}>Refresh connection status</button>
          </div>
          <hr/>
          <h3 className="settings-blue-title">AI MARKET ANALYSIS (BYOK)</h3>
          <p>Use your own Gemini API key for AI analysis. The key is stored in this browser's local storage and is sent to Google when you run an analysis; it is not stored in Edge Terminal's database.</p>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Don't have a key? Get your Gemini API key here.</a>
          <div className="settings-key-row"><input type="password" value={geminiKey} onChange={e=>setGeminiKey(e.target.value)} placeholder="Paste your Gemini API key"/><button onClick={()=>{localStorage.setItem("edge-gemini-api-key",geminiKey.trim());setSettingsNotice("Gemini key saved in this browser.");}}>Save Key</button></div>
          <hr/>
          <h3>SUBSCRIPTION & MEMBERSHIP</h3><div className="settings-membership"><b>Current Status:</b><span>Free Plan</span><p>Subscription management will be available when billing is integrated.</p></div>
          <hr/><h3 className="settings-danger-title">DANGER ZONE</h3><div className="settings-danger"><b>Delete Account</b><p>Account deletion is not enabled in this development build. Contact the site administrator for account removal.</p></div>
          {settingsNotice && <div className="settings-feedback">{settingsNotice}</div>}
        </div>
      </section>
    </div>}
    {termsOpen && <div className="terms-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setTermsOpen(false);}}>
      <section className="terms-modal" role="dialog" aria-modal="true" aria-label="Terms of Service and Privacy Policy">
        <header className="terms-modal-header"><div className="terms-icon"><Scale size={26}/></div><button aria-label="Close terms" onClick={()=>setTermsOpen(false)}><X size={22}/></button><h2>Terms of Service &amp; Privacy Policy</h2><p>Effective Date: 2026 · Edge Terminal Platform</p></header>
        <div className="terms-modal-content">
          <h3>1. Acceptance of Terms</h3><p>By accessing or using Edge Terminal, its web application, community channels, and analytical services, you agree to these Terms of Service. If you do not agree, discontinue use of the platform.</p>
          <h3>2. Educational &amp; Data Services</h3><p>Charting tools, order-flow metrics, volume profiles, multi-timeframe scores, alerts, macroeconomic feeds, and indicators are for educational, informational, and analytical research purposes only. Nothing provided constitutes financial, legal, tax, or investment advice, or a recommendation to buy or sell any financial instrument.</p>
          <h3>3. High-Risk Financial Markets Warning</h3><p>Trading financial instruments—including Gold (XAU/USD), Silver (XAG/USD), Forex, futures, and options—carries substantial risk. Volatility and leverage can cause significant losses. Past performance and hypothetical results do not guarantee future outcomes. Never risk money you cannot afford to lose.</p>
          <h3>4. Limitation of Liability</h3><p>To the fullest extent permitted by law, Edge Terminal and its operators disclaim liability for losses arising from trading decisions, downtime, data inaccuracies, software latency, interruptions, or reliance on platform analytics. You remain responsible for your trading decisions and risk management. Nothing here limits liability where prohibited by law.</p>
          <h3>5. Community &amp; Chat Rules</h3><p>Users must act constructively and professionally. Spam, harassment, hate speech, abusive or defamatory conduct, unauthorized commercial promotion, affiliate-link farming, and signal selling are prohibited. Moderators may warn, mute, suspend, or terminate accounts for violations, subject to applicable law.</p>
          <h3>6. AI Data Processing &amp; API Key Security</h3><p>AI-powered analysis uses Google Gemini. Relevant market context, chart information, and order-flow data may be sent to Google for processing. API-key handling depends on the actual feature implementation. Do not enter confidential credentials into public chats or fields not designed to handle them securely.</p>
          <h3>7. Privacy Policy &amp; Data Protection</h3><p>Edge Terminal aims to collect only information reasonably necessary to operate the service, authenticate accounts, maintain security, and preserve preferences. Depending on your use, this may include account identifiers and technical information. Personal information is not sold to third-party advertising networks. Information may be processed when necessary to provide services, maintain security, comply with law, or protect rights.</p>
        </div>
        <footer className="terms-modal-footer"><button onClick={()=>setTermsOpen(false)}>Close</button></footer>
      </section>
    </div>}
    {adminOpen && <AdminUserManagement onClose={() => setAdminOpen(false)} />}
    {installAppOpen && <div className="install-app-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setInstallAppOpen(false);}}>
      <section className="install-app-modal" role="dialog" aria-modal="true" aria-label="Install App">
        <header className="install-app-header"><h2><Download size={25}/> Install App</h2><button aria-label="Close Install App" onClick={()=>setInstallAppOpen(false)}><X size={23}/></button></header>
        <div className="install-app-tabs"><button className={installPlatform === "ios" ? "active ios" : ""} onClick={()=>setInstallPlatform("ios")}><span className="install-tab-icon"></span> iOS (iPhone/iPad)</button><button className={installPlatform === "android" ? "active android" : ""} onClick={()=>setInstallPlatform("android")}><span className="install-tab-icon"><Download size={19}/></span> Android</button></div>
        {installPlatform === "ios" ? <div className="install-app-content"><p className="install-intro">Install this application directly on your iPhone or iPad for a full screen, native app experience without having to go through the App Store.</p><div className="install-step"><span>1</span><div><b>Open Safari Browser</b><p>Make sure you are viewing this page in <strong>Safari</strong>. Third-party browsers like Chrome for iOS may not support installing apps to the Home Screen.</p></div></div><div className="install-step"><span>2</span><div><b>Tap the Share Icon <span className="install-blue">↥</span></b><p>At the bottom edge of your screen, locate and tap the Share button (the square with an arrow pointing upward).</p></div></div><div className="install-step"><span>3</span><div><b>Select “Add to Home Screen” <span className="install-blue">⊞</span></b><p>Scroll down the sharing options until you find <strong>“Add to Home Screen”</strong> and tap it.</p></div></div><div className="install-step"><span>4</span><div><b>Confirm and Open</b><p>Tap <strong>Add</strong> in the top-right corner. The app will appear on your Home Screen.</p></div></div></div> : <div className="install-app-content"><p className="install-intro">Install this application directly on your Android device for a smooth, app-like experience without visiting the Google Play Store.</p><div className="install-step"><span>1</span><div><b>Open Google Chrome</b><p>Ensure you are viewing this page in the <strong>Chrome</strong> browser on your Android device.</p></div></div><div className="install-step"><span>2</span><div><b>Tap the Menu</b><p>Tap the <strong>three vertical dots</strong> in the upper-right corner to open the browser menu.</p></div></div><div className="install-step"><span>3</span><div><b>Select Install App</b><p>Look for <strong>“Install App”</strong> or <strong>“Add to Home screen”</strong> and tap it.</p></div></div><div className="install-step"><span>4</span><div><b>Confirm and Launch</b><p>Confirm by tapping <strong>Add</strong> or <strong>Install</strong>. You can then launch it from your Home Screen.</p></div></div></div>}
        <div className="install-app-footnote">If the install option does not appear, open the deployed site over HTTPS and check whether your browser supports app installation.</div>
      </section>
    </div>}
    {supportFormOpen && <div className="support-form-backdrop" onMouseDown={(e)=>{if(e.target===e.currentTarget)setSupportFormOpen(false);}}>
      <section className="support-form-modal" role="dialog" aria-modal="true" aria-label="Contact Support">
        <header className="support-form-header"><h2><MessageCircle size={23}/> Contact Support</h2><button aria-label="Close Contact Support" onClick={()=>setSupportFormOpen(false)}><X size={22}/></button></header>
        <div className="support-form-body"><label>Your Name<input value={supportName} onChange={e=>setSupportName(e.target.value)} placeholder="Display name" maxLength={80}/></label><label>Email Address<input type="email" value={supportEmail} onChange={e=>setSupportEmail(e.target.value)} placeholder="you@example.com" maxLength={254}/></label><label>Your Query<textarea value={supportQuery} onChange={e=>setSupportQuery(e.target.value)} placeholder="How can we help you today?" maxLength={1800}/></label><button className="support-submit" onClick={submitSupportQuery} disabled={supportBusy}>{supportBusy ? "Submitting…" : "Submit Query"}</button>{supportFeedback && <p className={`support-feedback ${supportFeedback.startsWith("Your request") ? "success" : ""}`} role="status">{supportFeedback}</p>}<p className="support-privacy-note">Your request is sent privately to the support team and is not visible to other members.</p></div>
      </section>
    </div>}
    {documentationOpen && <PlatformDocumentation onClose={() => setDocumentationOpen(false)} />}
    {faqOpen && <FaqModal onClose={() => setFaqOpen(false)} />}
    {notice&&<div className="notice-toast"><span>{notice}</span><button onClick={()=>setNotice("")}><X size={14}/></button></div>}
  </main>);
}


export default function Home() {
  return <AuthGate><Dashboard /></AuthGate>;
}
