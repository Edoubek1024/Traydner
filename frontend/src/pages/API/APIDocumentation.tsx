import { useMemo, useState } from "react";

// Remote Trading API – Usage Guide (Dark/Emerald)
// This page documents example calls for: /price, /trade, /balance, /history
// No live requests are made. Everything is generated locally for copy/paste.

export default function RemoteApiDocs() {
  const [baseUrl, setBaseUrl] = useState<string>("https://traydner-186649552655.us-central1.run.app");
  const [apiKey, setApiKey] = useState<string>("YOUR_API_KEY");

  // Example params (editable by user for snippet generation only)
  const [priceSymbol, setPriceSymbol] = useState("BTC");
  const [tradeSymbol, setTradeSymbol] = useState("BTC");
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("sell");
  const [tradeQty, setTradeQty] = useState("0.5");
  const [historySymbol, setHistorySymbol] = useState("AAPL");
  const [historyResolution, setHistoryResolution] = useState("1m");
  const [historyLimit, setHistoryLimit] = useState("50");
  const [msSymbol, setMsSymbol] = useState("AAPL");
  const [msMarket, setMsMarket] = useState("");
  const marketStatusPath = "/api/remote/market_status";
  const marketStatusQS = useMemo(() => {
    const usp = new URLSearchParams();
    if (msSymbol.trim() !== "") {
      usp.append("symbol", msSymbol.trim());
    } else if (msMarket !== "") {
      usp.append("market", msMarket);
    }
    const qs = usp.toString();
    return qs ? `?${qs}` : "";
  }, [msSymbol, msMarket]);

  // Helpers
  const esc = (s: string) => s.replace(/"/g, '\\"');
  const q = (params: Record<string, string | number | undefined>) => {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") usp.append(k, String(v));
    });
    const qs = usp.toString();
    return qs ? `?${qs}` : "";
  };

  // --- PRICE EXAMPLES -------------------------------------------------------
  const pricePath = "/api/remote/price";
  const priceQS = q({ symbol: priceSymbol });

  
  const jsPrice = useMemo(() => (
    `const res = await fetch("${baseUrl}${pricePath}${priceQS}", {\n  headers: {\n    Authorization: "Bearer ${esc(apiKey)}"\n  }\n});\nif (!res.ok) throw new Error(await res.text());\nconst data = await res.json();\nconsole.log(data);`
  ), [baseUrl, pricePath, priceQS, apiKey]);

  const pyPrice = useMemo(() => (
    `import requests\nurl = "${baseUrl}${pricePath}${priceQS}"\nheaders = {"Authorization": "Bearer ${esc(apiKey)}"}\nr = requests.get(url, headers=headers, timeout=15)\nprint(r.status_code, r.text)`
  ), [baseUrl, pricePath, priceQS, apiKey]);

  // --- TRADE EXAMPLES -------------------------------------------------------
  const tradePath = "/api/remote/trade";
  const tradeQS = q({ symbol: tradeSymbol, side: tradeSide, quantity: tradeQty });

  
  const jsTrade = useMemo(() => (
    `const res = await fetch("${baseUrl}${tradePath}${tradeQS}", {\n  method: "POST",\n  headers: { Authorization: "Bearer ${esc(apiKey)}" }\n});\nif (!res.ok) throw new Error(await res.text());\nconst data = await res.json();\nconsole.log(data);`
  ), [baseUrl, tradePath, tradeQS, apiKey]);

  const pyTrade = useMemo(() => (
    `import requests\nurl = "${baseUrl}${tradePath}${tradeQS}"\nheaders = {"Authorization": "Bearer ${esc(apiKey)}"}\nr = requests.post(url, headers=headers, timeout=20)\nprint(r.status_code)\nprint(r.text)`
  ), [baseUrl, tradePath, tradeQS, apiKey]);

  // --- BALANCE EXAMPLES -----------------------------------------------------
  const balancePath = "/api/remote/balance";
  
  const jsBalance = useMemo(() => (
    `const res = await fetch("${baseUrl}${balancePath}", {\n  headers: { Authorization: "Bearer ${esc(apiKey)}" }\n});\nif (!res.ok) throw new Error(await res.text());\nconst data = await res.json();\nconsole.log(data);`
  ), [baseUrl, balancePath, apiKey]);

  const pyBalance = useMemo(() => (
    `import requests\nurl = "${baseUrl}${balancePath}"\nheaders = {"Authorization": "Bearer ${esc(apiKey)}"}\nr = requests.get(url, headers=headers, timeout=10)\nprint(r.status_code, r.text)`
  ), [baseUrl, balancePath, apiKey]);

  // --- HISTORY EXAMPLES -----------------------------------------------------
  const historyPath = "/api/remote/history";
  const historyQS = q({ symbol: historySymbol, resolution: historyResolution, limit: historyLimit });

  
  const jsHistory = useMemo(() => (
    `const res = await fetch("${baseUrl}${historyPath}${historyQS}", {\n  headers: { Authorization: "Bearer ${esc(apiKey)}" }\n});\nif (!res.ok) throw new Error(await res.text());\nconst data = await res.json();\nconsole.log(data);`
  ), [baseUrl, historyPath, historyQS, apiKey]);

  const pyHistory = useMemo(() => (
    `import requests\nurl = "${baseUrl}${historyPath}${historyQS}"\nheaders = {"Authorization": "Bearer ${esc(apiKey)}"}\nr = requests.get(url, headers=headers, timeout=15)\nprint(r.status_code)\nprint(r.text[:1000])`
  ), [baseUrl, historyPath, historyQS, apiKey]);

  const jsMarketStatus = useMemo(() => (
    `const res = await fetch("${baseUrl}${marketStatusPath}${marketStatusQS}", {
  headers: { Authorization: "Bearer ${esc(apiKey)}" }
});
if (!res.ok) throw new Error(await res.text());
const data = await res.json();
console.log(data);`
  ), [baseUrl, marketStatusPath, marketStatusQS, apiKey]);

  const pyMarketStatus = useMemo(() => (
    `import requests
url = "${baseUrl}${marketStatusPath}${marketStatusQS}"
headers = {"Authorization": "Bearer ${esc(apiKey)}"}
r = requests.get(url, headers=headers, timeout=10)
print(r.status_code, r.text)`
  ), [baseUrl, marketStatusPath, marketStatusQS, apiKey]);

    // Mutually exclusive inputs for market status
  const onChangeMsSymbol = (v: string) => {
    setMsSymbol(v);
    if (v.trim() !== "") setMsMarket(""); // clear market if symbol is set
  };

  const onChangeMsMarket = (v: string) => {
    setMsMarket(v);
    if (v !== "") setMsSymbol(""); // clear symbol if market is chosen
  };

  return (
    <div className="min-h-screen w-full bg-gray-950 text-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Remote Trading API — Usage Guide</h1>
          <p className="text-sm text-gray-400 mt-2">Dark theme with emerald/green accents • Copy/paste-ready examples • No live requests are made on this page.</p>
        </header>

        {/* Global Inputs */}
        <section className="mb-8 p-4 rounded-2xl border border-emerald-700 bg-gray-900 shadow-xl">
          <h2 className="text-xl font-medium text-white mb-4">Configuration</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <LabeledInput label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder="https://your-host" />
            <LabeledInput label="API Key (Bearer)" value={apiKey} onChange={setApiKey} placeholder="sk_live_..." />
          </div>
          <p className="mt-3 text-xs text-gray-400">Each snippet includes <code className="text-emerald-400">Authorization</code> header as <code className="text-emerald-400">Bearer</code> token.</p>
        </section>

        {/* PRICE */}
        <EndpointCard
          title="GET /api/remote/price"
          subtitle="Fetch the latest price for a symbol. Works for stocks, crypto, and forex."
          path="GET /api/remote/price"
          controls={<div className="grid sm:grid-cols-3 gap-3">
            <LabeledInput label="symbol" value={priceSymbol} onChange={setPriceSymbol} placeholder="e.g. BTC / AAPL / EUR" />
          </div>}
          params={[{ name: "symbol", required: true, desc: "Ticker: e.g. AAPL, BTC, EUR" }]}
          response={{
            code: 200,
            body: `{
  "symbol": "${priceSymbol}",
  "market": "stock|crypto|forex",
  "price": 123.45,
  "source": "...",
  "updatedAt": 1712345678
}`,
          }}
          tabs={{
            js: jsPrice,
            py: pyPrice,
          }}
        />

        {/* TRADE */}
        <EndpointCard
          title="POST /api/remote/trade"
          subtitle="Execute a simulated trade. Stocks require integer quantity; crypto/forex allow floats."
          path="POST /api/remote/trade"
          controls={<div className="grid sm:grid-cols-3 gap-3">
            <LabeledInput label="symbol" value={tradeSymbol} onChange={setTradeSymbol} placeholder="BTC / AAPL / EUR" />
            <LabeledSelect label="side" value={tradeSide} onChange={(v) => setTradeSide(v as any)} options={["buy","sell"]} />
            <LabeledInput label="quantity" value={tradeQty} onChange={setTradeQty} placeholder="0.5" />
          </div>}
          params={[
            { name: "symbol", required: true, desc: "Ticker: e.g. AAPL, BTC, EUR" },
            { name: "side", required: true, desc: "'buy' or 'sell'" },
            { name: "quantity", required: true, desc: "Number of units. Stocks: positive integer." },
          ]}
          response={{
            code: 200,
            body: `{
  "status": "success",
  "trade": {
    "symbol": "${tradeSymbol}",
    "side": "${tradeSide}",
    "quantity": ${tradeQty},
    "price": 123.45,
    "executed_by_uid": "user_uid"
  },
  "result": { /* trade service payload */ }
}`,
          }}
          tabs={{
            js: jsTrade,
            py: pyTrade,
          }}
        />

        {/* BALANCE */}
        <EndpointCard
          title="GET /api/remote/balance"
          subtitle="Fetch your simulated account balance for the authenticated user."
          path="GET /api/remote/balance"
          params={[]}
          response={{
            code: 200,
            body: `{
  "balance": 100000.00
}`,
          }}
          tabs={{
            js: jsBalance,
            py: pyBalance,
          }}
        />

        {/* HISTORY */}
        <EndpointCard
          title="GET /api/remote/history"
          subtitle="Fetch recent candles for a symbol and resolution."
          path="GET /api/remote/history"
          controls={<div className="grid sm:grid-cols-3 gap-3">
            <LabeledInput label="symbol" value={historySymbol} onChange={setHistorySymbol} placeholder="AAPL / BTC / EUR" />
            <LabeledInput label="resolution" value={historyResolution} onChange={setHistoryResolution} placeholder="1m, 5m, 1h, D, W" />
            <LabeledInput label="limit" value={historyLimit} onChange={setHistoryLimit} placeholder="50" />
          </div>}
          params={[
            { name: "symbol", required: true, desc: "Ticker" },
            { name: "resolution", required: true, desc: "e.g. 1m, 5m, 1h, D, W" },
            { name: "start_ts", required: false, desc: "Unix seconds (optional)" },
            { name: "end_ts", required: false, desc: "Unix seconds (optional)" },
            { name: "limit", required: false, desc: "Max candles (1–5000). Default 500." },
          ]}
          response={{
            code: 200,
            body: `{
  "symbol": "${historySymbol}",
  "market": "stock|crypto|forex",
  "resolution": "${historyResolution}",
  "count": ${historyLimit},
  "history": [ { "timestamp": 1712345678, "open": 1, "high": 2, "low": 0.5, "close": 1.8, "volume": 1234 } ],
  "source": "mongo",
  "updatedAt": 1712349999
}`,
          }}
          tabs={{
            js: jsHistory,
            py: pyHistory,
          }}
        />
        {/* MARKET STATUS */}
        <EndpointCard
          title="GET /api/remote/market_status"
          subtitle="Returns { isOpen: boolean } for a given symbol or market. If both are provided, symbol takes precedence."
          path="GET /api/remote/market_status"
          controls={
            <div className="grid sm:grid-cols-2 gap-3">
              <LabeledInput
                label="symbol (optional)"
                value={msSymbol}
                onChange={onChangeMsSymbol}
                placeholder="e.g. AAPL / BTC / EUR"
              />
              <LabeledSelect
                label="market (optional)"
                value={msMarket}
                onChange={onChangeMsMarket}
                options={["", "stock", "crypto", "forex"]}
              />
            </div>
          }
          params={[
            { name: "symbol", required: false, desc: "Ticker. If present, it determines the market (overrides 'market')." },
            { name: "market", required: false, desc: "One of: stock | crypto | forex (case-insensitive)." },
          ]}
          response={{
            code: 200,
            body: `{
  "isOpen": true
}`,
          }}
          tabs={{
            js: jsMarketStatus,
            py: pyMarketStatus,
          }}
        />


        <footer className="mt-10 text-xs text-gray-500">
          <p>
            All endpoints require <span className="text-emerald-400">Authorization: Bearer &lt;API_KEY&gt;</span>.
            Symbols are case-insensitive. Common formats: <code className="text-emerald-400">AAPL</code>, <code className="text-emerald-400">BTC</code>, <code className="text-emerald-400">EUR</code>.
          </p>
        </footer>
      </div>
    </div>
  );
}

