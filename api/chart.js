// Vercel serverless function: batch daily history + live price from Yahoo Finance.
// GET /api/chart?symbols=RELIANCE,TCS,M%26M&range=2y
// → { data: { RELIANCE: { ltp, prev, name, t:[ms], c:[close], h:[high] } }, errors: { SYM: msg } }
// Symbols are NSE codes without suffix; ".NS" is appended here.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const KEEP = 300; // trading days returned (enough for 200 DMA + 52-week CAR window)

async function fetchOne(sym, range) {
  const ysym = /\.(NS|BO)$/i.test(sym) || sym.startsWith('^') ? sym : `${sym}.NS`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?range=${range}&interval=1d&includePrePost=false`;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      if (!res) throw new Error(j?.chart?.error?.description || 'no data');
      const q = res.indicators?.quote?.[0] || {};
      const ts = res.timestamp || [];
      const t = [], c = [], h = [];
      ts.forEach((s, i) => {
        if (q.close?.[i] == null) return;
        t.push(s * 1000);
        c.push(+q.close[i].toFixed(2));
        h.push(q.high?.[i] != null ? +q.high[i].toFixed(2) : +q.close[i].toFixed(2));
      });
      return {
        ltp: res.meta?.regularMarketPrice ?? c[c.length - 1] ?? null,
        prev: res.meta?.chartPreviousClose ?? null,
        name: res.meta?.shortName || res.meta?.longName || sym,
        t: t.slice(-KEEP), c: c.slice(-KEEP), h: h.slice(-KEEP),
      };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw lastErr;
}

export default async function handler(req, res) {
  const symbols = String(req.query.symbols || '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 40);
  const range = ['1y', '2y', '5d', '1mo'].includes(req.query.range) ? req.query.range : '2y';
  if (!symbols.length) return res.status(400).json({ error: 'symbols required' });

  const data = {}, errors = {};
  const queue = [...symbols];
  const worker = async () => {
    while (queue.length) {
      const s = queue.shift();
      try { data[s] = await fetchOne(s, range); } catch (e) { errors[s] = String(e.message || e); }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));

  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=600');
  res.status(200).json({ data, errors });
}
