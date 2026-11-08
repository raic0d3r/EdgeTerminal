import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 60;

type NewsItem = { title: string; link: string; source: string; publishedAt: string; category: string; summary: string };

const FEEDS: { url: string; source: string; category: string }[] = [
  { url: "https://news.google.com/rss/search?q=gold+price+XAUUSD+when:2d&hl=en-US&gl=US&ceid=US:en", source: "Google News", category: "GOLD" },
  { url: "https://news.google.com/rss/search?q=silver+price+XAGUSD+when:2d&hl=en-US&gl=US&ceid=US:en", source: "Google News", category: "SILVER" },
  { url: "https://news.google.com/rss/search?q=US+dollar+DXY+currency+when:2d&hl=en-US&gl=US&ceid=US:en", source: "Google News", category: "USD" },
  { url: "https://news.google.com/rss/search?q=Federal+Reserve+Fed+interest+rates+when:3d&hl=en-US&gl=US&ceid=US:en", source: "Google News", category: "FED" },
  { url: "https://news.google.com/rss/search?q=US+inflation+employment+economic+data+when:3d&hl=en-US&gl=US&ceid=US:en", source: "Google News", category: "ECONOMICS" },
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", source: "Federal Reserve", category: "FED" },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories", source: "MarketWatch", category: "MARKETS" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC", category: "MARKETS" },
];

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/<[^>]*>/g, "").trim();
}
function tag(block: string, name: string) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? decodeXml(m[1]) : "";
}
async function readFeed(feed: typeof FEEDS[number]): Promise<NewsItem[]> {
  try {
    const response = await fetch(feed.url, { headers: { "user-agent": "EdgeTerminalNews/1.0 (RSS reader)", accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(6500), next: { revalidate: 60 } });
    if (!response.ok) return [];
    const xml = await response.text();
    const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) || [];
    return blocks.map((b) => {
      const title = tag(b, "title");
      const linkTag = b.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
      const link = tag(b, "link") || linkTag?.[1] || "";
      const publishedAt = tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date");
      const summary = tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded");
      let source = tag(b, "source") || feed.source;
      if (feed.source === "Google News") {
        const m = title.match(/\s-\s([^-]+)$/);
        if (m) source = m[1].trim();
      }
      return { title, link, source, publishedAt, category: feed.category, summary: summary.slice(0, 280) };
    }).filter((x) => x.title && /^https?:\/\//i.test(x.link));
  } catch { return []; }
}
export async function GET() {
  const results = await Promise.all(FEEDS.map(readFeed));
  const unique = new Map<string, NewsItem>();
  for (const item of results.flat()) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!unique.has(key)) unique.set(key, item);
  }
  const items = [...unique.values()].sort((a, b) => {
    const ta = Date.parse(a.publishedAt) || 0, tb = Date.parse(b.publishedAt) || 0;
    return tb - ta;
  }).slice(0, 100);
  return NextResponse.json({ items, updatedAt: new Date().toISOString(), sources: FEEDS.length, availableSources: results.filter((x) => x.length).length }, {
    headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
  });
}
