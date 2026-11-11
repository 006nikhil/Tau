// Example data for local preview only. Never written to the shared database unless you click "Load sample data" in local mode.
import { buyCharges, exitCalc, mergeSettings, splitProfit, uid } from './strategy.js';

const d = (ago) => new Date(Date.now() + 5.5 * 3600000 - ago * 86400000).toISOString().slice(0, 10);

export function sampleState() {
  const S = mergeSettings({});
  const capital = 300000;
  const slot = capital / 15;
  const lot = (ago, px, amt, kind = 'entry') => {
    const qty = Math.max(1, Math.floor(amt / px));
    const ch = buyCharges(qty * px, S.charges);
    return { id: uid(), kind, date: d(ago), qty, price: px, charges: ch.total, stt: ch.stt };
  };
  const pos = (symbol, ago, px, extra = {}) => {
    const l = lot(ago, px, slot);
    return { id: uid(), symbol, status: 'open', mode: 'normal', originalInvested: l.qty * l.price, lots: [l], ...extra };
  };

  const closedSpec = [
    ['SBIN', 290, 780, 262], ['ICICIBANK', 270, 1180, 248], ['TCS', 255, 3400, 205], ['LT', 240, 3300, 228],
    ['CIPLA', 220, 1380, 196], ['HCLTECH', 200, 1500, 171], ['BEL', 180, 260, 158], ['NTPC', 160, 340, 131],
    ['COALINDIA', 140, 390, 117], ['ITC', 120, 410, 96], ['GAIL', 100, 182, 81], ['HDFCBANK', 80, 760, 52],
  ];
  const positions = [];
  let reserve = 0, cap = capital;
  closedSpec.forEach(([s, ago, px, exitAgo]) => {
    const p = pos(s, ago, px);
    const x = exitCalc(p, { price: +(px * 1.0645).toFixed(2), date: d(exitAgo) }, S);
    const sp = splitProfit(x.net, S.split, reserve, cap);
    reserve += sp.reserve; cap += sp.compound;
    positions.push({ ...p, status: 'closed', exit: { ...x, split: sp } });
  });
  // one recovered via SIP
  const sipWin = pos('TATASTEEL', 230, 160, { mode: 'sip' });
  sipWin.lots.push(lot(170, 128, sipWin.originalInvested * 0.1, 'sip'), lot(150, 132, sipWin.originalInvested * 0.1, 'sip'));
  const sx = exitCalc(sipWin, { price: 163.5, date: d(70) }, S);
  positions.push({ ...sipWin, status: 'closed', exit: { ...sx, split: splitProfit(sx.net, S.split, reserve, cap) } });

  // open
  const open = [
    pos('BANKBARODA', 34, 262), pos('AXISBANK', 28, 1290), pos('JSWSTEEL', 22, 1300), pos('SUNPHARMA', 18, 1850),
    pos('IOC', 14, 146), pos('HINDPETRO', 9, 392), pos('WIPRO', 5, 196),
    pos('PIIND', 160, 2350), // eligible for SIP
  ];
  const sipA = pos('MAZDOCK', 190, 2500, { mode: 'sip' });
  sipA.lots.push(lot(60, 1980, sipA.originalInvested * 0.1, 'sip'));
  const sipB = pos('PATANJALI', 175, 520, { mode: 'sip' });
  sipB.lots.push(lot(45, 440, sipB.originalInvested * 0.1, 'sip'), lot(20, 431, sipB.originalInvested * 0.1, 'sip'));
  positions.push(...open, sipA, sipB);

  const ltp = { BANKBARODA: 279.1, AXISBANK: 1332.9, JSWSTEEL: 1351.7, SUNPHARMA: 1894.9, IOC: 147.4, HINDPETRO: 398.85, WIPRO: 197.11, PIIND: 1769.2, MAZDOCK: 1893, PATANJALI: 452.6 };
  const now = Date.now();
  const quotes = Object.fromEntries(Object.entries(ltp).map(([k, v]) => [k, { ltp: v, at: now }]));
  const streak = { BANKBARODA: 9, AXISBANK: 6, JSWSTEEL: 9, SUNPHARMA: 4, IOC: 2, HINDPETRO: 5, WIPRO: 1, PIIND: 0, MAZDOCK: 3, PATANJALI: 9 };
  const cars = Object.fromEntries(Object.entries(streak).map(([k, v]) => [k, { signal: v >= 9 ? 'BUY' : 'AVOID', streak: v, need: 9, at: now }]));

  return {
    version: 1, settings: {},
    capitalEvents: [{ id: uid(), type: 'deposit', date: d(300), amount: capital, note: 'Starting capital' }],
    positions, quotes, cars,
  };
}
