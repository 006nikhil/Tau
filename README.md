# Tau: the 6.28% strategy desk

A standalone app for the no-stop-loss strategy: DMADMA screener, CAR-timed SIP averaging,
15-slot capital, and a dividend / compound / SIP-reserve profit split. It runs on the **same
Supabase project as Lodha Finance**, so you and Neha sign in with the same accounts. It also
publishes a summary row that Lodha Finance can show as a card.

## Setup (browser only, no terminal)

1. **GitHub**: create a new private repo called `tau`. Click *Add file → Upload files* and
   drag in everything from this folder (keep the `api`, `src` and `supabase` folders). Commit.
2. **Supabase** (your Lodha Finance project): open *SQL Editor* and paste `supabase/schema.sql`.
   Replace the two placeholder UUIDs with your and Neha's UIDs (*Authentication → Users*), then run it.
3. **Vercel**: *Add New → Project* and import the `tau` repo. Framework preset: **Vite**.
   Under *Environment Variables*, add the same two values Lodha Finance uses:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   Deploy. Later commits redeploy automatically.

Without the env vars, the app runs in local mode: data stays in the browser, and you can
load sample data to try it out.

## How the rules are implemented

| Rule | Where | Detail |
|---|---|---|
| DMADMA bull run | `strategy.js → dmadma()` | Price > 50, 100 and 200-day SMAs, and 0.01%–10% above the 200 DMA. Same formula as the sheet. |
| CAR | `strategy.js → car()` | Running average of closes from the 52-week-high date. BUY when it has risen 9 sessions in a row (sheet: `G2>G3>…>G11`). Checked against the sheet's own numbers: exact match. |
| Slots | ledger | Slot = strategy capital ÷ 15. Capital = deposits − withdrawals + compounded profit. |
| SIP tranche | `positionStats()` | 1/10 of that position's **original** invested amount. |
| Exit | `exitCalc()` | Target = average price × 1.0628. SIP positions use the blended average. |
| Charges | `buyCharges()/sellCharges()` | Dhan delivery: 0 brokerage, STT 0.1% each side, NSE 0.00297%, stamp 0.015% on the buy, SEBI, IPFT, 18% GST, ₹14.75 DP per sell. |
| Tax | `tradeTax()` | 20% STCG / 12.5% LTCG + 4% cess on gains after non-STT charges. The ₹1.25 L LTCG exemption is applied in the yearly view. |
| Profit split | `splitProfit()` | Net profit → self-dividend / compounding / SIP reserve. The Smart preset caps the reserve at 20% of capital. |
| CAGR | `xirr()` | XIRR of deposits, withdrawals and dividends taken out, against today's value. Shown both marked-to-market and booked-only. The SIP reserve counts as invested capital. |

## Lodha Finance card

The `tau_summary` row (`id = 'main'`) holds: `capital, equity, deployed, marketValue,
unrealised, freeCash, sipReserve, bookedNet, dividendsPaid, taxSetAside, cagr, cagrBooked,
openPositions, sipPositions, trades, avgHoldDays`. Lodha Finance reads it with:

```js
const { data } = await supabase.from('tau_summary').select('summary, updated_at').eq('id', 'main').maybeSingle();
```
