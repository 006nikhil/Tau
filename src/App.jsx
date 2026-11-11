import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutDashboard, Briefcase, Radar, BookOpen, Settings as Cog, RefreshCw, Loader2, Undo2, Cloud, CloudOff, HardDrive, Plus, Sun, Moon } from 'lucide-react';
import { useTauStore, MODE, pushSummary } from './lib/store.js';
import { summarize, todayISO } from './lib/strategy.js';
import { marketCache, refreshHoldings, runScan, isMarketHours } from './lib/market.js';
import { DEFAULT_UNIVERSE } from './lib/universe.js';
import { sampleState } from './lib/sample.js';
import Dashboard from './components/Dashboard.jsx';
import Holdings from './components/Holdings.jsx';
import Screener from './components/Screener.jsx';
import Journal from './components/Journal.jsx';
import Settings from './components/Settings.jsx';
import { BuyDialog, SellDialog, SipDialog, MoveSipDialog, CapitalDialog, PositionDialog } from './components/Dialogs.jsx';

const TABS = [
  { id: 'home', label: 'Today', icon: LayoutDashboard },
  { id: 'holdings', label: 'Holdings', icon: Briefcase },
  { id: 'screener', label: 'Screener', icon: Radar },
  { id: 'journal', label: 'Journal', icon: BookOpen },
  { id: 'settings', label: 'Settings', icon: Cog },
];

