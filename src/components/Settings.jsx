import React, { useRef, useState } from 'react';
import { Download, Upload, LogOut, Moon, Sun } from 'lucide-react';
import { Field, NumberInput, rupee } from './ui.jsx';
import { SPLIT_PRESETS, DEFAULT_SETTINGS } from '../lib/strategy.js';
import { DEFAULT_UNIVERSE } from '../lib/universe.js';

export default function Settings({ state, setState, sm, mode, user, onSignOut }) {
  const S = sm.S;
  const set = (patch) => setState((st) => ({ ...st, settings: { ...st.settings, ...patch } }));
  const setNested = (key, patch) => setState((st) => ({ ...st, settings: { ...st.settings, [key]: { ...S[key], ...(st.settings?.[key] || {}), ...patch } } }));
  const fileRef = useRef();
  const [uni, setUni] = useState((S.universe || DEFAULT_UNIVERSE).join(', '));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `tau-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  const importJson = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    f.text().then((t) => {
      try { const j = JSON.parse(t); if (!Array.isArray(j.positions)) throw new Error(); setState(j); }
      catch { alert('That file is not a Tau backup.'); }
    });
  };

  const sp = S.split;
  const total = sp.dividend + sp.compound + sp.reserve;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-5 lg:col-span-2">
        <h2 className="text-xl font-semibold">Profit split</h2>
        <p className="mt-1 max-w-3xl text-sm muted">Applied to each trade's net profit, after charges and tax. Changing it affects future trades only. Booked trades keep the split they were booked with.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Object.entries(SPLIT_PRESETS).map(([k, p]) => (
            <button key={k} onClick={() => setNested('split', { ...p, preset: k })}
              className={`rounded-2xl border p-4 text-left transition ${sp.preset === k ? 'border-tau/60 bg-tau-soft' : 'border-white/[0.07] hover:border-white/20'}`}>
              <div className="display text-lg font-semibold">{p.label}</div>
              <div className="mt-1 text-sm muted">
                {k === 'two' && 'Half dividend, half compounding. SIP buys come out of free cash.'}
                {k === 'three' && 'Equal thirds, the reserve grows without limit. Cash can pile up idle.'}
                {k === 'smart' && `Thirds until the reserve reaches ${p.reserveCapPct}% of capital, then the reserve share flows into compounding.`}
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Self-dividend %"><NumberInput value={sp.dividend} onChange={(v) => setNested('split', { dividend: +v || 0, preset: 'custom' })} /></Field>
          <Field label="Compounding %"><NumberInput value={sp.compound} onChange={(v) => setNested('split', { compound: +v || 0, preset: 'custom' })} /></Field>
          <Field label="SIP reserve %"><NumberInput value={sp.reserve} onChange={(v) => setNested('split', { reserve: +v || 0, preset: 'custom' })} /></Field>
          <Field label="Reserve cap, % of capital" hint={sp.reserveCapPct ? `= ${rupee((sm.L.capitalBase * sp.reserveCapPct) / 100)} today` : 'No cap'}><NumberInput value={sp.reserveCapPct} onChange={(v) => setNested('split', { reserveCapPct: +v || 0, preset: 'custom' })} /></Field>
        </div>
        {Math.abs(total - 100) > 0.05 && <p className="mt-2 text-sm text-sip">These add up to {total.toFixed(2)}%. Tau scales them to 100%.</p>}
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold">Strategy rules</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Slots"><NumberInput step="1" value={S.slots} onChange={(v) => set({ slots: Math.max(1, +v || 15) })} /></Field>
          <Field label="Profit target %"><NumberInput value={S.targetPct} onChange={(v) => set({ targetPct: +v || 6.28 })} /></Field>
          <Field label="SIP warning at loss of %" hint="Flags a position to move to SIP"><NumberInput value={S.sipTriggerPct} onChange={(v) => set({ sipTriggerPct: +v || 10 })} /></Field>
          <Field label="SIP tranche, fraction of slot" hint="0.1 = one tenth"><NumberInput value={S.sipFraction} onChange={(v) => set({ sipFraction: +v || 0.1 })} /></Field>
          <Field label="Bull run band, min % over 200 DMA"><NumberInput value={S.bull.minPct} onChange={(v) => setNested('bull', { minPct: +v })} /></Field>
          <Field label="Bull run band, max %"><NumberInput value={S.bull.maxPct} onChange={(v) => setNested('bull', { maxPct: +v })} /></Field>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold">Charges and tax</h2>
        <p className="mt-1 text-sm muted">Defaults are Dhan's equity delivery rates. Each buy stores its charges when you record it.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Brokerage %"><NumberInput value={S.charges.brokeragePct} onChange={(v) => setNested('charges', { brokeragePct: +v || 0 })} /></Field>
          <Field label="STT % (each side)"><NumberInput value={S.charges.sttPct} onChange={(v) => setNested('charges', { sttPct: +v || 0 })} /></Field>
          <Field label="Exchange %"><NumberInput value={S.charges.txnPct} onChange={(v) => setNested('charges', { txnPct: +v || 0 })} /></Field>
          <Field label="Stamp duty % (buy)"><NumberInput value={S.charges.stampPct} onChange={(v) => setNested('charges', { stampPct: +v || 0 })} /></Field>
          <Field label="DP charge per sell ₹"><NumberInput value={S.charges.dpPerSell} onChange={(v) => setNested('charges', { dpPerSell: +v || 0 })} /></Field>
          <Field label="GST %"><NumberInput value={S.charges.gstPct} onChange={(v) => setNested('charges', { gstPct: +v || 0 })} /></Field>
          <Field label="STCG %"><NumberInput value={S.tax.stcgPct} onChange={(v) => setNested('tax', { stcgPct: +v || 0 })} /></Field>
          <Field label="LTCG %"><NumberInput value={S.tax.ltcgPct} onChange={(v) => setNested('tax', { ltcgPct: +v || 0 })} /></Field>
          <Field label="Cess %"><NumberInput value={S.tax.cessPct} onChange={(v) => setNested('tax', { cessPct: +v || 0 })} /></Field>
        </div>
        <button className="btn-ghost mt-3 text-xs" onClick={() => setState((st) => ({ ...st, settings: { ...st.settings, charges: DEFAULT_SETTINGS.charges, tax: DEFAULT_SETTINGS.tax } }))}>Reset to Dhan defaults</button>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold">Screener universe</h2>
        <p className="mt-1 text-sm muted">{(S.universe || DEFAULT_UNIVERSE).length} NSE codes, comma or line separated. Starts with the 250 from the DMADMA sheet.</p>
        <textarea className="input mt-3 min-h-[160px] font-sans text-xs leading-relaxed" value={uni} onChange={(e) => setUni(e.target.value)} />
        <div className="mt-3 flex gap-2">
          <button className="btn-ghost" onClick={() => set({ universe: [...new Set(uni.split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter(Boolean))] })}>Save list</button>
          <button className="btn-ghost" onClick={() => { setUni(DEFAULT_UNIVERSE.join(', ')); set({ universe: undefined }); }}>Restore sheet list</button>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-xl font-semibold">App</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Theme</span>
            <button className="btn-ghost" onClick={() => set({ theme: S.theme === 'light' ? 'dark' : 'light' })}>
              {S.theme === 'light' ? <><Moon size={15} />Dark</> : <><Sun size={15} />Light</>}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span>Backup</span>
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={exportJson}><Download size={15} />Export</button>
              <button className="btn-ghost" onClick={() => fileRef.current.click()}><Upload size={15} />Import</button>
              <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={importJson} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="muted">{mode === 'cloud' ? `Signed in as ${user?.email}` : 'Local mode: data stays in this browser'}</span>
            {mode === 'cloud' && <button className="btn-ghost" onClick={onSignOut}><LogOut size={15} />Sign out</button>}
          </div>
        </div>
      </section>
    </div>
  );
}
