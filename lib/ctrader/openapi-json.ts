import WebSocket from "ws";

const LIVE_WS_URL = "wss://live.ctraderapi.com:5036";

type CTraderEnvelope = {
  clientMsgId?: string;
  payloadType?: number;
  payload?: Record<string, unknown>;
};

function makeId() {
  return `edge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Performs the documented cTrader JSON-WebSocket application-auth and
 * account-list flow. The socket is short-lived and is always closed.
 */
export async function fetchLiveCTraderAccounts(input: {
  clientId: string;
  clientSecret: string;
  accessToken: string;
}): Promise<Array<Record<string, unknown>>> {
  const ws = new WebSocket(LIVE_WS_URL, { handshakeTimeout: 10_000 });

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("cTrader WebSocket connection timed out.")), 12_000);
      ws.once("open", () => { clearTimeout(timer); resolve(); });
      ws.once("error", (error) => { clearTimeout(timer); reject(error); });
    });

    const sendAndWait = (payloadType: number, payload: Record<string, unknown>, expectedType: number) =>
      new Promise<CTraderEnvelope>((resolve, reject) => {
        const clientMsgId = makeId();
        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`cTrader response timed out (message ${expectedType}).`));
        }, 12_000);

        const onMessage = (raw: WebSocket.RawData) => {
          let message: CTraderEnvelope;
          try {
            const text = typeof raw === "string" ? raw : Buffer.from(raw as Buffer).toString("utf8");
            message = JSON.parse(text) as CTraderEnvelope;
          } catch {
            return;
          }
          if (message.payloadType === 50) {
            cleanup();
            const description = String(message.payload?.description ?? message.payload?.errorCode ?? "cTrader API error");
            reject(new Error(description.slice(0, 220)));
            return;
          }
          if (message.payloadType === expectedType && (!message.clientMsgId || message.clientMsgId === clientMsgId)) {
            cleanup();
            resolve(message);
          }
        };

        const onError = (error: Error) => { cleanup(); reject(error); };
        const cleanup = () => {
          clearTimeout(timer);
          ws.off("message", onMessage);
          ws.off("error", onError);
        };

        ws.on("message", onMessage);
        ws.on("error", onError);
        ws.send(JSON.stringify({ clientMsgId, payloadType, payload }), (error) => {
          if (error) { cleanup(); reject(error); }
        });
      });

    await sendAndWait(2100, {
      clientId: input.clientId,
      clientSecret: input.clientSecret,
    }, 2101);

    const accountResponse = await sendAndWait(2149, {
      accessToken: input.accessToken,
    }, 2150);

    const rawAccounts = accountResponse.payload?.ctidTraderAccount;
    if (!Array.isArray(rawAccounts)) {
      throw new Error("cTrader responded, but no account list was present in the response.");
    }

    return rawAccounts.map((entry) => {
      const account = (entry && typeof entry === "object" ? entry : {}) as Record<string, unknown>;
      return {
        ctidTraderAccountId: String(account.ctidTraderAccountId ?? ""),
        isLive: account.isLive === true || account.isLive === "true",
        traderLogin: account.traderLogin == null ? null : String(account.traderLogin),
        brokerTitleShort: account.brokerTitleShort == null ? null : String(account.brokerTitleShort),
        accountType: account.accountType == null ? null : String(account.accountType),
      };
    }).filter((account) => account.ctidTraderAccountId.length > 0);
  } finally {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      await new Promise<void>((resolve) => {
        const done = () => resolve();
        ws.once("close", done);
        try { ws.close(1000, "Account-list check complete"); } catch { resolve(); }
        setTimeout(resolve, 1500).unref();
      });
    }
  }
}