export default function App() {
  const store = useTauStore();
  const { state, setState, status, notice, setNotice, user, authReady } = store;
  const [tab, setTab] = useState(() => (typeof location !== 'undefined' && location.hash.slice(1)) || 'home');
  const [quotes, setQuotes] = useState(() => ({ ...marketCache.quotes }));
  const [cars, setCars] = useState(() => ({ ...marketCache.car }));
  const [scan, setScan] = useState(() => marketCache.scan || null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [dlg, setDlg] = useState({ type: null });

  useEffect(() => { try { history.replaceState(null, '', `#${tab}`); } catch { /* sandboxed */ } }, [tab]);

  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('tau.theme') || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch { return 'dark'; } });
  const toggleTheme = () => setTheme((t) => { const n = t === 'light' ? 'dark' : 'light'; try { localStorage.setItem('tau.theme', n); } catch { /* ignore */ } return n; });
  const stateRef = React.useRef(state); stateRef.current = state;
  const smRaw = useMemo(() => summarize(state, quotes), [state, quotes]);
  const sm = useMemo(() => ({ ...smRaw, S: { ...smRaw.S, theme } }), [smRaw, theme]);
  const S = sm.S;
  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light');
    document.documentElement.classList.toggle('dark', theme !== 'light');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'light' ? '#eef2ef' : '#0a1411');
  }, [theme]);

  const openPositions = (state.positions || []).filter((p) => p.status === 'open');
  const openSymbols = openPositions.map((p) => p.symbol);
  const universe = S.universe || DEFAULT_UNIVERSE;
  const symKey = [...new Set(openSymbols)].sort().join(',');

  // ── market data ──
  const refresh = useCallback(async () => {
    if (!symKey) return;
    setRefreshing(true);
    try {
      const r = await refreshHoldings(symKey.split(','));
      setQuotes((q) => ({ ...q, ...r.quotes })); setCars((c) => ({ ...c, ...r.cars }));
      if (MODE === 'cloud' && Object.keys(r.quotes).length) pushSummary(stateRef.current);
      const missing = Object.keys(r.errors || {});
      if (missing.length && !Object.keys(r.quotes).length) setNotice('Price service unreachable. Prices refresh once the app is deployed or back online.');
      else if (missing.length) setNotice(`No price for ${missing.join(', ')}. Check the NSE code.`);
    } catch (e) { setNotice(`Prices unavailable: ${e.message}`); }
    setRefreshing(false);
  }, [symKey, setNotice]);

  useEffect(() => {
    if (MODE === 'cloud' && !user) return;
    refresh();
    const t = setInterval(() => isMarketHours() && refresh(), 5 * 60000);
    return () => clearInterval(t);
  }, [refresh, user]);

  const doScan = async () => {
    setScanning(true); setProgress({ done: 0, total: universe.length });
    try {
      const r = await runScan(universe, S.bull, (done, total) => setProgress({ done, total }));
      if (r.rows.length) { setScan({ ...r }); setQuotes({ ...marketCache.quotes }); setCars({ ...marketCache.car }); }
      else setNotice('The scan returned no data. The price service may be down. Try again in a minute.');
    } catch (e) { setNotice(`Scan failed: ${e.message}`); }
    setScanning(false);
  };

  // ── mutations ──
  const upsertPosition = (p) => setState((st) => ({ ...st, positions: st.positions.some((x) => x.id === p.id) ? st.positions.map((x) => (x.id === p.id ? p : x)) : [...st.positions, p] }));
  const findP = (id) => state.positions.find((x) => x.id === id);
  const act = {
    buy: (prefill) => setDlg({ type: 'buy', prefill }),
    sell: (p) => setDlg({ type: 'sell', id: p.id }),
    sip: (p) => setDlg({ type: 'sip', id: p.id }),
    moveSip: (p) => setDlg({ type: 'moveSip', id: p.id }),
    detail: (p) => setDlg({ type: 'detail', id: p.id }),
    capital: () => setDlg({ type: 'capital' }),
  };
  const close = () => setDlg({ type: null });
  const current = dlg.id ? findP(dlg.id) : null;
  const ctx = { settings: S, slotSize: sm.L.slotSize, universe, openSymbols, freeCash: sm.L.freeCash, quotes, cars, ledger: sm.L };

  // ── auth gate ──
  if (MODE === 'cloud' && !authReady) return <Splash />;
  if (MODE === 'cloud' && !user) return <SignIn onSignIn={store.signIn} />;

  const SyncIcon = MODE === 'local' ? HardDrive : status === 'offline' ? CloudOff : status === 'saving' || status === 'loading' ? Loader2 : Cloud;
  const syncLabel = MODE === 'local' ? 'Local' : { loading: 'Connecting', saving: 'Saving', synced: 'Synced', offline: 'Reconnecting', conflict: 'Reloaded' }[status];

  return (
    <div className="min-h-screen lg:flex">
      {/* Side rail (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-white/[0.05] px-4 py-6 lg:flex">
        <Brand />
        <nav className="mt-8 space-y-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${tab === t.id ? 'bg-white/[0.06] text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}>
              <t.icon size={17} />{t.label}
              {t.id === 'holdings' && openPositions.length > 0 && <span className="num ml-auto text-xs muted">{openPositions.length}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <button className="btn-primary w-full" onClick={() => act.buy()}><Plus size={16} />Record a buy</button>
          <button className="btn-ghost w-full" onClick={act.capital}>Add capital</button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-ink-950/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <div className="lg:hidden"><Brand small /></div>
            <h1 className="hidden text-2xl font-semibold lg:block">{TABS.find((t) => t.id === tab)?.label}</h1>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs muted" title={MODE === 'local' ? 'Data is saved in this browser only' : 'Shared with your household'}>
                <SyncIcon size={13} className={status === 'saving' || status === 'loading' ? 'animate-spin' : status === 'offline' ? 'text-loss' : ''} />{syncLabel}
              </span>
              <button className="btn-ghost !p-2" onClick={toggleTheme} aria-label={S.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} title={S.theme === 'light' ? 'Dark mode' : 'Light mode'}>
                {S.theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
              </button>
              {store.canUndo && <button className="btn-ghost !p-2" onClick={store.undoLast} aria-label="Undo last change" title="Undo"><Undo2 size={15} /></button>}
              <button className="btn-ghost !p-2" onClick={refresh} disabled={refreshing || !symKey} aria-label="Refresh prices" title="Refresh prices">
                <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </header>

        {notice && (
          <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6">
            <div className="flex items-center gap-3 rounded-xl bg-white/[0.05] px-4 py-2.5 text-sm">
              <span className="flex-1">{notice}</span>
              <button className="text-xs muted hover:text-zinc-200" onClick={() => setNotice(null)}>Dismiss</button>
            </div>
          </div>
        )}

        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 sm:px-6 lg:pb-10">
          {MODE === 'local' && state.positions.length === 0 && state.capitalEvents.length === 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-white/10 px-4 py-3 text-sm">
              <span className="muted">Running without a database. Want to see Tau with example trades first?</span>
              <button className="btn-ghost ml-auto !py-1.5" onClick={() => { const { quotes: sq, cars: sc, ...rest } = sampleState(); setState(rest); setQuotes((q) => ({ ...q, ...sq })); setCars((c) => ({ ...c, ...sc })); }}>Load sample data</button>
            </div>
          )}
          {tab === 'home' && <Dashboard sm={sm} cars={cars} scan={scan} openSymbols={openSymbols} act={act} />}
          {tab === 'holdings' && <Holdings sm={sm} cars={cars} act={act} />}
          {tab === 'screener' && <Screener scan={scan} scanning={scanning} progress={progress} onScan={doScan} openSymbols={openSymbols} slotSize={sm.L.slotSize} settings={S} act={act} rows={sm.rows} universe={universe} onSettings={(patch) => setState((st) => ({ ...st, settings: { ...st.settings, ...patch } }))} />}
          {tab === 'journal' && <Journal state={state} sm={sm} act={act} onDeleteCapital={(id) => setState((st) => ({ ...st, capitalEvents: st.capitalEvents.filter((e) => e.id !== id) }))} />}
          {tab === 'settings' && <Settings state={state} setState={setState} sm={sm} mode={MODE} user={user} onSignOut={store.signOut} onToggleTheme={toggleTheme} />}
        </main>

        {/* Bottom bar (mobile) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-ink-950/90 backdrop-blur-md lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="grid grid-cols-5">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${tab === t.id ? 'text-tau' : 'text-zinc-500'}`}>
                <t.icon size={19} />{t.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <BuyDialog open={dlg.type === 'buy'} onClose={close} prefill={dlg.prefill} ctx={ctx} onSave={upsertPosition} />
      <SellDialog open={dlg.type === 'sell'} onClose={close} position={current} ctx={ctx}
        onSave={(exit) => upsertPosition({ ...current, status: 'closed', exit })} />
      <SipDialog open={dlg.type === 'sip'} onClose={close} position={current} ctx={ctx}
        onSave={(lot) => upsertPosition({ ...current, mode: 'sip', lots: [...current.lots, lot] })} />
      <MoveSipDialog open={dlg.type === 'moveSip'} onClose={close} position={current} ctx={ctx}
        onSave={() => upsertPosition({ ...current, mode: 'sip', movedToSipOn: todayISO() })} />
      <CapitalDialog open={dlg.type === 'capital'} onClose={close} onSave={(e) => setState((st) => ({ ...st, capitalEvents: [...st.capitalEvents, e] }))} />
      <PositionDialog open={dlg.type === 'detail'} onClose={close} position={current} ctx={ctx}
        onUpdate={upsertPosition}
        onDelete={() => setState((st) => ({ ...st, positions: st.positions.filter((x) => x.id !== current.id) }))}
        onReopen={() => { const { exit, ...rest } = current; upsertPosition({ ...rest, status: 'open' }); }} />
    </div>
  );
}

function Brand({ small }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`grid place-items-center rounded-xl bg-tau-soft text-tau ${small ? 'h-8 w-8 text-xl' : 'h-9 w-9 text-2xl'}`} style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>τ</div>
      <div className="leading-tight">
        <div className="display text-[17px] font-semibold">Tau</div>
      </div>
    </div>
  );
}

function Splash() {
  return <div className="grid min-h-screen place-items-center"><Loader2 className="animate-spin text-tau" /></div>;
}

function SignIn({ onSignIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await onSignIn(email, password);
    if (error) setErr(error.message);
    setBusy(false);
  };
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-6">
        <Brand />
        <p className="mt-5 text-sm muted">Sign in with your Lodha Finance account.</p>
        <div className="mt-4 space-y-3">
          <input className="input" type="email" autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {err && <p className="text-sm text-loss">{err}</p>}
          <button className="btn-primary w-full" disabled={busy || !email || !password}>{busy ? <Loader2 size={16} className="animate-spin" /> : 'Sign in'}</button>
        </div>
      </form>
    </div>
  );
}
