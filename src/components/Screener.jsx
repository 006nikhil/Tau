import React, { useMemo, useState } from 'react';
import { RefreshCw, Search, Radar, Loader2, ChevronDown } from 'lucide-react';
import { CarChip, pct, price, rupee, Segmented, Empty, fmtDate } from './ui.jsx';
import { sipReadiness } from '../lib/strategy.js';
import { fetchSeries, analyse } from '../lib/market.js';
import UniverseUpdater from './UniverseUpdater.jsx';

export default function Screener({ scan, scanning, progress, onScan, openSymbols, slotSize, settings, act, universe, onSettings, rows }) {
  const [showOthers, setShowOthers] = useState(false);
  const [sort, setSort] = useState('price');
  const [hideHeld, setHideHeld] = useState(true);
  const [q, setQ] = useState('');

  const counts = useMemo(() => {
    const c = { Bull: 0, Bear: 0, Unconfirmed: 0, NoData: 0 };
    (scan?.rows || []).forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return c;
  }, [scan]);

  const list = useMemo(() => {
    let r = (scan?.rows || []).filter((x) => x.status === 'Bull');
    if (hideHeld) r = r.filter((x) => !openSymbols.includes(x.symbol));
    if (q) r = r.filter((x) => x.symbol.includes(q.toUpperCase()));
    const f = {
      price: (a, b) => a.ltp - b.ltp,
      near: (a, b) => Math.abs(a.diff200) - Math.abs(b.diff200),
      far: (a, b) => Math.abs(b.diff200) - Math.abs(a.diff200),
    }[sort];
    return r.sort(f);
  }, [scan, hideHeld, q, sort, openSymbols]);

  const age = scan?.at ? Math.round((Date.now() - scan.at) / 60000) : null;

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold">DMA screener</h2>
            <p className="mt-1 text-sm muted">
              A stock is in a bull run when its price is above the 50, 100 and 200-day averages and no more than {settings.bull.maxPct}% above the 200-day.
            </p>
          </div>
          <button className="btn-primary" onClick={onScan} disabled={scanning}>
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            {scanning ? `Scanning ${progress.done}/${progress.total}` : 'Run scan'}
          </button>
        </div>
        <div className="mt-3"><UniverseUpdater settings={settings} universe={universe} openSymbols={openSymbols} onSave={onSettings} /></div>
        {scanning && <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-tau transition-all" style={{ width: `${(progress.done / (progress.total || 1)) * 100}%` }} /></div>}
        {scan && (
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            <span><span className="display num text-lg font-semibold text-gain">{counts.Bull || 0}</span> <span className="muted">stocks in a bull run</span></span>
            <span className="text-xs muted sm:ml-auto">
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
                    <div className="truncate text-xs muted md:hidden">{price(r.ltp)}, {pct(r.diff200, 1)} vs 200 DMA{qty > 0 ? `, ${qty} sh` : ''}</div>
                  </div>
                  <span className="num hidden text-right md:block">{price(r.ltp)}</span>
                  <span className={`num hidden text-right md:block ${r.diff200 > 0 ? 'text-gain' : 'text-loss'}`}>{pct(r.diff200)}</span>
                  <span className="num hidden text-right text-sm muted md:block">{price(r.d50)} / {price(r.d100)} / {price(r.d200)}</span>
                  <span className="num hidden text-right text-sm md:block">{qty} for {rupee(qty * r.ltp)}</span>
                  <button className="btn-ghost w-16 !py-1.5" onClick={() => act.buy({ symbol: r.symbol, ltp: r.ltp })}>Buy</button>
                </div>
              );
            })}
            {!list.length && <p className="px-5 py-8 text-center text-sm muted">{q ? 'No bull-run stocks match that filter.' : hideHeld ? 'No bull-run stocks you don\'t already hold.' : 'No stocks are in a bull run today.'}</p>}
          </div>
        </div>
      )}

      {scan && <OtherStocks rows={scan.rows} open={showOthers} onToggle={() => setShowOthers((v) => !v)} />}

      <CarLookup rows={rows} settings={settings} act={act} />
    </div>
  );
}

