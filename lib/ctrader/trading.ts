import WebSocket from "ws";
import { createHash } from "node:crypto";
import { fetchLiveCTraderAccounts } from "./openapi-json";
import { getCTraderConfig } from "./session";

const WS_URL = "wss://live.ctraderapi.com:5036";
type Envelope = { clientMsgId?: string; payloadType?: number; payload?: Record<string, any> };
const id = () => `edge-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;

// cTrader account-list validation is required for every operation, but repeatedly
// opening an extra socket for the same OAuth session can trigger broker throttling.
const accountCache = new Map<string, { expiresAt: number; accounts: Array<Record<string, unknown>> }>();
const accountCacheKey = (token: string) => createHash("sha256").update(token).digest("hex");
async function getCachedAccounts(clientId: string, clientSecret: string, accessToken: string) {
  const key = accountCacheKey(accessToken);
  const cached = accountCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.accounts;
  const accounts = await fetchLiveCTraderAccounts({ clientId, clientSecret, accessToken });
  accountCache.set(key, { expiresAt: Date.now() + 30_000, accounts });
  if (accountCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of accountCache) if (v.expiresAt <= now) accountCache.delete(k);
  }
  return accounts;
}

// Short-lived server cache and request coalescing prevent repeated refreshes
// from opening duplicate cTrader history requests.
const historyCache = new Map<string, { expiresAt: number; value: any }>();
const historyInflight = new Map<string, Promise<any>>();

async function withAccount<T>(input: { accessToken: string; accountId: string }, fn: (send: (type:number,payload:Record<string,unknown>,expected:number)=>Promise<Envelope>)=>Promise<T>): Promise<T> {
  if (!/^\d{1,20}$/.test(input.accountId) || !Number.isSafeInteger(Number(input.accountId))) throw new Error("Invalid cTrader account ID.");
  const {clientId,clientSecret}=getCTraderConfig();
  const accounts=await getCachedAccounts(clientId,clientSecret,input.accessToken);
  const account=accounts.find(a=>a.ctidTraderAccountId===input.accountId);
  if (!account) throw new Error("Selected cTrader account is not linked to this user.");
  const ws=new WebSocket(WS_URL,{handshakeTimeout:10000,maxPayload:2*1024*1024});
  try {
    await new Promise<void>((resolve,reject)=>{const t=setTimeout(()=>reject(new Error("cTrader connection timed out.")),12000);ws.once("open",()=>{clearTimeout(t);resolve();});ws.once("error",e=>{clearTimeout(t);reject(e);});});
    const send=(type:number,payload:Record<string,unknown>,expected:number)=>new Promise<Envelope>((resolve,reject)=>{
      const clientMsgId=id(); const timer=setTimeout(()=>{cleanup();reject(new Error(`cTrader response timeout (${expected}).`));},15000);
      const onMessage=(raw:WebSocket.RawData)=>{let m:Envelope;try{m=JSON.parse(Buffer.from(raw as Buffer).toString("utf8"));}catch{return;}
        if(m.payloadType===50||m.payloadType===2142){cleanup();reject(new Error(String(m.payload?.description||m.payload?.errorCode||"cTrader rejected the request.").slice(0,180)));return;}
        if(m.payloadType===expected && (!m.clientMsgId||m.clientMsgId===clientMsgId)){cleanup();resolve(m);}};
      const onError=(e:Error)=>{cleanup();reject(e);}; const cleanup=()=>{clearTimeout(timer);ws.off("message",onMessage);ws.off("error",onError);};
      ws.on("message",onMessage);ws.on("error",onError);ws.send(JSON.stringify({clientMsgId,payloadType:type,payload}),e=>{if(e){cleanup();reject(e);}});
    });
    await send(2100,{clientId,clientSecret},2101);
    await send(2102,{ctidTraderAccountId:Number(input.accountId),accessToken:input.accessToken},2103);
    return await fn(send);
  } finally { if(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING){await new Promise<void>(resolve=>{ws.once("close",()=>resolve());try{ws.close(1000,"request complete");}catch{resolve();}setTimeout(resolve,1200).unref();});} }
}
export async function cTraderSnapshot(input:{accessToken:string;accountId:string}) {
 return withAccount(input,async send=>{
   const [snapshot,symbolResponse]=await Promise.all([
     send(2124,{ctidTraderAccountId:Number(input.accountId),returnProtectionOrders:false},2125),
     send(2114,{ctidTraderAccountId:Number(input.accountId)},2115),
   ]);
   const symbols=Array.isArray(symbolResponse.payload?.symbol)?symbolResponse.payload!.symbol as Array<Record<string,any>>:[];
   const symbolNames=new Map(symbols.map(s=>[String(s.symbolId),String(s.symbolName||s.symbolId)]));
   const positions=(Array.isArray(snapshot.payload?.position)?snapshot.payload!.position as Array<Record<string,any>>:[]).map(position=>{
     const trade=(position.tradeData&&typeof position.tradeData==="object"?position.tradeData:{}) as Record<string,any>;
     const symbolId=String(trade.symbolId??position.symbolId??"");
     const rawVolume=Number(trade.volume??position.volume??0);
     return {
       ...position,
       symbolId,
       symbolName:symbolNames.get(symbolId)||symbolId||"Unknown",
       volume:Number.isFinite(rawVolume)?rawVolume:0,
       volumeUnits:Number.isFinite(rawVolume)?rawVolume/100:null,
       side:Number(trade.tradeSide??position.tradeSide)===1?"BUY":Number(trade.tradeSide??position.tradeSide)===2?"SELL":"UNKNOWN",
       entryPrice:position.price??trade.openPrice??position.entryPrice??null,
       stopLoss:position.stopLoss??trade.stopLoss??null,
       takeProfit:position.takeProfit??trade.takeProfit??null,
       unrealizedPnl:position.swap===undefined?position.unrealizedGrossPnL??position.netProfit??null:position.unrealizedGrossPnL??position.netProfit??null,
     };
   });
   return {positions,orders:Array.isArray(snapshot.payload?.order)?snapshot.payload!.order:[]};
 });
}

export async function cTraderAccountCapital(input:{accessToken:string;accountId:string}) {
  return withAccount(input, async send => {
    const response = await send(2121, { ctidTraderAccountId: Number(input.accountId) }, 2122);
    const trader = (response.payload?.trader && typeof response.payload.trader === "object"
      ? response.payload.trader : response.payload) as Record<string, any>;
    if (trader.balance === undefined || trader.balance === null) {
      throw new Error("cTrader did not return account balance for the selected account.");
    }
    const rawDigits = Number(trader.moneyDigits ?? 2);
    const moneyDigits = Number.isInteger(rawDigits) ? Math.min(8, Math.max(0, rawDigits)) : 2;
    const balance = Number(trader.balance) / (10 ** moneyDigits);
    return {
      accountId: input.accountId,
      balance: Number.isFinite(balance) ? balance : null,
      moneyDigits,
      depositAssetId: trader.depositAssetId == null ? null : String(trader.depositAssetId),
      // Open API trader details provide balance, not a guaranteed equity/free-margin value.
      equity: null,
      freeMargin: null,
    };
  });
}

export async function cTraderHistory(input:{accessToken:string;accountId:string;from:number;to:number}) {
  if (!Number.isFinite(input.from) || !Number.isFinite(input.to) || input.from < 0 || input.from >= input.to || input.to > Date.now() + 60_000) {
    throw new Error("Invalid cTrader history date range.");
  }
  const tokenKey = accountCacheKey(input.accessToken);
  const cacheKey = `${tokenKey}:${input.accountId}:${Math.floor(input.from)}:${Math.floor(input.to)}`;
  const cached = historyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const existing = historyInflight.get(cacheKey);
  if (existing) return existing;

  const request = withAccount(input, async send => {
    // Fetch the deal list and symbol catalogue on the same authenticated socket.
    // This avoids one additional account/authentication round trip and lets the UI
    // display readable symbols instead of broker-specific numeric IDs.
    const response = await send(2133, {
      ctidTraderAccountId: Number(input.accountId),
      fromTimestamp: Math.floor(input.from),
      toTimestamp: Math.floor(input.to),
      maxRows: 1000,
    }, 2134);
    const symbolResponse = await send(2114, { ctidTraderAccountId: Number(input.accountId) }, 2115);
    const symbols = Array.isArray(symbolResponse.payload?.symbol)
      ? symbolResponse.payload!.symbol as Array<Record<string, any>> : [];
    const symbolNames = new Map(symbols.map(symbol => [String(symbol.symbolId), String(symbol.symbolName || symbol.symbolId)]));
    const rows = Array.isArray(response.payload?.deal)
      ? response.payload!.deal as Array<Record<string, any>> : [];
    const deals = rows.map((deal, index) => {
      const dealId = String(deal.dealId ?? deal.id ?? `${deal.orderId ?? "deal"}-${index}`);
      const timestamp = Number(deal.executionTimestamp ?? deal.utcLastUpdateTimestamp ?? deal.createTimestamp ?? 0);
      const rawVolume = Number(deal.volume ?? deal.filledVolume ?? 0);
      const close = deal.closePositionDetail && typeof deal.closePositionDetail === "object"
        ? deal.closePositionDetail as Record<string, any> : null;
      const moneyDigitsRaw = close?.moneyDigits ?? deal.moneyDigits ?? deal.tradeData?.moneyDigits ?? 2;
      const moneyDigits = Number.isInteger(Number(moneyDigitsRaw)) ? Math.min(8, Math.max(0, Number(moneyDigitsRaw))) : 2;
      const moneyScale = 10 ** moneyDigits;
      const toMoney = (value: unknown): number | null => {
        if (value === null || value === undefined || value === "") return null;
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric / moneyScale : null;
      };
      const commission = toMoney(deal.commission ?? close?.commission);
      const swap = toMoney(close?.swap ?? deal.swap);
      const realizedPnl = toMoney(close?.grossProfit ?? deal.grossProfit ?? deal.pnl);
      // Net P&L is realized P&L less/plus commission, matching the account
      // statement convention requested in the History UI. Include swap when
      // the broker supplies it for the closing deal.
      const netPnl = realizedPnl === null ? null : realizedPnl + (commission ?? 0) + (swap ?? 0);
      const statusCode = Number(deal.dealStatus);
      const status = statusCode === 2 ? "Filled" : statusCode === 1 ? "Partially filled" : statusCode === 3 ? "Reversed" : String(deal.dealStatus ?? "Executed");
      const symbolId = String(deal.symbolId ?? "");
      return {
        ...deal,
        dealId,
        positionId: deal.positionId == null ? null : String(deal.positionId),
        timestamp,
        time: timestamp > 0 ? new Date(timestamp).toISOString() : null,
        symbolId,
        symbolName: symbolNames.get(symbolId) || symbolId || "Unknown",
        side: Number(deal.tradeSide) === 1 ? "BUY" : Number(deal.tradeSide) === 2 ? "SELL" : String(deal.tradeSide ?? "UNKNOWN"),
        // cTrader protocol volume is expressed in hundredths of a unit.
        volumeUnits: Number.isFinite(rawVolume) ? rawVolume / 100 : null,
        price: deal.executionPrice ?? null,
        moneyDigits,
        currency: String(deal.currency ?? close?.currency ?? ""),
        realizedPnl,
        commission,
        swap,
        netPnl,
        grossPnl: realizedPnl,
        pnl: netPnl,
        isClosedDeal: Boolean(close),
        dealRole: close ? "Close" : "Execution",
        status,
      };
    }).filter(deal => deal.isClosedDeal)
      .sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    return {
      deals,
      hasMore: response.payload?.hasMore === true,
      from: input.from,
      to: input.to,
      count: deals.length,
      filtered: "closed-deals-only",
      source: "ctrader-deal-history",
      note: response.payload?.hasMore === true
        ? "Showing the most recent 1,000 deals in this date range. Narrow the date range to view older deals."
        : undefined,
    };
  });
  historyInflight.set(cacheKey, request);
  try {
    const value = await request;
    historyCache.set(cacheKey, { expiresAt: Date.now() + 20_000, value });
    if (historyCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of historyCache) if (v.expiresAt <= now) historyCache.delete(k);
    }
    return value;
  } finally {
    historyInflight.delete(cacheKey);
  }
}

export async function cTraderPlaceOrder(input:{accessToken:string;accountId:string;symbol:string;side:"BUY"|"SELL";volume:number;type:"MARKET"|"LIMIT"|"STOP";price?:number;stopLoss?:number;takeProfit?:number}) {
 if(!Number.isFinite(input.volume)||input.volume<=0||input.volume>100000) throw new Error("Volume is outside allowed bounds.");
 return withAccount(input,async send=>{
   const list=await send(2114,{ctidTraderAccountId:Number(input.accountId)},2115);const symbols=(list.payload?.symbol||[]) as Array<Record<string,any>>;
   const match=symbols.find(s=>String(s.symbolName||"").toUpperCase()===input.symbol.toUpperCase());if(!match)throw new Error("Symbol is not available on the selected cTrader account.");
   const payload:Record<string,unknown>={ctidTraderAccountId:Number(input.accountId),symbolId:Number(match.symbolId),orderType:input.type==="MARKET"?1:input.type==="LIMIT"?2:3,tradeSide:input.side==="BUY"?1:2,volume:Math.round(input.volume*100)};
   if(input.type==="LIMIT"){if(!Number.isFinite(input.price)||Number(input.price)<=0)throw new Error("A valid limit price is required.");payload.limitPrice=input.price;}
   if(input.type==="STOP"){if(!Number.isFinite(input.price)||Number(input.price)<=0)throw new Error("A valid stop price is required.");payload.stopPrice=input.price;}
   if(input.stopLoss!==undefined)payload.stopLoss=input.stopLoss;if(input.takeProfit!==undefined)payload.takeProfit=input.takeProfit;
   const r=await send(2106,payload,2126);return r.payload||{};
 });
}
export async function cTraderClosePosition(input:{accessToken:string;accountId:string;positionId:string;volume:number}) {
 if(!/^\d{1,20}$/.test(input.positionId)||!Number.isSafeInteger(Number(input.positionId)))throw new Error("Invalid position ID.");
 if(!Number.isFinite(input.volume)||input.volume<=0)throw new Error("Invalid close volume.");
 return withAccount(input,async send=>{const r=await send(2111,{ctidTraderAccountId:Number(input.accountId),positionId:Number(input.positionId),volume:Math.round(input.volume*100)},2126);return r.payload||{};});
}

export async function cTraderAmendPosition(input:{accessToken:string;accountId:string;positionId:string;stopLoss?:number;takeProfit?:number}) {
 if(!/^\d{1,20}$/.test(input.positionId)||!Number.isSafeInteger(Number(input.positionId))) throw new Error("Invalid position ID.");
 if(input.stopLoss===undefined && input.takeProfit===undefined) throw new Error("Enter a new stop loss or take profit price.");
 for (const [label,value] of [["Stop loss",input.stopLoss],["Take profit",input.takeProfit]] as const) {
   if(value!==undefined && (!Number.isFinite(value)||value<=0)) throw new Error(`${label} must be a positive price.`);
 }
 return withAccount(input,async send=>{
   const payload:Record<string,unknown>={ctidTraderAccountId:Number(input.accountId),positionId:Number(input.positionId)};
   if(input.stopLoss!==undefined) payload.stopLoss=input.stopLoss;
   if(input.takeProfit!==undefined) payload.takeProfit=input.takeProfit;
   const r=await send(2110,payload,2126);
   return r.payload||{};
 });
}
