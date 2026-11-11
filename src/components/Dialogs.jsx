import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Modal, Field, NumberInput, Row, rupee, price, pct, tone, fmtDate, CarChip, days } from './ui.jsx';
import { buyCharges, exitCalc, positionStats, splitProfit, todayISO, uid } from '../lib/strategy.js';

// ── Buy (new slot) ───────────────────────────────────────────────────────────
export function BuyDialog({ open, onClose, prefill, ctx, onSave }) {
  const { settings, slotSize, universe, openSymbols, freeCash } = ctx;
  const [symbol, setSymbol] = useState('');
  const [date, setDate] = useState(todayISO());
  const [px, setPx] = useState('');
  const [qty, setQty] = useState('');
  const [qtyTouched, setQtyTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSymbol(prefill?.symbol || ''); setPx(prefill?.ltp ? +prefill.ltp.toFixed(2) : '');
    setDate(todayISO()); setQty(''); setQtyTouched(false);
  }, [open, prefill]);

  useEffect(() => {
    if (!qtyTouched && px > 0) setQty(Math.max(1, Math.floor(slotSize / px)));
  }, [px, slotSize, qtyTouched]);

  const value = (qty || 0) * (px || 0);
  const ch = buyCharges(value, settings.charges);
  const sym = symbol.trim().toUpperCase();
  const dup = openSymbols.includes(sym);
  const valid = sym && px > 0 && qty > 0 && date;

  const save = () => {
    onSave({
      id: uid(), symbol: sym, status: 'open', mode: 'normal', createdAt: new Date().toISOString(),
      originalInvested: value,
      lots: [{ id: uid(), kind: 'entry', date, qty: Number(qty), price: Number(px), charges: ch.total, stt: ch.stt }],
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Buy into a slot" subtitle={`Slot size ${rupee(slotSize)} (capital ÷ ${settings.slots})`}
      footer={<><button className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button className="btn-primary flex-1" disabled={!valid} onClick={save}>Record buy</button></>}>
      <div className="space-y-3">
        <Field label="Stock (NSE code)">
          <input className="input uppercase" list="tau-universe" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="e.g. HDFCBANK" autoFocus={!prefill} />
          <datalist id="tau-universe">{universe.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Buy price"><NumberInput value={px} onChange={setPx} /></Field>
          <Field label="Quantity" hint={qtyTouched ? 'Edited by you' : 'Auto-filled to slot size'}>
            <NumberInput step="1" value={qty} onChange={(v) => { setQty(v); setQtyTouched(true); }} />
          </Field>
        </div>
        <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {dup && <div className="flex gap-2 rounded-xl bg-sip-soft p-3 text-sm text-sip"><AlertTriangle size={16} className="mt-0.5 shrink-0" />You already hold {sym}. This opens a separate slot.</div>}
        <div className="rounded-xl bg-white/[0.03] px-3 py-1">
          <Row k="Invested" v={rupee(value)} strong />
          <Row k="Buy charges" v={rupee(ch.total, 2)} />
          <Row k={`Target (+${settings.targetPct}%)`} v={px ? price(px * (1 + settings.targetPct / 100)) : '—'} />
          <Row k="First SIP tranche, if ever needed" v={rupee(value * settings.sipFraction)} />
          <Row k="Free cash after" v={<span className={tone(freeCash - value - ch.total)}>{rupee(freeCash - value - ch.total)}</span>} />
        </div>
      </div>
    </Modal>
  );
}

// ── Sell (book profit) ───────────────────────────────────────────────────────
export function SellDialog({ open, onClose, position, ctx, onSave }) {
  const { settings, quotes, ledger } = ctx;
  const [px, setPx] = useState('');
  const [date, setDate] = useState(todayISO());
  useEffect(() => {
    if (open && position) { setPx(quotes[position.symbol]?.ltp ? +quotes[position.symbol].ltp.toFixed(2) : ''); setDate(todayISO()); }
  }, [open, position, quotes]);
  const x = useMemo(() => (position && px > 0 ? exitCalc(position, { price: Number(px), date }, settings) : null), [position, px, date, settings]);
  if (!position) return null;
  const s = positionStats(position, null, settings);
  const sp = x ? splitProfit(x.net, settings.split, ledger.reserveCash, ledger.capitalBase) : null;
  const belowTarget = x && Number(px) < s.target;

  return (
    <Modal open={open} onClose={onClose} title={`Book ${position.symbol}`} subtitle={`${s.qty} shares, avg ${price(s.avgPrice)}${position.mode === 'sip' ? ', SIP average' : ''}`}
      footer={<><button className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button className="btn-gain flex-1" disabled={!x} onClick={() => { onSave({ ...x, split: sp }); onClose(); }}>Book profit</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sell price" hint={`Target ${price(s.target)}`}><NumberInput value={px} onChange={setPx} autoFocus /></Field>
          <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        {belowTarget && <div className="flex gap-2 rounded-xl bg-sip-soft p-3 text-sm text-sip"><AlertTriangle size={16} className="mt-0.5 shrink-0" />This is below the {settings.targetPct}% target.</div>}
        {x && (
          <>
            <div className="rounded-xl bg-white/[0.03] px-3 py-1">
              <Row k={`Gross (${pct(x.grossPct)})`} v={rupee(x.gross, 2)} />
              <Row k="Charges (buy + sell)" v={`−${rupee(x.chargesTotal, 2)}`} />
              <Row k={`${x.long ? 'LTCG' : 'STCG'} ${x.long ? settings.tax.ltcgPct : settings.tax.stcgPct}% + ${settings.tax.cessPct}% cess`} v={`−${rupee(x.tax, 2)}`} />
              <Row k={`Net (${pct(x.netPct)})`} v={<span className={tone(x.net)}>{rupee(x.net, 2)}</span>} strong className="border-t border-white/[0.06] mt-1 pt-2" />
              <Row k="Held" v={`${x.days} days${x.sipDays != null ? `, ${x.sipDays} in SIP` : ''}`} />
            </div>
            {x.net > 0 && sp && (
              <div>
                <div className="card-hd mb-2">Where the net profit goes</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <SplitBox label="Self-dividend" value={sp.dividend} cls="text-tau" />
                  <SplitBox label="Compounding" value={sp.compound} cls="text-gain" />
                  <SplitBox label="SIP reserve" value={sp.reserve} cls="text-sip" />
                </div>
                {settings.split.reserve > 0 && settings.split.reserveCapPct > 0 && sp.reserve < (x.net * settings.split.reserve) / 100 - 0.5 && (
                  <p className="mt-2 text-xs muted">Reserve is at its {settings.split.reserveCapPct}% cap, so the extra goes to compounding.</p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
const SplitBox = ({ label, value, cls }) => (
  <div className="rounded-xl bg-white/[0.03] px-2 py-2.5">
    <div className={`display num text-base font-semibold ${cls}`}>{rupee(value)}</div>
    <div className="text-[11px] muted">{label}</div>
  </div>
);

// ── SIP tranche ──────────────────────────────────────────────────────────────
export function SipDialog({ open, onClose, position, ctx, onSave }) {
  const { settings, quotes, cars, ledger } = ctx;
  const [px, setPx] = useState('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(todayISO());
  const [touched, setTouched] = useState(false);
  const s = position ? positionStats(position, null, settings) : null;
  useEffect(() => {
    if (open && position) { setPx(quotes[position.symbol]?.ltp ? +quotes[position.symbol].ltp.toFixed(2) : ''); setDate(todayISO()); setTouched(false); setQty(''); }
  }, [open, position, quotes]);
  useEffect(() => { if (s && !touched && px > 0) setQty(Math.max(1, Math.floor(s.sipAmount / px))); }, [px, touched, s?.sipAmount]); // eslint-disable-line
  if (!position) return null;
  const value = (qty || 0) * (px || 0);
  const ch = buyCharges(value, settings.charges);
  const newQty = s.qty + (qty || 0);
  const newAvg = newQty ? (s.buyValue + value) / newQty : 0;
  const c = cars[position.symbol];

  return (
    <Modal open={open} onClose={onClose} title={`SIP into ${position.symbol}`} subtitle={`Tranche ${s.sipCount + 1}, sized at 1/${Math.round(1 / settings.sipFraction)} of ${rupee(s.original)}`}
      footer={<><button className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button className="btn-sip flex-1" disabled={!(px > 0 && qty > 0)} onClick={() => {
        onSave({ id: uid(), kind: 'sip', date, qty: Number(qty), price: Number(px), charges: ch.total, stt: ch.stt });
        onClose();
      }}>Record SIP buy</button></>}>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm">
          <span className="muted">CAR signal today</span><CarChip car={c} />
        </div>
        {c?.signal !== 'BUY' && <div className="flex gap-2 rounded-xl bg-sip-soft p-3 text-sm text-sip"><AlertTriangle size={16} className="mt-0.5 shrink-0" />CAR hasn't confirmed the reversal yet. The method says wait for "buy".</div>}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price"><NumberInput value={px} onChange={setPx} /></Field>
          <Field label="Quantity" hint={touched ? 'Edited by you' : `Auto: ${rupee(s.sipAmount)}`}><NumberInput step="1" value={qty} onChange={(v) => { setQty(v); setTouched(true); }} /></Field>
        </div>
        <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <div className="rounded-xl bg-white/[0.03] px-3 py-1">
          <Row k="Amount" v={rupee(value)} strong />
          <Row k="New average" v={`${price(s.avgPrice)} → ${price(newAvg)}`} />
          <Row k="New target" v={price(newAvg * (1 + settings.targetPct / 100))} />
          <Row k="Paid from SIP reserve" v={rupee(Math.min(ledger.reserveCash, value + ch.total))} />
          {s.sipCount === 0 && <Row k="SIP clock starts" v={fmtDate(date)} />}
        </div>
      </div>
    </Modal>
  );
}

// ── Move to SIP ──────────────────────────────────────────────────────────────
export function MoveSipDialog({ open, onClose, position, ctx, onSave }) {
  if (!position) return null;
  const s = positionStats(position, ctx.quotes[position.symbol]?.ltp, ctx.settings);
  return (
    <Modal open={open} onClose={onClose} title={`Move ${position.symbol} to SIP`}
      footer={<><button className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button className="btn-sip flex-1" onClick={() => { onSave(); onClose(); }}>Move to SIP</button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-zinc-300">It moves to the SIP section. You add {sipWord(s.sipAmount)} each time CAR says "buy", and it exits at {ctx.settings.targetPct}% above the new average.</p>
        <div className="rounded-xl bg-white/[0.03] px-3 py-1">
          <Row k="Current P&L" v={<span className={tone(s.plPct)}>{pct(s.plPct)}</span>} />
          <Row k="Held for" v={days(s.days)} />
          <Row k="SIP tranche" v={rupee(s.sipAmount)} />
          <Row k="CAR today" v={<CarChip car={ctx.cars[position.symbol]} />} />
        </div>
        <p className="text-xs muted">The SIP recovery clock starts on your first SIP buy, not today.</p>
      </div>
    </Modal>
  );
}
const sipWord = (a) => rupee(a);

// ── Capital in / out ─────────────────────────────────────────────────────────
export function CapitalDialog({ open, onClose, onSave }) {
  const [type, setType] = useState('deposit');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setType('deposit'); setAmount(''); setDate(todayISO()); setNote(''); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add or withdraw capital" subtitle="Slot size recalculates from total capital"
      footer={<><button className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button className="btn-primary flex-1" disabled={!(amount > 0)} onClick={() => { onSave({ id: uid(), type, amount: Number(amount), date, note }); onClose(); }}>{type === 'deposit' ? 'Add capital' : 'Withdraw'}</button></>}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {['deposit', 'withdraw'].map((t) => (
            <button key={t} onClick={() => setType(t)} className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${type === t ? 'border-tau/60 bg-tau-soft text-tau' : 'border-white/[0.08] text-zinc-400'}`}>
              {t === 'deposit' ? 'Add capital' : 'Withdraw'}
            </button>
          ))}
        </div>
        <Field label="Amount (₹)"><NumberInput value={amount} onChange={setAmount} autoFocus /></Field>
        <Field label="Date"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Note (optional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ── Position detail ──────────────────────────────────────────────────────────
export function PositionDialog({ open, onClose, position, ctx, onUpdate, onDelete, onReopen }) {
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => setConfirmDel(false), [open]);
  if (!position) return null;
  const s = positionStats(position, ctx.quotes[position.symbol]?.ltp, ctx.settings);
  const c = ctx.cars[position.symbol];
  const removeLot = (id) => onUpdate({ ...position, lots: position.lots.filter((l) => l.id !== id) });
  return (
    <Modal open={open} onClose={onClose} wide title={position.symbol}
      subtitle={position.status === 'closed' ? `Closed ${fmtDate(position.exit.date)}` : position.mode === 'sip' ? 'In SIP' : 'Active'}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl bg-white/[0.03] px-3 py-1">
          <Row k="Quantity" v={s.qty} />
          <Row k="Average price" v={price(s.avgPrice)} />
          <Row k="Invested" v={rupee(s.buyValue)} />
          <Row k="Original slot" v={rupee(s.original)} />
          <Row k="Target" v={price(s.target)} />
        </div>
        <div className="rounded-xl bg-white/[0.03] px-3 py-1">
          {position.status === 'closed' ? (<>
            <Row k="Exit" v={`${price(position.exit.price)} on ${fmtDate(position.exit.date)}`} />
            <Row k="Net profit" v={<span className={tone(position.exit.net)}>{rupee(position.exit.net, 2)} ({pct(position.exit.netPct)})</span>} />
            <Row k="Held" v={`${position.exit.days} d`} />
            {position.exit.sipDays != null && <Row k="Time in SIP" v={`${position.exit.sipDays} d`} />}
          </>) : (<>
            <Row k="Last price" v={price(s.ltp)} />
            <Row k="P&L" v={<span className={tone(s.plPct)}>{rupee(s.pl)} ({pct(s.plPct)})</span>} />
            <Row k="Held" v={`${s.days} d`} />
            <Row k="CAR" v={<CarChip car={c} />} />
            {c?.highDate && <Row k="52-week high" v={`${price(c.high)} on ${fmtDate(c.highDate)}`} />}
          </>)}
        </div>
      </div>
      <div className="card-hd mb-2 mt-5">Buys</div>
      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        {position.lots.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).map((l) => (
          <div key={l.id} className="flex items-center gap-3 border-b border-white/[0.04] px-3 py-2.5 text-sm last:border-0">
            <span className={`chip ${l.kind === 'sip' ? 'bg-sip-soft text-sip' : 'bg-gain-soft text-gain'}`}>{l.kind === 'sip' ? 'SIP' : 'Entry'}</span>
            <span className="muted">{fmtDate(l.date)}</span>
            <span className="num ml-auto">{l.qty} × {price(l.price)}</span>
            <span className="num w-24 text-right">{rupee(l.qty * l.price)}</span>
            {position.status === 'open' && position.lots.length > 1 && (
              <button className="text-zinc-500 hover:text-loss" aria-label="Delete this buy" onClick={() => removeLot(l.id)}><Trash2 size={14} /></button>
            )}
          </div>
        ))}
      </div>
      <Field label="Notes"><textarea className="input mt-1 min-h-[70px]" defaultValue={position.notes || ''} onBlur={(e) => e.target.value !== (position.notes || '') && onUpdate({ ...position, notes: e.target.value })} /></Field>
      <div className="mt-5 flex flex-wrap gap-2">
        {position.status === 'closed' && <button className="btn-ghost" onClick={() => { onReopen(); onClose(); }}>Undo exit</button>}
        {position.status === 'open' && position.mode === 'sip' && position.lots.every((l) => l.kind !== 'sip') && (
          <button className="btn-ghost" onClick={() => { onUpdate({ ...position, mode: 'normal' }); onClose(); }}>Move back to active</button>
        )}
        {!confirmDel
          ? <button className="btn-ghost ml-auto text-loss" onClick={() => setConfirmDel(true)}><Trash2 size={14} />Delete</button>
          : <button className="btn ml-auto bg-loss text-ink-950" onClick={() => { onDelete(); onClose(); }}>Confirm delete</button>}
      </div>
    </Modal>
  );
}
