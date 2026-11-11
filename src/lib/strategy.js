// ─────────────────────────────────────────────────────────────────────────────
// Tau strategy engine — pure functions, no React, no I/O.
//
//  • DMADMA screener   (rebuilt from "DMADMA For Without Stop Loss Traders")
//  • CAR signal        (rebuilt from "Nikhil Stock CAR")
//  • Dhan delivery charges, STCG/LTCG + cess
//  • Capital ledger: 15 slots, profit split (dividend / compound / SIP reserve)
//  • Performance: XIRR-based CAGR, holding periods, SIP recovery time
// ─────────────────────────────────────────────────────────────────────────────

export const DAY = 86400000;

// ── Settings ─────────────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS = {
  slots: 15,
  targetPct: 6.28,          // book profit at avg × (1 + 6.28%)
  sipTriggerPct: 20,        // soft cap: at −20% a stock moves to SIP and CAR tracking starts (most negative first)
  sipFraction: 0.1,         // each SIP tranche = 1/10 of the original invested amount
  sipGapDays: 7,            // after the first tranche: at most one per week while CAR stays BUY…
  sipStepPct: 3.14,         // …and only if price is ≥ 3.14% above the previous SIP buy
  split: {                  // what happens to each trade's net profit (after charges + tax)
    preset: 'smart',
    dividend: 33.34,
    compound: 33.33,
    reserve: 33.33,
    reserveCapPct: 20,      // reserve stops filling at 20% of strategy capital; overflow → compounding
  },
  bull: { minPct: 0.01, maxPct: 10 },   // DMADMA "In Bull Run" band vs 200 DMA
  charges: {
    broker: 'Dhan',
    brokeragePct: 0, brokerageCap: 0,   // delivery brokerage
    sttPct: 0.1,                        // both sides
    txnPct: 0.00297,                    // NSE exchange txn
    sebiPerCr: 10,
    ipftPct: 0.0001,
    stampPct: 0.015,                    // buy side
    gstPct: 18,                         // on brokerage + txn + SEBI + IPFT
    dpPerSell: 14.75,                   // ₹12.50 + GST per scrip per sell day
  },
  tax: { stcgPct: 20, ltcgPct: 12.5, cessPct: 4, ltcgExemption: 125000 },
  theme: 'dark',
};

export const SPLIT_PRESETS = {
  two:   { label: '2-way', dividend: 50, compound: 50, reserve: 0, reserveCapPct: 0 },
  three: { label: '3-way', dividend: 33.34, compound: 33.33, reserve: 33.33, reserveCapPct: 0 },
  smart: { label: 'Smart 3-way', dividend: 33.34, compound: 33.33, reserve: 33.33, reserveCapPct: 20 },
};

export function mergeSettings(s = {}) {
  const d = DEFAULT_SETTINGS;
  return {
    ...d, ...s,
    split: { ...d.split, ...(s.split || {}) },
    bull: { ...d.bull, ...(s.bull || {}) },
    charges: { ...d.charges, ...(s.charges || {}) },
    tax: { ...d.tax, ...(s.tax || {}) },
  };
}