// -------------------------- UI Components ----------------------------------
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-xs uppercase tracking-wider text-emerald-300">{children}</span>;
}

function LabeledInput({ label, value, onChange, placeholder }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block mb-1 text-sm text-gray-300">{label}</label>
      <input
        className="w-full px-3 py-2 rounded bg-gray-800 border border-emerald-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-600"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function LabeledSelect({ label, value, onChange, options }:
  { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block mb-1 text-sm text-gray-300">{label}</label>
      <select
        className="w-full px-3 py-2 rounded bg-gray-800 border border-emerald-700 text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function EndpointCard({
  title,
  subtitle,
  path,
  controls,
  params,
  response,
  tabs,
}: {
  title: string;
  subtitle?: string;
  path: string;
  controls?: React.ReactNode;
  params: { name: string; required?: boolean; desc?: string }[];
  response: { code: number; body: string };
  tabs: { js: string; py: string };
}) {
  return (
    <section className="mb-8 p-5 rounded-2xl border border-emerald-800 bg-gray-900 shadow-lg">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
          <p className="text-xs text-emerald-300 mt-2">{path}</p>
        </div>
      </div>

      {controls && <div className="mt-4">{controls}</div>}

      <div className="mt-5 grid lg:grid-cols-2 gap-5">
        <div className="p-4 rounded-xl bg-gray-950 border border-gray-800">
          <SectionLabel>Request</SectionLabel>
          <div className="mt-2">
            <ParamTable params={params} />
          </div>
          <div className="mt-4">
            <Tabs
              tabs={{ js: "JavaScript (fetch)", py: "Python (requests)" }}
              contents={{ js: tabs.js, py: tabs.py }}
            />
          </div>
        </div>
        <div className="p-4 rounded-xl bg-gray-950 border border-gray-800">
          <SectionLabel>Response (example)</SectionLabel>
          <div className="mt-2 text-xs text-gray-300">HTTP {response.code}</div>
          <pre className="mt-2 p-3 rounded bg-black/70 border border-emerald-800 text-emerald-300 overflow-x-auto whitespace-pre-wrap">{response.body}</pre>
        </div>
      </div>
    </section>
  );
}

function ParamTable({ params }: { params: { name: string; required?: boolean; desc?: string }[] }) {
  if (!params || params.length === 0) {
    return <div className="text-sm text-gray-400">No query/body parameters.</div>;
  }
  return (
    <table className="w-full text-left text-sm mt-2">
      <thead>
        <tr>
          <th className="py-1 text-gray-300">Name</th>
          <th className="py-1 text-gray-300">Required</th>
          <th className="py-1 text-gray-300">Description</th>
        </tr>
      </thead>
      <tbody>
        {params.map((p) => (
          <tr key={p.name} className="border-t border-gray-800">
            <td className="py-2 text-gray-200"><code className="text-emerald-300">{p.name}</code></td>
            <td className="py-2 text-gray-300">{p.required ? "Yes" : "No"}</td>
            <td className="py-2 text-gray-400">{p.desc ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Tabs({
  tabs,
  contents,
}: {
  tabs: Record<string, string>;
  contents: Record<string, string>;
}) {
  const keys = Object.keys(tabs);
  const [active, setActive] = useState<string>(keys[0]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(contents[active]);
      alert("Snippet copied to clipboard.");
    } catch {
      alert("Failed to copy. Please copy manually.");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => setActive(k)}
            className={
              "px-3 py-1 rounded border text-sm " +
              (active === k
                ? "bg-emerald-700 border-emerald-600 text-white"
                : "bg-gray-900 border-gray-700 text-gray-300 hover:border-emerald-700")
            }
          >
            {tabs[k]}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={copy} className="px-3 py-1 rounded border border-emerald-600 text-white text-sm hover:bg-emerald-700">Copy</button>
      </div>
      <pre className="mt-2 p-3 rounded bg-black/70 border border-emerald-800 text-emerald-300 overflow-x-auto whitespace-pre-wrap">{contents[active]}</pre>
    </div>
  );
}