function OtherStocks({ rows, open, onToggle }) {
  const bear = rows.filter((r) => r.status === 'Bear').sort((a, b) => a.diff200 - b.diff200);
  const unc = rows.filter((r) => r.status === 'Unconfirmed').sort((a, b) => a.symbol.localeCompare(b.symbol));
  const Group = ({ title, list, hint }) => (
    <div className="px-5 py-4">
      <div className="text-sm font-medium">{title} <span className="num muted">({list.length})</span></div>
      <p className="mt-0.5 text-xs muted">{hint}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {list.map((r) => (
          <span key={r.symbol} className="chip bg-white/[0.04] text-zinc-300" title={`${price(r.ltp)}, ${pct(r.diff200, 1)} vs 200 DMA`}>
            {r.symbol} <span className={`num ${r.diff200 > 0 ? 'text-gain' : 'text-loss'}`}>{pct(r.diff200, 1)}</span>
          </span>
        ))}
        {!list.length && <span className="text-xs muted">None</span>}
      </div>
    </div>
  );
  return (
    <div className="card overflow-hidden">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="font-medium">Not buyable today</div>
          <div className="text-sm muted">{bear.length + unc.length} stocks in a bear run or unconfirmed. For reference only.</div>
        </div>
        <ChevronDown size={18} className={`shrink-0 text-zinc-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
          <Group title="Bear run" list={bear} hint="Below its 50, 100 and 200-day averages, and up to 10% under the 200-day." />
          <Group title="Unconfirmed" list={unc} hint="Mixed signals: neither bull nor bear by the DMA rules." />
        </div>
      )}
    </div>
  );
}

function CarLookup({ rows = [], settings, act }) {
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
      setRes({ s, ...analyse(data[s], settings.bull) });
    } catch (err) { setRes({ s, error: err.message }); }
    setBusy(false);
  };
  return (
    <div className="card p-5">
      <h2 className="text-xl font-semibold">Check CAR for any stock</h2>
      <p className="mt-1 text-sm muted">Tells you whether to add a SIP tranche, buy, or wait.</p>
      <form onSubmit={run} className="mt-4 flex gap-2">
        <input className="input uppercase sm:w-56" placeholder="NSE code" value={sym} onChange={(e) => setSym(e.target.value)} />
        <button className="btn-ghost" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : 'Check'}</button>
      </form>
      {res && (res.error ? <p className="mt-3 text-sm text-loss">{res.s}: {res.error}</p> : <CarVerdict res={res} rows={rows} settings={settings} act={act} />)}
    </div>
  );
}

/** Plain-language verdict: what CAR says and what to do about it, given how (or whether) you hold the stock. */
function CarVerdict({ res, rows, settings, act }) {
  const { s: symbol, car, dm, ltp } = res;
  const held = rows.find((r) => r.p.symbol === symbol);
  const stats = held ? { ...held.s, ltp, plPct: held.s.avgPrice ? ((ltp - held.s.avgPrice) / held.s.avgPrice) * 100 : null } : null;
  const isBuy = car.signal === 'BUY';
  const n = car.streak || 0;
  const above = car.cumAvg != null && ltp > car.cumAvg;
  const tooFresh = car.sessionsSinceHigh != null && car.sessionsSinceHigh < 10;

  // What CAR itself is saying
  let carLine;
  if (car.signal === 'NoData') carLine = 'Not enough price history to calculate CAR.';
  else if (tooFresh) carLine = `It made its 52-week high only ${car.sessionsSinceHigh} session${car.sessionsSinceHigh === 1 ? '' : 's'} ago, so there's no correction to recover from yet.`;
  else if (isBuy) carLine = 'The running average since the 52-week high has risen 9 sessions in a row. The correction looks over.';
  else if (above) carLine = `The running average has risen ${n} of the 9 sessions needed. Price is above it, so the count is still building: earliest buy signal in ${9 - n} session${9 - n === 1 ? '' : 's'} if it holds.`;
  else carLine = `The running average has risen ${n} of the 9 sessions needed. Price is below it, so the average will dip and the count starts over.`;

  // What to do
  let tone = 'wait', title, body, action = null;
  if (held && held.p.mode === 'sip') {
    const sr = sipReadiness(stats, car, settings);
    if (sr.ready) {
      tone = 'go'; title = 'Add a SIP tranche';
      body = sr.first ? `You hold ${symbol} in SIP and CAR says buy. This is the first tranche.` : `CAR is still buy, it's been a week since your last SIP, and price is at least ${settings.sipStepPct}% above it.`;
      action = <button className="btn-sip" onClick={() => act.sip(held.p)}>Add SIP {rupee(held.s.sipAmount)}</button>;
    } else {
      title = "Don't add yet";
      body = car.signal !== 'BUY' ? `You hold ${symbol} in SIP. Wait for CAR to say buy before adding the next ${rupee(held.s.sipAmount)}.` : `${sr.reason}.`;
    }
  } else if (held) {
    if (stats.plPct != null && stats.plPct <= -settings.sipTriggerPct) {
      tone = 'warn'; title = 'Move it to SIP first';
      body = `It's ${pct(stats.plPct, 1)} below your average, past the −${settings.sipTriggerPct}% soft cap. Move it to SIP, then add tranches when CAR says buy.`;
      action = <button className="btn-ghost text-sip" onClick={() => act.moveSip(held.p)}>Move to SIP</button>;
    } else {
      title = 'Hold for the target';
      body = `You hold ${symbol} as an active position (${pct(stats.plPct, 1)}). CAR only decides SIP buys. Sell at ${price(held.s.target)}.`;
    }
  } else if (dm.status === 'Bull') {
    tone = 'go'; title = 'Can be bought as a new entry';
    body = `It's in a bull run (${pct(dm.diff200, 1)} vs the 200-day average), so it qualifies on the screener. CAR doesn't apply to new entries.`;
    action = <button className="btn-primary" onClick={() => act.buy({ symbol, ltp })}>Buy</button>;
  } else {
    title = 'Not a buy';
    body = `It's ${dm.status === 'Bear' ? 'in a bear run' : 'not in a bull run'}, so it doesn't qualify as a new entry. CAR only matters for stocks you're averaging in SIP.`;
  }
  const box = { go: 'border-gain/40 bg-gain-soft', warn: 'border-sip/40 bg-sip-soft', wait: 'border-white/10 bg-white/[0.03]' }[tone];
  const head = { go: 'text-gain', warn: 'text-sip', wait: 'text-zinc-100' }[tone];

  return (
    <div className="mt-4 space-y-3">
      <div className={`rounded-2xl border p-4 ${box}`}>
        <div className="text-xs muted">{symbol}{held ? (held.p.mode === 'sip' ? ', in your SIP' : ', you hold this') : ''}</div>
        <div className={`display mt-0.5 text-lg font-semibold ${head}`}>{title}</div>
        <p className="mt-1 text-sm text-zinc-300">{body}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
      <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] px-4 py-3">
        <CarChip car={car} />
        <p className="text-sm text-zinc-300">{carLine}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div><div className="muted">52-week high</div><div className="num mt-0.5">{price(car.high)} <span className="muted">on {fmtDate(car.highDate)}</span></div></div>
        <div><div className="muted">Running average</div><div className="num mt-0.5">{price(car.cumAvg)} <span className="muted">vs {price(ltp)} now</span></div></div>
        <div><div className="muted">DMA</div><div className="mt-0.5">{dm.status === 'Bull' ? 'Bull run' : dm.status === 'Bear' ? 'Bear run' : dm.status === 'NoData' ? '—' : 'Unconfirmed'}, {pct(dm.diff200, 1)}</div></div>
      </div>
    </div>
  );
}