// ── Small helpers ────────────────────────────────────────────────────────────
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const avg = (a) => (a.length ? sum(a) / a.length : null);
export const round2 = (x) => Math.round(x * 100) / 100;
export const toDate = (d) => (d instanceof Date ? d : new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')));
export const daysBetween = (a, b) => Math.max(0, Math.round((toDate(b) - toDate(a)) / DAY));
export const todayISO = () => {
  const ist = new Date(Date.now() + 5.5 * 3600000);
  return ist.toISOString().slice(0, 10);
};
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ── Indicators ───────────────────────────────────────────────────────────────

/** Simple moving average of the last n values (sheet: AVERAGE(... limit n)). */
export function sma(closes, n) {
  if (!closes || closes.length < n) return null;
  return avg(closes.slice(-n));
}

/**
 * DMADMA classification — exact rebuild of the sheet:
 *   Bull Run : CMP > 50DMA, CMP > 100DMA, CMP > 200DMA and 0.01% ≤ (CMP−200DMA)/200DMA ≤ 10%
 *   Bear Run : CMP below all three and −10% ≤ diff ≤ −0.01%
 *   else     : Unconfirmed
 * DMAs use completed daily closes; CMP is the live price.
 */
export function dmadma(closes, cmp, band = DEFAULT_SETTINGS.bull) {
  const d50 = sma(closes, 50), d100 = sma(closes, 100), d200 = sma(closes, 200);
  if (!cmp || d50 == null || d100 == null || d200 == null) {
    return { status: 'NoData', d50, d100, d200, diff200: null };
  }
  const diff200 = ((cmp - d200) * 100) / d200;
  let status = 'Unconfirmed';
  if (cmp > d50 && cmp > d100 && cmp > d200 && diff200 >= band.minPct && diff200 <= band.maxPct) status = 'Bull';
  else if (cmp < d50 && cmp < d100 && cmp < d200 && diff200 >= -band.maxPct && diff200 <= -band.minPct) status = 'Bear';
  return { status, d50, d100, d200, diff200 };
}

/**
 * CAR — Cumulative Average Reversal. Exact rebuild of the sheet:
 *   1. Find the date of the 52-week high (highest daily HIGH in the last 364 days; earliest if tied).
 *   2. From that date onward, take daily closes and compute the running (cumulative) average:
 *        CA[n] = mean(close[0..n])
 *   3. Look at the last 10 CA values. Signal = BUY only if CA rose on each of the last 9 days
 *      (G2 > G3 > … > G11 in the sheet). Otherwise AVOID / HOLD.
 * In plain words: price has stayed above its post-peak average long enough to drag that
 * average up 9 sessions in a row — the correction has likely ended.
 *
 * bars: [{t: ms, h, c}] ascending, completed sessions only.
 */
export function car(bars, now = Date.now()) {
  if (!bars || bars.length < 12) return { signal: 'NoData', streak: 0, need: 9 };
  const cutoff = now - 364 * DAY;
  let hiIdx = -1, hi = -Infinity;
  bars.forEach((b, i) => {
    if (b.t >= cutoff && b.h != null && b.h > hi) { hi = b.h; hiIdx = i; }
  });
  if (hiIdx < 0) return { signal: 'NoData', streak: 0, need: 9 };
  const closes = bars.slice(hiIdx).map((b) => b.c).filter((c) => c != null);
  const ca = [];
  let run = 0;
  closes.forEach((c, i) => { run += c; ca.push(run / (i + 1)); });
  // rising streak counted from the latest value backwards (max 9 needed)
  let streak = 0;
  for (let i = ca.length - 1; i > 0 && streak < 9; i--) {
    if (ca[i] > ca[i - 1]) streak++; else break;
  }
  const last10 = ca.slice(-10);
  const signal = last10.length === 10 && streak >= 9 ? 'BUY' : 'AVOID';
  return {
    signal, streak, need: 9,
    highDate: new Date(bars[hiIdx].t).toISOString().slice(0, 10),
    high: hi,
    cumAvg: ca[ca.length - 1],
    sessionsSinceHigh: closes.length,
    last10: last10.slice().reverse(), // most recent first, like the sheet
  };
}

/** Bars that are complete: drop today's bar while NSE is still trading (before 15:30 IST). */
export function completedBars(bars, now = Date.now()) {
  if (!bars?.length) return [];
  const ist = new Date(now + 5.5 * 3600000);
  const todayIst = ist.toISOString().slice(0, 10);
  const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const dow = ist.getUTCDay();
  const marketOpen = dow >= 1 && dow <= 5 && mins >= 555 && mins < 930;
  const last = bars[bars.length - 1];
  const lastIst = new Date(last.t + 5.5 * 3600000).toISOString().slice(0, 10);
  return marketOpen && lastIst === todayIst ? bars.slice(0, -1) : bars;
}

// ── Charges & tax ────────────────────────────────────────────────────────────
export function buyCharges(value, c = DEFAULT_SETTINGS.charges) {
  const brokerage = c.brokerageCap ? Math.min((value * c.brokeragePct) / 100, c.brokerageCap) : (value * c.brokeragePct) / 100;
  const stt = Math.round((value * c.sttPct) / 100);
  const txn = (value * c.txnPct) / 100;
  const sebi = (value * c.sebiPerCr) / 1e7;
  const ipft = (value * c.ipftPct) / 100;
  const stamp = Math.round((value * c.stampPct) / 100);
  const gst = ((brokerage + txn + sebi + ipft) * c.gstPct) / 100;
  const total = brokerage + stt + txn + sebi + ipft + stamp + gst;
  return { brokerage, stt, txn, sebi, ipft, stamp, gst, dp: 0, total: round2(total) };
}

export function sellCharges(value, c = DEFAULT_SETTINGS.charges) {
  const brokerage = c.brokerageCap ? Math.min((value * c.brokeragePct) / 100, c.brokerageCap) : (value * c.brokeragePct) / 100;
  const stt = Math.round((value * c.sttPct) / 100);
  const txn = (value * c.txnPct) / 100;
  const sebi = (value * c.sebiPerCr) / 1e7;
  const ipft = (value * c.ipftPct) / 100;
  const gst = ((brokerage + txn + sebi + ipft) * c.gstPct) / 100;
  const dp = c.dpPerSell;
  const total = brokerage + stt + txn + sebi + ipft + gst + dp;
  return { brokerage, stt, txn, sebi, ipft, stamp: 0, gst, dp, total: round2(total) };
}

/**
 * Per-trade tax, conservative: STT is not deductible; other charges are.
 * LTCG if held > 365 days from the FIRST buy (SIP lots are approximated to the first lot;
 * the FY summary applies the ₹1.25L exemption on top).
 */
export function tradeTax({ buyValue, sellValue, chargesExSTT, firstBuy, sellDate }, t = DEFAULT_SETTINGS.tax) {
  const taxable = sellValue - buyValue - chargesExSTT;
  const long = daysBetween(firstBuy, sellDate) > 365;
  const rate = long ? t.ltcgPct : t.stcgPct;
  const tax = taxable > 0 ? (taxable * rate * (1 + t.cessPct / 100)) / 100 : 0;
  return { taxable, long, rate, tax: round2(tax) };
}

// ── Position maths ───────────────────────────────────────────────────────────
export function positionStats(p, ltp, settings) {
  const lots = p.lots || [];
  const qty = sum(lots.map((l) => l.qty));
  const buyValue = sum(lots.map((l) => l.qty * l.price));
  const buyChg = sum(lots.map((l) => l.charges || 0));
  const avgPrice = qty ? buyValue / qty : 0;
  const firstBuy = lots.length ? lots.reduce((m, l) => (l.date < m ? l.date : m), lots[0].date) : null;
  const sipLots = lots.filter((l) => l.kind === 'sip');
  const sipStart = sipLots.length ? sipLots.reduce((m, l) => (l.date < m ? l.date : m), sipLots[0].date) : null;
  const lastSip = sipLots.length ? sipLots.reduce((m, l) => (l.date >= m.date ? l : m), sipLots[0]) : null;
  const original = p.originalInvested ?? (lots[0] ? lots[0].qty * lots[0].price : 0);
  const target = avgPrice * (1 + settings.targetPct / 100);
  const mv = ltp ? qty * ltp : null;
  const plPct = ltp && avgPrice ? ((ltp - avgPrice) / avgPrice) * 100 : null;
  const pl = mv != null ? mv - buyValue : null;
  const toTarget = ltp ? ((target - ltp) / ltp) * 100 : null;
  return {
    qty, buyValue, buyChg, avgPrice, firstBuy, sipStart, sipCount: sipLots.length,
    lastSipPrice: lastSip?.price ?? null, lastSipDate: lastSip?.date ?? null,
    original, sipAmount: original * settings.sipFraction, target, ltp, mv, pl, plPct, toTarget,
    ready: ltp != null && ltp >= target,
    sipEligible: p.mode !== 'sip' && plPct != null && plPct <= -settings.sipTriggerPct,
    days: firstBuy ? daysBetween(firstBuy, todayISO()) : 0,
  };
}

/**
 * Is a SIP tranche due today?
 *  • CAR must say BUY.
 *  • First tranche: no other condition.
 *  • After that: ≥ sipGapDays since the last SIP buy AND price ≥ last SIP price × (1 + sipStepPct%).
 */
export function sipReadiness(s, car, settings, today = todayISO()) {
  if (car?.signal !== 'BUY') return { ready: false, reason: 'Waiting for CAR buy' };
  if (!s.sipCount) return { ready: true, first: true };
  const gap = daysBetween(s.lastSipDate, today);
  const need = s.lastSipPrice * (1 + settings.sipStepPct / 100);
  if (gap < settings.sipGapDays) {
    const next = new Date(toDate(s.lastSipDate).getTime() + settings.sipGapDays * DAY).toISOString().slice(0, 10);
    return { ready: false, need, reason: `Next tranche from ${next}` };
  }
  if (s.ltp == null || s.ltp < need) return { ready: false, need, reason: `Needs ${need.toFixed(2)}, +${settings.sipStepPct}% over the last SIP buy` };
  return { ready: true, need };
}

/** Full exit calculation (used by the Sell dialog and the ledger). */
export function exitCalc(p, { price, date }, settings) {
  const s = positionStats(p, price, settings);
  const sellValue = s.qty * price;
  const sc = sellCharges(sellValue, settings.charges);
  const buySTT = sum((p.lots || []).map((l) => l.stt || 0));
  const chargesTotal = s.buyChg + sc.total;
  const chargesExSTT = chargesTotal - sc.stt - buySTT;
  const gross = sellValue - s.buyValue;
  const tx = tradeTax({ buyValue: s.buyValue, sellValue, chargesExSTT, firstBuy: s.firstBuy, sellDate: date }, settings.tax);
  const net = gross - chargesTotal - tx.tax;
  return {
    qty: s.qty, price, date, sellValue, buyValue: s.buyValue, avgPrice: s.avgPrice,
    sellCharges: sc.total, sellSTT: sc.stt, chargesTotal: round2(chargesTotal), gross: round2(gross),
    tax: tx.tax, long: tx.long, taxable: round2(tx.taxable), net: round2(net),
    netPct: s.buyValue ? (net / s.buyValue) * 100 : 0,
    grossPct: s.buyValue ? (gross / s.buyValue) * 100 : 0,
    days: daysBetween(s.firstBuy, date),
    sipDays: s.sipStart ? daysBetween(s.sipStart, date) : null,
  };
}

/** Split a positive net profit given current reserve state. */
export function splitProfit(net, split, reserveCash, capitalBase) {
  if (net <= 0) return { dividend: 0, compound: net, reserve: 0 };
  const tot = split.dividend + split.compound + split.reserve || 100;
  const dividend = (net * split.dividend) / tot;
  let reserve = (net * split.reserve) / tot;
  let compound = (net * split.compound) / tot;
  if (split.reserve > 0 && split.reserveCapPct > 0) {
    const cap = (capitalBase * split.reserveCapPct) / 100;
    const room = Math.max(0, cap - reserveCash);
    if (reserve > room) { compound += reserve - room; reserve = room; }
  }
  return { dividend: round2(dividend), compound: round2(compound), reserve: round2(reserve) };
}

// ── Ledger: replay every event in date order ─────────────────────────────────
/**
 * Pools
 *   capitalBase : deposits − withdrawals + compounded profits (drives slot size)
 *   freeCash    : uninvested strategy cash
 *   reserveCash : SIP reserve (fed by the reserve share of profits)
 *   taxSetAside : tax on booked trades (owed, not yours to deploy)
 *   paidOut     : self-dividends taken out
 * SIP tranches draw from the reserve first, then free cash. On exit, principal goes back to
 * whichever pool funded it.
 */
export function buildLedger(state) {
  const settings = mergeSettings(state.settings);
  const events = [];
  (state.capitalEvents || []).forEach((e) => events.push({ date: e.date, ord: 0, type: e.type, e }));
  (state.positions || []).forEach((p) => {
    (p.lots || []).forEach((l) => events.push({ date: l.date, ord: 1, type: 'buy', p, l }));
    if (p.status === 'closed' && p.exit) events.push({ date: p.exit.date, ord: 2, type: 'sell', p });
  });
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ord - b.ord));

  let capitalBase = 0, freeCash = 0, reserveCash = 0, taxSetAside = 0, paidOut = 0, compounded = 0, reserveFed = 0;
  const flows = []; // for XIRR: investor perspective (deposit −, money received +)
  const funding = {}; // positionId → { reserve, free }
  const exits = {};
  const timeline = [];

  for (const ev of events) {
    if (ev.type === 'deposit') {
      capitalBase += ev.e.amount; freeCash += ev.e.amount;
      flows.push({ date: ev.date, amount: -ev.e.amount });
    } else if (ev.type === 'withdraw') {
      capitalBase -= ev.e.amount; freeCash -= ev.e.amount;
      flows.push({ date: ev.date, amount: ev.e.amount });
    } else if (ev.type === 'buy') {
      const cost = ev.l.qty * ev.l.price + (ev.l.charges || 0);
      const f = (funding[ev.p.id] ||= { reserve: 0, free: 0 });
      if (ev.l.kind === 'sip' && reserveCash > 0) {
        const fromRes = Math.min(reserveCash, cost);
        reserveCash -= fromRes; f.reserve += fromRes; freeCash -= cost - fromRes; f.free += cost - fromRes;
      } else { freeCash -= cost; f.free += cost; }
    } else if (ev.type === 'sell') {
      const x = ev.p.exit;
      const f = funding[ev.p.id] || { reserve: 0, free: 0 };
      reserveCash += f.reserve; freeCash += f.free;
      taxSetAside += x.tax || 0;
      const sp = x.split || splitProfit(x.net, settings.split, reserveCash, capitalBase);
      if (x.net > 0) {
        paidOut += sp.dividend; reserveCash += sp.reserve; reserveFed += sp.reserve;
        freeCash += sp.compound; capitalBase += sp.compound; compounded += sp.compound;
        if (sp.dividend) flows.push({ date: ev.date, amount: sp.dividend });
      } else {
        freeCash += x.net; capitalBase += x.net; compounded += x.net;
      }
      exits[ev.p.id] = sp;
    }
    timeline.push({ date: ev.date, capitalBase, freeCash, reserveCash });
  }

  return {
    settings, capitalBase, freeCash, reserveCash, taxSetAside, paidOut, compounded, reserveFed,
    flows, funding, exits, timeline,
    slotSize: capitalBase / settings.slots,
    sipTranche: (capitalBase / settings.slots) * settings.sipFraction,
  };
}

