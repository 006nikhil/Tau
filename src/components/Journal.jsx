import React from 'react';
import { Plus, BookOpen, Trash2 } from 'lucide-react';
import { fmtDate, pct, price, rupee, tone, Empty } from './ui.jsx';

export default function Journal({ state, sm, act, onDeleteCapital }) {
  const closed = (state.positions || []).filter((p) => p.status === 'closed' && p.exit)
    .sort((a, b) => (a.exit.date < b.exit.date ? 1 : -1));
  const events = (state.capitalEvents || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const fys = Object.entries(sm.byFY).sort().reverse();
  const S = sm.S;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="card overflow-hidden">
        <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
          <h2 className="text-xl font-semibold">Booked trades</h2>
          <span className="text-sm muted">{closed.length}</span>
        </div>
        {!closed.length ? <Empty icon={BookOpen} title="Nothing booked yet" body={`Trades land here when you book them at ${S.targetPct}% or more.`} /> : (
          <div className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
            {closed.map((p) => {
              const x = p.exit, sp = x.split || sm.L.exits[p.id] || {};
              return (
                <button key={p.id} onClick={() => act.detail(p)} className="block w-full px-5 py-3.5 text-left transition hover:bg-white/[0.02]">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{p.symbol}</span>
                    {x.sipDays != null && <span className="chip bg-sip-soft text-sip">via SIP, {x.sipDays} d</span>}
                    {x.long && <span className="chip bg-white/[0.05] text-zinc-400">LTCG</span>}
                    <span className={`display num ml-auto font-semibold ${tone(x.net)}`}>{rupee(x.net)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-sm muted">
                    <span className="num">{price(x.avgPrice)} to {price(x.price)}, {x.days} d, sold {fmtDate(x.date)}</span>
                    <span className={`num ml-auto ${tone(x.netPct)}`}>{pct(x.netPct)} net</span>
                  </div>
                  {x.net > 0 && (
                    <div className="mt-2 flex gap-3 text-xs">
                      <span className="text-tau">Dividend {rupee(sp.dividend)}</span>
                      <span className="text-gain">Compound {rupee(sp.compound)}</span>
                      {sp.reserve > 0 && <span className="text-sip">Reserve {rupee(sp.reserve)}</span>}
                      <span className="ml-auto muted">tax {rupee(x.tax)}, charges {rupee(x.chargesTotal)}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div className="space-y-4">
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h2 className="text-xl font-semibold">Capital</h2>
            <button className="btn-ghost !py-1.5" onClick={act.capital}><Plus size={15} />Add</button>
          </div>
          <div className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
            {events.map((e) => (
              <div key={e.id} className="group flex items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <div>{e.type === 'deposit' ? 'Added' : 'Withdrew'}{e.note ? `: ${e.note}` : ''}</div>
                  <div className="text-xs muted">{fmtDate(e.date)}</div>
                </div>
                <span className={`num ml-auto font-medium ${e.type === 'deposit' ? 'text-gain' : 'text-loss'}`}>{e.type === 'deposit' ? '+' : '−'}{rupee(e.amount)}</span>
                <button className="text-zinc-600 opacity-0 transition hover:text-loss group-hover:opacity-100 focus:opacity-100" aria-label="Delete entry" onClick={() => onDeleteCapital(e.id)}><Trash2 size={14} /></button>
              </div>
            ))}
            {!events.length && <p className="px-5 py-5 text-sm muted">No capital recorded.</p>}
          </div>
        </section>

        <section className="card p-5">
          <h2 className="text-xl font-semibold">Tax by financial year</h2>
          <p className="mt-1 text-xs muted">Per-trade tax is estimated at {S.tax.stcgPct}% STCG / {S.tax.ltcgPct}% LTCG + {S.tax.cessPct}% cess. The ₹1.25 L LTCG exemption is applied here, once per year.</p>
          {!fys.length ? <p className="mt-3 text-sm muted">No booked trades yet.</p> : fys.map(([fy, o]) => {
            const ltcgRelief = Math.min(Math.max(o.ltcg, 0), S.tax.ltcgExemption) * (S.tax.ltcgPct / 100) * (1 + S.tax.cessPct / 100);
            return (
              <div key={fy} className="mt-4 rounded-xl bg-white/[0.03] p-3 text-sm">
                <div className="flex justify-between font-medium"><span>{fy}</span><span className="num">{o.trades} trades</span></div>
                <div className="mt-2 grid grid-cols-2 gap-y-1">
                  <span className="muted">STCG</span><span className="num text-right">{rupee(o.stcg)}</span>
                  <span className="muted">LTCG</span><span className="num text-right">{rupee(o.ltcg)}</span>
                  <span className="muted">Estimated tax</span><span className="num text-right">{rupee(o.tax - ltcgRelief)}</span>
                  <span className="muted">Net booked</span><span className={`num text-right ${tone(o.net)}`}>{rupee(o.net + ltcgRelief)}</span>
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
