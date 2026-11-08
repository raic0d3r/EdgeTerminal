import {NextRequest,NextResponse} from "next/server";
import {getAdminServices} from "@/lib/firebase-admin";
import {decryptExnessCredentials} from "@/lib/exness/vault";
import {exnessGet,exnessRequest,newExnessIdempotencyKey} from "@/lib/exness/client";
import {enforceSameOrigin,readJsonBody} from "@/lib/server/request-security";
import {enforceIpRateLimit} from "@/lib/server/rate-limit";
export const runtime="nodejs";export const dynamic="force-dynamic";
async function credentials(req:NextRequest){const token=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");if(!token)throw new Error("AUTH");const {adminAuth,adminDb}=getAdminServices();const user=await adminAuth.verifyIdToken(token,true);const snap=await adminDb.collection("users").doc(user.uid).collection("brokerConnections").doc("exness").get();if(!snap.exists||!snap.data()?.encryptedCredentials)throw new Error("NOT_CONNECTED");const c=decryptExnessCredentials(String(snap.data()!.encryptedCredentials));return c;}
export async function GET(req:NextRequest){const limited=await enforceIpRateLimit(req,"exness-trading-read",30,60);if(limited)return limited;try{const c=await credentials(req);const kind=req.nextUrl.searchParams.get("kind");let path:string;
    if(kind==="history"){
      // Exness requires `from` unless a cursor is supplied. Default to a
      // conservative one-day window; callers may request a specific range.
      const cursor=req.nextUrl.searchParams.get("cursor");
      const limitRaw=Number(req.nextUrl.searchParams.get("limit")||100);
      const limit=Number.isInteger(limitRaw)?Math.min(200,Math.max(1,limitRaw)):100;
      if(cursor){path=`/v1/history/accounts/${c.accountId}/deals?cursor=${encodeURIComponent(cursor)}&limit=${limit}`;}
      else {
        const suppliedFrom=req.nextUrl.searchParams.get("from");
        const suppliedTo=req.nextUrl.searchParams.get("to");
        const to=suppliedTo?new Date(suppliedTo):new Date();
        const daysRaw=Number(req.nextUrl.searchParams.get("days")||30);
        const days=Number.isInteger(daysRaw)?Math.min(365,Math.max(1,daysRaw)):30;
        const from=suppliedFrom?new Date(suppliedFrom):new Date(to.getTime()-days*24*60*60*1000);
        if(!Number.isFinite(from.getTime())||!Number.isFinite(to.getTime())||from>=to||to>new Date()) return NextResponse.json({ok:false,error:"Invalid history date range."},{status:400,headers:{"Cache-Control":"no-store"}});
        path=`/v1/history/accounts/${c.accountId}/deals?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}&limit=${limit}`;
      }
    } else { path=`/v1/trading/accounts/${c.accountId}/snapshot`; }
    const data=await exnessGet<any>(c,c.accessPoint||c.gatewayUrl,path);
    const rawRecords=kind==="history"?(data?.items||data?.deals||[]):(data?.positions||[]);
    const records=kind==="history"&&Array.isArray(rawRecords)?rawRecords.map((row:any,index:number)=>{
      const rawTime=row.time??row.execution_time??row.executed_at??row.created_at??row.timestamp??null;
      const parsedTime=typeof rawTime==="number"?(rawTime<1e12?rawTime*1000:rawTime):(rawTime?new Date(rawTime).getTime():0);
      const side=String(row.side??row.type??row.trade_type??"UNKNOWN").toUpperCase();
      const status=String(row.status??row.state??"Executed");
      return {...row,dealId:String(row.deal_id??row.dealId??row.id??index),time:parsedTime>0?new Date(parsedTime).toISOString():null,
        symbolName:String(row.instrument??row.symbol??row.symbol_name??"Unknown"),side:side.includes("BUY")?"BUY":side.includes("SELL")?"SELL":side,
        volumeUnits:row.volume??row.filled_volume??null,price:row.price??row.execution_price??null,
        pnl:row.net_profit??row.profit??row.pnl??null,commission:row.commission??null,status,
        isClosedDeal: Boolean(row.close_position_detail ?? row.closePositionDetail ?? row.closed_at ?? row.closedAt ?? row.close_time ?? row.closeTime) ||
          /^(close|closed|closing|out|exit)$/i.test(String(row.action??row.deal_action??row.dealAction??row.entry_type??row.entryType??row.deal_type??row.dealType??""))};
    }).filter((row:any)=>row.isClosedDeal):rawRecords;
    return NextResponse.json({ok:true,kind:kind||"positions",data,records,filtered:kind==="history"?"closed-deals-only":undefined},{headers:{"Cache-Control":"no-store"}});}catch(e){const m=e instanceof Error?e.message:"";const upstreamStatus=Number(m.match(/\(HTTP (\d{3})\)$/)?.[1]||0);const publicCode=m.match(/\b(?:AUTH_[A-Z_]+|ACCOUNT_[A-Z_]+|REQUEST_[A-Z_]+|SYSTEM_[A-Z_]+)\b/)?.[0];const status=m==="AUTH"?401:m==="NOT_CONNECTED"?404:upstreamStatus>=400&&upstreamStatus<500?upstreamStatus:502;return NextResponse.json({ok:false,error:m==="AUTH"?"Authentication required.":m==="NOT_CONNECTED"?"Connect Exness first.":publicCode||"Unable to retrieve Exness trading data."},{status,headers:{"Cache-Control":"no-store"}});}}
export async function POST(req:NextRequest){const limited=await enforceIpRateLimit(req,"exness-trading-write",5,60);if(limited)return limited;const origin=enforceSameOrigin(req);if(origin)return origin;const parsed=await readJsonBody<any>(req,8192);if(!parsed.ok)return parsed.response;try{const c=await credentials(req);const b=parsed.data;const instrument=String(b.instrument||"").toUpperCase();const side=String(b.side||"").toLowerCase();const type=String(b.type||"market").toLowerCase();const volume=String(b.volume??"");if(!/^[A-Z0-9._-]{3,30}$/.test(instrument)||!( ["buy","sell"].includes(side))||!( ["market","limit","stop"].includes(type))||!/^[+]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(volume)||Number(volume)<=0||Number(volume)>100000)return NextResponse.json({ok:false,error:"Invalid order parameters."},{status:400});const body:Record<string,unknown>={instrument,side,volume};if(b.stopLoss!==undefined)body.stop_loss_price=String(b.stopLoss);if(b.takeProfit!==undefined)body.take_profit_price=String(b.takeProfit);if(type==="market"){const result=await exnessRequest(c,c.accessPoint||c.gatewayUrl,"POST",`/v1/trading/accounts/${c.accountId}/positions`,body,newExnessIdempotencyKey("edge-market"));return NextResponse.json({ok:true,status:"accepted_pending_confirmation",result,note:"Exness accepted the market request. This is not confirmation of a fill; reconcile the operation or transaction event."},{headers:{"Cache-Control":"no-store"}});}if(!Number.isFinite(Number(b.price))||Number(b.price)<=0)return NextResponse.json({ok:false,error:"A valid entry price is required for a pending order."},{status:400});body.type=type;body.price=String(b.price);const key=newExnessIdempotencyKey("edge-pending");const result=await exnessRequest(c,c.accessPoint||c.gatewayUrl,"POST",`/v1/trading/accounts/${c.accountId}/orders`,body,key);return NextResponse.json({ok:true,status:"accepted_pending_confirmation",idempotencyKey:key,result,note:"Exness accepted the pending-order request. It is not yet a filled position; check pending orders and broker transaction events."},{headers:{"Cache-Control":"no-store"}});}catch(e){const m=e instanceof Error?e.message:"";return NextResponse.json({ok:false,error:m==="AUTH"?"Authentication required.":"Exness order request failed."},{status:m==="AUTH"?401:502,headers:{"Cache-Control":"no-store"}});}}
export async function DELETE(req:NextRequest){const limited=await enforceIpRateLimit(req,"exness-trading-close",5,60);if(limited)return limited;const origin=enforceSameOrigin(req);if(origin)return origin;try{const c=await credentials(req);const positionId=req.nextUrl.searchParams.get("positionId")||"";if(!/^\d+$/.test(positionId))return NextResponse.json({ok:false,error:"Invalid position ID."},{status:400});const result=await exnessRequest(c,c.accessPoint||c.gatewayUrl,"DELETE",`/v1/trading/accounts/${c.accountId}/positions/${encodeURIComponent(positionId)}`);return NextResponse.json({ok:true,status:"accepted_pending_confirmation",result},{headers:{"Cache-Control":"no-store"}});}catch(e){const m=e instanceof Error?e.message:"";return NextResponse.json({ok:false,error:m==="AUTH"?"Authentication required.":"Unable to close Exness position."},{status:m==="AUTH"?401:502});}}
