import React, { useState } from 'react';
import { Loader2, ListChecks } from 'lucide-react';
import { Modal, fmtDate } from './ui.jsx';
import { INDEXES, fetchIndexList } from '../lib/universe.js';

/**
 * Checks NSE for the current members of the chosen index and shows what changed
 * before replacing the screener list.
 */
export default function UniverseUpdater({ settings, universe, openSymbols, onSave, showPicker }) {
  const key = settings.universeIndex || 'largemidcap250';
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [diff, setDiff] = useState(null);

  const check = async (idx = key) => {
    setBusy(true); setMsg(null);
    try {
      const j = await fetchIndexList(idx);
      const cur = new Set(universe), next = new Set(j.symbols);
      const added = j.symbols.filter((s) => !cur.has(s));
      const removed = universe.filter((s) => !next.has(s));
      if (!added.length && !removed.length && idx === key) {
        onSave({ universeCheckedAt: new Date().toISOString().slice(0, 10) });
        setMsg(`Up to date: ${j.symbols.length} stocks, same as NSE today.`);
      } else setDiff({ ...j, idx, added, removed });
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const apply = () => {
    onSave({ universe: diff.symbols, universeIndex: diff.idx, universeCheckedAt: new Date().toISOString().slice(0, 10) });
    setMsg(`Updated to ${diff.symbols.length} stocks from ${diff.name}. Run the scan to refresh results.`);
    setDiff(null);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {showPicker ? (
          <select className="input !w-auto !py-2" value={key} onChange={(e) => check(e.target.value)} aria-label="Index">
            {Object.entries(INDEXES).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
        ) : (
          <span className="muted">{INDEXES[key]}, {universe.length} stocks{settings.universeCheckedAt ? `, list checked ${fmtDate(settings.universeCheckedAt)}` : ''}</span>
        )}
        <button className="btn-ghost !py-1.5" onClick={() => check()} disabled={busy}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ListChecks size={15} />}Check for list changes
        </button>
      </div>
      {msg && <p className="mt-2 text-sm muted">{msg}</p>}

      <Modal open={!!diff} onClose={() => setDiff(null)} title={`${diff?.name || ''} has changed`}
        subtitle={diff ? `NSE lists ${diff.symbols.length} stocks. Yours has ${universe.length}.` : ''}
        footer={<><button className="btn-ghost flex-1" onClick={() => setDiff(null)}>Keep my list</button><button className="btn-primary flex-1" onClick={apply}>Update list</button></>}>
        {diff && (
          <div className="space-y-4 text-sm">
            <Group title={`Added (${diff.added.length})`} items={diff.added} cls="bg-gain-soft text-gain" />
            <Group title={`Removed (${diff.removed.length})`} items={diff.removed} cls="bg-loss-soft text-loss" held={openSymbols} />
            {diff.removed.some((s) => openSymbols.includes(s)) && (
              <p className="text-xs muted">Stocks you hold stay in Holdings until you book them. They just stop appearing in the screener.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Group({ title, items, cls, held = [] }) {
  return (
    <div>
      <div className="card-hd mb-2">{title}</div>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s) => <span key={s} className={`chip ${cls}`}>{s}{held.includes(s) ? ' (held)' : ''}</span>)}
        </div>
      ) : <p className="muted">None</p>}
    </div>
  );
}
