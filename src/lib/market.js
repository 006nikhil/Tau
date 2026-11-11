// Market data client: talks to /api/chart, turns raw series into indicators.
import { car, completedBars, dmadma } from './strategy.js';

const CACHE_KEY = 'tau.market.v1';

function loadCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
}
function saveCache(c) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch { /* storage full or blocked */ }
}

export const marketCache = loadCache(); // { quotes: {SYM:{ltp,prev,at}}, scan: {at, rows}, car: {SYM:{...,at}} }
marketCache.quotes ||= {};
marketCache.car ||= {};

async function fetchBatch(symbols, range = '2y') {
  const r = await fetch(`/api/chart?symbols=${encodeURIComponent(symbols.join(','))}&range=${range}`);
  if (!r.ok) throw new Error(`Price service returned ${r.status}`);
  return r.json();
}

/** Fetch many symbols in batches of 25, 3 batches in flight. onProgress(done,total). */
export async function fetchSeries(symbols, { onProgress, range = '2y' } = {}) {
  const uniq = [...new Set(symbols)];
  const batches = [];
  for (let i = 0; i < uniq.length; i += 25) batches.push(uniq.slice(i, i + 25));
  const out = {}, errors = {};
  let done = 0;
  const q = [...batches];
  const worker = async () => {
    while (q.length) {
      const b = q.shift();
      try {
        const j = await fetchBatch(b, range);
        Object.assign(out, j.data || {}); Object.assign(errors, j.errors || {});
      } catch (e) { b.forEach((s) => (errors[s] = e.message)); }
      done += b.length; onProgress?.(Math.min(done, uniq.length), uniq.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { data: out, errors };
}

const toBars = (s) => s.t.map((t, i) => ({ t, c: s.c[i], h: s.h[i] }));

/** Analyse one symbol's series → { ltp, prev, dm (DMADMA), car (CAR) } */
export function analyse(series, band) {
  const bars = completedBars(toBars(series));
  const closes = bars.map((b) => b.c);
  return {
    ltp: series.ltp, prev: series.prev, name: series.name,
    dm: dmadma(closes, series.ltp, band),
    car: car(bars),
  };
}

/** Refresh holdings: live price + CAR for each symbol. */
export async function refreshHoldings(symbols) {
  if (!symbols.length) return { quotes: {}, cars: {}, errors: {} };
  const { data, errors } = await fetchSeries(symbols);
  const quotes = {}, cars = {};
  const at = Date.now();
  Object.entries(data).forEach(([s, ser]) => {
    const a = analyse(ser);
    quotes[s] = { ltp: a.ltp, prev: a.prev, at };
    cars[s] = { ...a.car, at };
  });
  Object.assign(marketCache.quotes, quotes);
  Object.assign(marketCache.car, cars);
  saveCache(marketCache);
  return { quotes, cars, errors };
}

/** Run the DMADMA screener over the universe. */
export async function runScan(universe, band, onProgress) {
  const { data, errors } = await fetchSeries(universe, { onProgress });
  const rows = Object.entries(data).map(([s, ser]) => {
    const a = analyse(ser, band);
    return { symbol: s, name: a.name, ltp: a.ltp, prev: a.prev, ...a.dm, car: a.car };
  });
  const at = Date.now();
  rows.forEach((r) => {
    marketCache.quotes[r.symbol] = { ltp: r.ltp, prev: r.prev, at };
    marketCache.car[r.symbol] = { ...r.car, at };
  });
  const result = { at, rows, errors };
  if (rows.length) { marketCache.scan = result; saveCache(marketCache); }
  return result;
}

export function isMarketHours(now = Date.now()) {
  const ist = new Date(now + 5.5 * 3600000);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const dow = ist.getUTCDay();
  return dow >= 1 && dow <= 5 && mins >= 555 && mins < 935;
}
