// Vercel serverless function: current constituents of an NSE index, from NSE's official CSV.
// GET /api/universe?index=largemidcap250  →  { index, name, symbols: [...], source, fetchedAt }

export const INDEXES = {
  largemidcap250: { name: 'Nifty LargeMidcap 250', file: 'ind_niftylargemidcap250list.csv' },
  nifty500: { name: 'Nifty 500', file: 'ind_nifty500list.csv' },
  nifty200: { name: 'Nifty 200', file: 'ind_nifty200list.csv' },
  nifty100: { name: 'Nifty 100', file: 'ind_nifty100list.csv' },
  midcap150: { name: 'Nifty Midcap 150', file: 'ind_niftymidcap150list.csv' },
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

function parse(csv) {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const iSym = head.indexOf('symbol'), iSer = head.indexOf('series');
  if (iSym < 0) throw new Error('unexpected file format');
  return lines.slice(1)
    .map((l) => l.split(','))
    .filter((c) => c[iSym] && (iSer < 0 || (c[iSer] || '').trim() === 'EQ'))
    .map((c) => c[iSym].trim().toUpperCase());
}

export default async function handler(req, res) {
  const key = INDEXES[req.query.index] ? req.query.index : 'largemidcap250';
  const { name, file } = INDEXES[key];
  const sources = [
    `https://nsearchives.nseindia.com/content/indices/${file}`,
    `https://www.niftyindices.com/IndexConstituent/${file}`,
    `https://archives.nseindia.com/content/indices/${file}`,
  ];
  const errors = [];
  for (const url of sources) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/csv,*/*', Referer: 'https://www.nseindia.com/' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const symbols = parse(await r.text());
      if (symbols.length < 20) throw new Error(`only ${symbols.length} rows`);
      res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).json({ index: key, name, symbols, source: new URL(url).host, fetchedAt: new Date().toISOString() });
    } catch (e) {
      errors.push(`${new URL(url).host}: ${e.message}`);
    }
  }
  res.status(502).json({ error: `NSE list unavailable (${errors.join('; ')})` });
}
