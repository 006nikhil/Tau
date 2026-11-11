import React, { useMemo, useState } from 'react';
import { RefreshCw, Search, Radar, Loader2 } from 'lucide-react';
import { CarChip, pct, price, rupee, Segmented, Empty } from './ui.jsx';
import { fetchSeries, analyse } from '../lib/market.js';

export default function Screener({ scan, scanning, progress, onScan, openSymbols, slotSize, settings, act, universeSize }) {
  const [view, setView] = useState('Bull');
  const [sort, setSort] = useState('price');
  const [hideHeld, setHideHeld] = useState(true);
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const c = { Bull: 0, Bear: 0, Unconfirmed: 0, NoData: 0 };
    (scan?.rows || []).forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return c;
  }, [scan]);

  const list = useMemo(() => {
    let r = (scan?.rows || []).filter((x) => x.status === view);
    if (hideHeld) r = r.filter((x) => !openSymbols.includes(x.symbol));
    if (q) r = r.filter((x) => x.symbol.includes(q.toUpperCase()));
    const f = {
      price: (a, b) => a.ltp - b.ltp,
      near: (a, b) => Math.abs(a.diff200) - Math.abs(b.diff200),
      far: (a, b) => Math.abs(b.diff200) - Math.abs(a.diff200),
    }[sort];
    return r.sort(f);
  }, [scan, view, hideHeld, q, sort, openSymbols]);

  const age = scan?.at ? Math.round((Date.now() - scan.at) / 60000) : null;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold">DMADMA screener</h2>
            <p className="mt-1 text-sm muted">
              A stock is in a bull run when its price is above the 50, 100 and 200-day averages and no more than {settings.bull.maxPct}% above the 200-day. Scans {universeSize} stocks.
            </p>
          </div>
          <button className="btn-primary" onClick={onScan} disabled={scanning}>
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {scanning ? `Scanning ${progress.done}/${progress.total}` : 'Run scan'}
          </button>
        </div>
        {scanning && <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-tau transition-all" style={{ width: `${(progress.done / (progress.total || 1)) * 100}%` }} /></div>}
        {scan && (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {[['Bull', 'Bull run', 'text-gain'], ['Unconfirmed', 'Unconfirmed', 'text-zinc-300'], ['Bear', 'Bear run', 'text-loss']].map(([k, l, c]) => (
              <button key={k} onClick={() => setView(k)} className={`rounded-xl border px-3 py-2 transition ${view === k ? 'border-white/20 bg-white/[0.06]' : 'border-white/[0.06]'}`}>
                <span className={`display num mr-1.5 font-semibold ${c}`}>{counts[k] || 0}</span><span className="muted">{l}</span>
              </button>
            ))}
            <span className="ml-auto text-xs muted">
              {age != null && (age < 1 ? 'Updated just now' : age < 60 ? `Updated ${age} min ago` : `Updated ${new Date(scan.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`)}
              {scan.errors && Object.keys(scan.errors).length > 0 && `, ${Object.keys(scan.errors).length} without data`}
            </span>
          </div>
        )}
      </div>

      {!scan ? (
        <div className="card"><Empty icon={Radar} title="No scan yet" body="Run the scan to pull a year of daily prices for every stock in your universe. It takes about half a minute." action={<button className="btn-primary" onClick={onScan} disabled={scanning}>Run scan</button>} /></div>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.05] px-5 py-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input className="input !py-2 pl-9 sm:w-48" placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Segmented value={sort} onChange={setSort} options={[{ value: 'price', label: 'Price' }, { value: 'near', label: 'Near 200 DMA' }, { value: 'far', label: 'Far' }]} />
            <label className="ml-auto flex items-center gap-2 text-sm muted">
              <input type="checkbox" checked={hideHeld} onChange={(e) => setHideHeld(e.target.checked)} className="accent-[#d9b25f]" />Hide stocks I hold
            </label>
          </div>
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_1.6fr_1fr_auto] gap-3 px-5 py-2 text-xs muted md:grid">
            <span>Stock</span><span className="text-right">Price</span><span className="text-right">vs 200 DMA</span><span className="text-right">50 / 100 / 200 DMA</span><span className="text-right">One slot</span><span className="w-16" />
          </div>
          <div className="divide-y divide-white/[0.05]">
            {list.map((r) => {
              const qty = r.ltp ? Math.floor(slotSize / r.ltp) : 0;
              return (
                <div key={r.symbol} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-5 py-3 md:grid-cols-[1.4fr_1fr_1fr_1.6fr_1fr_auto]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><span className="font-semibold">{r.symbol}</span>{openSymbols.includes(r.symbol) && <span className="chip bg-tau-soft text-tau">held</span>}</div>
                    <div className="truncate text-xs muted md:hidden">{price(r.ltp)}, {pct(r.diff200, 1)} vs 200 DMA, {qty} shares per slot</div>
                  </div>
                  <span className="num hidden text-right md:block">{price(r.ltp)}</span>
                  <span className={`num hidden text-right md:block ${r.diff200 > 0 ? 'text-gain' : 'text-loss'}`}>{pct(r.diff200)}</span>
                  <span className="num hidden text-right text-sm muted md:block">{price(r.d50)} / {price(r.d100)} / {price(r.d200)}</span>
                  <span className="num hidden text-right text-sm md:block">{qty} for {rupee(qty * r.ltp)}</span>
                  <button className="btn-ghost w-16 !py-1.5" onClick={() => act.buy({ symbol: r.symbol, ltp: r.ltp })}>Buy</button>
                </div>
              );
            })}
            {!list.length && <p className="px-5 py-8 text-center text-sm muted">No stocks match.</p>}
          </div>
        </div>
      )}

      <CarLookup />
    </div>
  );
}

function CarLookup() {
  const [sym, setSym] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async (e) => {
    e.preventDefault();
    const s = sym.trim().toUpperCase(); if (!s) return;
    setBusy(true); setRes(null);
    try {
      const { data, errors } = await fetchSeries([s]);
      if (!data[s]) throw new Error(errors[s] || 'No data');
      setRes({ s, ...analyse(data[s]) });
    } catch (err) { setRes({ s, error: err.message }); }
    setBusy(false);
  };
  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold">Check CAR for any stock</h2>
      <p className="mt-1 text-sm muted">From the 52-week high onward, Tau keeps a running average of closing prices. "Buy" means that average has risen 9 sessions in a row: the stock is climbing out of its correction.</p>
      <form onSubmit={run} className="mt-4 flex gap-2">
        <input className="input uppercase sm:w-56" placeholder="NSE code" value={sym} onChange={(e) => setSym(e.target.value)} />
        <button className="btn-ghost" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : 'Check'}</button>
      </form>
      {res && (res.error ? <p className="mt-3 text-sm text-loss">{res.s}: {res.error}</p> : (
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div><div className="text-sm muted">Signal</div><div className="mt-1"><CarChip car={res.car} /></div></div>
          <div><div className="text-sm muted">52-week high</div><div className="num mt-1">{price(res.car.high)} <span className="muted">({res.car.highDate})</span></div></div>
          <div><div className="text-sm muted">Running average</div><div className="num mt-1">{price(res.car.cumAvg)} <span className="muted">vs {price(res.ltp)} now</span></div></div>
          <div><div className="text-sm muted">DMADMA</div><div className="mt-1">{res.dm.status === 'Bull' ? 'Bull run' : res.dm.status === 'Bear' ? 'Bear run' : res.dm.status}, {pct(res.dm.diff200, 1)}</div></div>
        </div>
      ))}
    </div>
  );
}