// ── XIRR ─────────────────────────────────────────────────────────────────────
export function xirr(flows) {
  if (flows.length < 2 || !flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = toDate(flows[0].date).getTime();
  const yrs = flows.map((f) => (toDate(f.date).getTime() - t0) / (365 * DAY));
  const span = Math.max(...yrs);
  if (span < 1 / 365) return null;
  const npv = (r) => flows.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, yrs[i]), 0);
  let lo = -0.99, hi = 100;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// ── Portfolio summary (everything the dashboard needs) ───────────────────────
export function summarize(state, quotes = {}) {
  const L = buildLedger(state);
  const S = L.settings;
  const open = (state.positions || []).filter((p) => p.status === 'open');
  const closed = (state.positions || []).filter((p) => p.status === 'closed' && p.exit);

  const rows = open.map((p) => ({ p, s: positionStats(p, quotes[p.symbol]?.ltp, S) }));
  const deployedActive = sum(rows.filter((r) => r.p.mode !== 'sip').map((r) => r.s.buyValue + r.s.buyChg));
  const deployedSip = sum(rows.filter((r) => r.p.mode === 'sip').map((r) => r.s.buyValue + r.s.buyChg));
  const costOpen = deployedActive + deployedSip;
  const mvOpen = sum(rows.map((r) => (r.s.mv != null ? r.s.mv : r.s.buyValue + r.s.buyChg)));
  const unrealised = mvOpen - costOpen;

  // equity = everything you could liquidate inside the strategy (tax owed excluded)
  const cashIn = L.freeCash + L.reserveCash;
  const equityMTM = cashIn + mvOpen;
  const equityBook = cashIn + costOpen;
  const today = todayISO();
  const cagrMTM = xirr([...L.flows, { date: today, amount: equityMTM }]);
  const cagrBooked = xirr([...L.flows, { date: today, amount: equityBook }]);

  const exits = closed.map((p) => p.exit);
  const sipExits = closed.filter((p) => p.exit.sipDays != null);
  const bookedNet = sum(exits.map((x) => x.net));
  const deposits = sum((state.capitalEvents || []).filter((e) => e.type === 'deposit').map((e) => e.amount));
  const withdrawals = sum((state.capitalEvents || []).filter((e) => e.type === 'withdraw').map((e) => e.amount));
  const firstDate = L.flows[0]?.date || null;

  // FY view (Apr–Mar)
  const fy = (d) => { const dt = toDate(d); const y = dt.getMonth() >= 3 ? dt.getFullYear() : dt.getFullYear() - 1; return `FY${String(y + 1).slice(2)}`; };
  const byFY = {};
  exits.forEach((x) => {
    const k = fy(x.date); const o = (byFY[k] ||= { net: 0, tax: 0, stcg: 0, ltcg: 0, trades: 0 });
    o.net += x.net; o.tax += x.tax; o.trades++; if (x.long) o.ltcg += x.taxable; else o.stcg += x.taxable;
  });
  const byMonth = {};
  exits.forEach((x) => { const k = x.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + x.net; });

  const openSip = rows.filter((r) => r.p.mode === 'sip' && r.s.sipStart);
  return {
    L, S, rows, deployedActive, deployedSip, costOpen, mvOpen, unrealised, cashIn, equityMTM, equityBook,
    cagrMTM, cagrBooked, bookedNet, deposits, withdrawals, firstDate,
    trades: exits.length,
    avgHold: avg(exits.map((x) => x.days)),
    avgNetPct: avg(exits.map((x) => x.netPct)),
    avgNet: avg(exits.map((x) => x.net)),
    avgSipRecovery: avg(sipExits.map((p) => p.exit.sipDays)),
    sipRecoveries: sipExits.length,
    openSipAvgDays: avg(openSip.map((r) => daysBetween(r.s.sipStart, today))),
    chargesPaid: sum(exits.map((x) => x.chargesTotal)),
    taxPaid: sum(exits.map((x) => x.tax)),
    losses: exits.filter((x) => x.net < 0).length,
    slotsUsed: open.length,
    slotsFree: Math.max(0, S.slots - open.length),
    utilisation: equityBook > 0 ? costOpen / equityBook : 0,
    idleCash: L.freeCash,
    byFY, byMonth,
  };
}

