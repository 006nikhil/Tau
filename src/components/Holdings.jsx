import React, { useState } from 'react';
import { MoreHorizontal, Plus, Waves, Briefcase } from 'lucide-react';
import { CarChip, pct, price, rupee, tone, Empty, Segmented, days } from './ui.jsx';

export default function Holdings({ sm, cars, act }) {
  const { rows, S } = sm;
  const [sort, setSort] = useState('target');
  const sorter = {
    target: (a, b) => (a.s.toTarget ?? 99) - (b.s.toTarget ?? 99),
    pl: (a, b) => (b.s.plPct ?? -99) - (a.s.plPct ?? -99),
    age: (a, b) => b.s.days - a.s.days,
  }[sort];
  const active = rows.filter((r) => r.p.mode !== 'sip').sort(sorter);
  const sip = rows.filter((r) => r.p.mode === 'sip').sort((a, b) => {
    const ab = cars[a.p.symbol]?.signal === 'BUY' ? 0 : 1, bb = cars[b.p.symbol]?.signal === 'BUY' ? 0 : 1;
    return ab - bb || sorter(a, b);
  });

  if (!rows.length) {
    return <div className="card"><Empty icon={Briefcase} title="No open positions" body="Pick a stock from the screener or record a buy you've already made." action={<button className="btn-primary" onClick={() => act.buy()}><Plus size={16} />Record a buy</button>} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={sort} onChange={setSort} options={[{ value: 'target', label: 'Nearest target' }, { value: 'pl', label: 'P&L' }, { value: 'age', label: 'Oldest' }]} />
        <button className="btn-primary" onClick={() => act.buy()}><Plus size={16} />Buy</button>
      </div>

      <Section title="Active" count={active.length} sub={`${rupee(sm.deployedActive)} invested`}>
        {active.length ? active.map((r) => <HoldingRow key={r.p.id} r={r} S={S} car={cars[r.p.symbol]} act={act} />)
          : <p className="px-5 py-6 text-sm muted">No active positions.</p>}
      </Section>

      <Section title="SIP" count={sip.length} accent="text-sip" sub={sip.length ? `${rupee(sm.deployedSip)} invested, reserve ${rupee(sm.L.reserveCash)}` : 'Stocks you are averaging into'}>
        {sip.length ? sip.map((r) => <HoldingRow key={r.p.id} r={r} S={S} car={cars[r.p.symbol]} act={act} />)
          : <p className="px-5 py-6 text-sm muted">Nothing in SIP. A position shows a "Move to SIP" button once it falls {S.sipTriggerPct}% below its average.</p>}
      </Section>
    </div>
  );
}

function Section({ title, count, sub, accent = 'text-zinc-100', children }) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-baseline gap-3 px-5 pb-3 pt-5">
        <h2 className={`text-xl font-semibold ${accent}`}>{title}</h2>
        <span className="num text-sm muted">{count}</span>
        <span className="ml-auto truncate text-sm muted">{sub}</span>
      </div>
      <div className="divide-y divide-white/[0.05] border-t border-white/[0.05]">{children}</div>
    </section>
  );
}

function HoldingRow({ r, S, car, act }) {
  const { p, s } = r;
  const isSip = p.mode === 'sip';
  const carBuy = car?.signal === 'BUY';
  return (
    <div className={`px-5 py-3.5 ${s.ready ? 'bg-tau-soft' : isSip && carBuy ? 'bg-sip-soft' : ''}`}>
      <div className="flex items-start gap-3">
        <button className="min-w-0 flex-1 text-left" onClick={() => act.detail(p)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="display text-[17px] font-semibold">{p.symbol}</span>
            <CarChip car={car} />
            {isSip && s.sipCount > 0 && <span className="chip bg-sip-soft text-sip">{s.sipCount} SIP{s.sipCount > 1 ? 's' : ''}</span>}
          </div>
          <div className="num mt-0.5 text-sm muted">
            {s.qty} @ {price(s.avgPrice)}, {days(s.days)}{isSip && s.sipStart ? `, ${days(Math.round((Date.now() - new Date(s.sipStart)) / 864e5))} in SIP` : ''}
          </div>
        </button>
        <div className="text-right">
          <div className={`display num text-xl font-semibold leading-tight ${tone(s.plPct)}`}>{pct(s.plPct)}</div>
          <div className="num text-sm muted">{price(s.ltp)}</div>
        </div>
      </div>
      <Progress pl={s.plPct} target={S.targetPct} trigger={S.sipTriggerPct} sip={isSip} />
      <div className="mt-1.5 flex items-center justify-between text-xs muted">
        <span className="num">{s.toTarget != null ? (s.ready ? 'Target reached' : `${pct(s.toTarget, 1, false)} to target ${price(s.target)}`) : `Target ${price(s.target)}`}</span>
        <span className="num">{rupee(s.pl)}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-2 [&_.btn]:!py-1.5">
        <button className={s.ready ? 'btn-gain' : 'btn-ghost'} onClick={() => act.sell(p)}>Book</button>
        {isSip && <button className={carBuy ? 'btn-sip' : 'btn-ghost'} onClick={() => act.sip(p)}><Waves size={15} />SIP {rupee(s.sipAmount)}</button>}
        {!isSip && s.sipEligible && <button className="btn-ghost text-sip" onClick={() => act.moveSip(p)}>Move to SIP</button>}
        <button className="btn-ghost ml-auto !px-2.5" aria-label="Details" onClick={() => act.detail(p)}><MoreHorizontal size={16} /></button>
      </div>
    </div>
  );
}

/** Bar from −trigger … 0 … +target. Zero sits at the boundary. */
function Progress({ pl, target, trigger, sip }) {
  const span = trigger + target;
  const zero = (trigger / span) * 100;
  const v = pl == null ? 0 : Math.max(-trigger, Math.min(target, pl));
  const pos = v >= 0;
  const w = (Math.abs(v) / span) * 100;
  return (
    <div className="relative mt-3 h-1.5 rounded-full" style={{ background: "var(--track)" }}>
      <div className="absolute top-[-3px] h-3 w-px bg-zinc-400/50" style={{ left: `${zero}%` }} />
      <div className="absolute right-0 top-[-3px] h-3 w-px bg-tau/70" />
      <div className="absolute h-full rounded-full" style={{
        left: pos ? `${zero}%` : `${zero - w}%`, width: `${w}%`,
        background: pos ? (sip ? '#7eb6ff' : '#6fd6a0') : '#f27d72',
      }} />
    </div>
  );
}
