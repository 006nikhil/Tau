import React, { useMemo } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts';
import { CircleDollarSign, Coins, Plus, Sparkles, TrendingDown, Waves } from 'lucide-react';
import Dial from './Dial.jsx';
import { Stat, rupee, pct, days, compact, CarChip, tone, Empty } from './ui.jsx';
import { sipReadiness } from '../lib/strategy.js';

export default function Dashboard({ sm, cars, scan, openSymbols, act }) {
  const { S, L, rows } = sm;

  const ready = rows.filter((r) => r.s.ready);
  const sipBuy = rows.filter((r) => r.p.mode === 'sip' && sipReadiness(r.s, cars[r.p.symbol], S).ready);
  const eligible = rows.filter((r) => r.s.sipEligible).sort((a, b) => a.s.plPct - b.s.plPct);
  const picks = useMemo(() => (scan?.rows || [])
    .filter((r) => r.status === 'Bull' && !openSymbols.includes(r.symbol))
    .sort((a, b) => a.ltp - b.ltp)
    .slice(0, 3), [scan, openSymbols]);

  const alloc = [
    { k: 'Active', v: sm.deployedActive, c: '#6fd6a0' },
    { k: 'In SIP', v: sm.deployedSip, c: '#7eb6ff' },
    { k: 'SIP reserve', v: L.reserveCash, c: '#7eb6ff55' },
    { k: 'Free cash', v: Math.max(0, L.freeCash), c: 'var(--free)' },
  ];
  const allocTotal = alloc.reduce((a, b) => a + b.v, 0) || 1;
  const months = Object.entries(sm.byMonth).sort().slice(-12).map(([m, v]) => ({ m: new Date(m + '-01').toLocaleDateString('en-IN', { month: 'short' }), v }));
  const noCapital = sm.deposits === 0;

  if (noCapital && rows.length === 0) {
    return (
      <div className="card">
        <Empty icon={CircleDollarSign} title="Start with your strategy capital"
          body={`Tau divides it into ${S.slots} equal slots. Every buy is one slot, every SIP tranche is a tenth of the slot it belongs to.`}
          action={<button className="btn-primary" onClick={act.capital}><Plus size={16} />Add capital</button>} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      {/* Dial + allocation */}
      <div className="card min-w-0 p-5">
        <Dial rows={rows} slots={S.slots} settings={S} equity={sm.equityMTM} cagr={sm.cagrMTM} onPick={act.detail} />
        <div className="mt-5">
          <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
            {alloc.map((a) => a.v > 0 && <div key={a.k} style={{ width: `${(a.v / allocTotal) * 100}%`, background: a.c }} />)}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
            {alloc.map((a) => (
              <div key={a.k} className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.c }} />
                <span className="muted">{a.k}</span>
                <span className="num ml-auto">{compact(a.v)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-4 text-sm">
          <div><div className="muted">Slot size</div><div className="display num text-lg font-semibold">{rupee(L.slotSize)}</div></div>
          <div><div className="muted">SIP tranche</div><div className="display num text-lg font-semibold">{rupee(L.sipTranche)}</div></div>
        </div>
      </div>

      <div className="min-w-0 space-y-4">
        {/* Today */}
        <div className="card">
          <div className="flex items-center justify-between px-5 pb-2 pt-5">
            <h2 className="text-xl font-semibold">Today</h2>
            <span className="text-sm muted">{ready.length + sipBuy.length + eligible.length + (sm.slotsFree && picks.length ? 1 : 0)} things to look at</span>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {ready.map(({ p, s }) => (
              <Action key={`r${p.id}`} icon={Sparkles} color="text-tau" title={`Book ${p.symbol}`}
                body={`${pct(s.plPct)} is past the ${S.targetPct}% target${p.mode === 'sip' ? ' on its SIP average' : ''}`}
                btn={<button className="btn-gain" onClick={() => act.sell(p)}>Book</button>} />
            ))}
            {sipBuy.map(({ p, s }) => (
              <Action key={`s${p.id}`} icon={Waves} color="text-sip" title={`Average ${p.symbol}`}
                body={s.sipCount ? `CAR still buy and up ${pct(((s.ltp / s.lastSipPrice) - 1) * 100, 1)} on the last SIP. Add ${rupee(s.sipAmount)}, tranche ${s.sipCount + 1}` : `CAR says buy. Add ${rupee(s.sipAmount)}, first tranche`}
                btn={<button className="btn-sip" onClick={() => act.sip(p)}>Add SIP</button>} />
            ))}
            {eligible.map(({ p, s }) => (
              <Action key={`e${p.id}`} icon={TrendingDown} color="text-loss" title={`${p.symbol} is down ${pct(-s.plPct, 1, false)}`}
                body={`Past the −${S.sipTriggerPct}% soft cap. Move to SIP and start tracking CAR`}
                btn={<button className="btn-ghost" onClick={() => act.moveSip(p)}>Move to SIP</button>} />
            ))}
            {sm.slotsFree > 0 && picks.length > 0 && (
              <div className="px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.04] text-gain"><Coins size={17} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{sm.slotsFree} free slot{sm.slotsFree > 1 ? 's' : ''}</div>
                    <div className="text-sm muted">Screener picks in a bull run you don't hold</div>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {picks.map((r) => (
                    <button key={r.symbol} onClick={() => act.buy({ symbol: r.symbol, ltp: r.ltp })}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-gain/40">
                      <div className="flex items-center justify-between"><span className="font-semibold">{r.symbol}</span><span className="num text-sm">{r.ltp?.toFixed(2)}</span></div>
                      <div className="mt-0.5 text-xs muted">{pct(r.diff200, 1)} above 200 DMA</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {ready.length + sipBuy.length + eligible.length === 0 && !(sm.slotsFree > 0 && picks.length) && (
              <div className="px-5 pb-5 pt-2 text-sm muted">
                {sm.slotsFree > 0 ? 'Nothing to book or average. Run the screener to fill free slots.' : 'Nothing to book or average. All slots are working.'}
              </div>
            )}
          </div>
        </div>

        {/* Performance */}
        <div className="card p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold">Performance</h2>
            <span className="text-sm muted">{sm.trades} trade{sm.trades === 1 ? '' : 's'} booked</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
            <Stat label="Booked, net" value={rupee(sm.bookedNet)} valueClass={tone(sm.bookedNet)} sub="after charges and tax" />
            <Stat label="Self-dividend paid" value={rupee(L.paidOut)} sub="taken out of the strategy" />
            <Stat label="Compounded" value={rupee(L.compounded)} sub="added to slot capital" />
            <Stat label="SIP reserve" value={rupee(L.reserveCash)} sub={S.split.reserveCapPct ? `cap ${rupee((L.capitalBase * S.split.reserveCapPct) / 100)}` : 'no cap'} />
            <Stat label="Average hold" value={days(sm.avgHold)} />
            <Stat label="Average profit" value={pct(sm.avgNetPct)} valueClass={tone(sm.avgNetPct)} sub={sm.avgNet != null ? `${rupee(sm.avgNet)} per trade, net` : null} />
            <Stat label="Average SIP recovery" value={days(sm.avgSipRecovery)} sub={sm.sipRecoveries ? `${sm.sipRecoveries} recovered` : sm.openSipAvgDays != null ? `open ones: ${days(sm.openSipAvgDays)} so far` : 'none yet'} />
            <Stat label="Unrealised" value={rupee(sm.unrealised)} valueClass={tone(sm.unrealised)} />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4 text-sm sm:grid-cols-4">
            <Mini k="CAGR, booked only" v={sm.cagrBooked == null ? '—' : pct(sm.cagrBooked * 100, 1)} />
            <Mini k="Capital deployed" v={pct(sm.utilisation * 100, 0, false)} />
            <Mini k="Tax set aside" v={rupee(L.taxSetAside)} />
            <Mini k="Charges paid" v={rupee(sm.chargesPaid)} />
          </div>
          {months.length > 0 && (
            <div className="mt-5 h-36">
              <ResponsiveContainer>
                <BarChart data={months} margin={{ top: 4, right: 0, left: -18, bottom: 0 }}>
                  <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fill: '#71717a', fontSize: 11 }} />
                  <YAxis tickLine={false} axisLine={false} tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v)} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: '#13231e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12 }} formatter={(v) => [rupee(v), 'Booked, net']} />
                  <Bar dataKey="v" radius={[6, 6, 0, 0]}>{months.map((m, i) => <Cell key={i} fill={m.v >= 0 ? '#6fd6a0' : '#f27d72'} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Action({ icon: Icon, color, title, body, btn }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.04] ${color}`}><Icon size={17} /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="text-sm leading-snug muted">{body}</div>
      </div>
      {btn}
    </div>
  );
}
const Mini = ({ k, v }) => <div><div className="muted">{k}</div><div className="num mt-0.5 font-medium">{v}</div></div>;