/** The compact summary Lodha Finance reads (tau_summary table). */
export function lodhaSummary(sm, cars = {}) {
  const holdings = sm.rows.map(({ p, s }) => ({
    symbol: p.symbol, mode: p.mode === 'sip' ? 'sip' : 'active',
    qty: s.qty, avgPrice: round2(s.avgPrice), invested: round2(s.buyValue),
    ltp: s.ltp ?? null, marketValue: s.mv != null ? round2(s.mv) : null,
    pl: s.pl != null ? round2(s.pl) : null, plPct: s.plPct != null ? round2(s.plPct) : null,
    target: round2(s.target), toTargetPct: s.toTarget != null ? round2(s.toTarget) : null, ready: s.ready,
    firstBuy: s.firstBuy, days: s.days, sipCount: s.sipCount, sipStart: s.sipStart,
    car: cars[p.symbol]?.signal || null, carStreak: cars[p.symbol]?.streak ?? null,
  })).sort((a, b) => (a.toTargetPct ?? 99) - (b.toTargetPct ?? 99));
  return {
    holdings,
    slots: sm.S.slots, slotSize: round2(sm.L.slotSize),
    avgNetPct: sm.avgNetPct, avgSipRecoveryDays: sm.avgSipRecovery, sipRecoveries: sm.sipRecoveries,
    chargesPaid: round2(sm.chargesPaid), deposits: round2(sm.deposits), withdrawals: round2(sm.withdrawals), firstDate: sm.firstDate,
    byMonth: sm.byMonth,
    updatedAt: new Date().toISOString(),
    capital: round2(sm.L.capitalBase),
    equity: round2(sm.equityMTM),
    deployed: round2(sm.costOpen),
    marketValue: round2(sm.mvOpen),
    unrealised: round2(sm.unrealised),
    freeCash: round2(sm.L.freeCash),
    sipReserve: round2(sm.L.reserveCash),
    bookedNet: round2(sm.bookedNet),
    dividendsPaid: round2(sm.L.paidOut),
    taxSetAside: round2(sm.L.taxSetAside),
    cagr: sm.cagrMTM, cagrBooked: sm.cagrBooked,
    openPositions: sm.slotsUsed, sipPositions: sm.rows.filter((r) => r.p.mode === 'sip').length,
    trades: sm.trades, avgHoldDays: sm.avgHold,
  };
}
