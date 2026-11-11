// State store: Supabase (shared between Nikhil & Neha, realtime) or local-only fallback.
//
// Safety rules carried over from Lodha Finance:
//  • No write is sent until a successful read has been confirmed this session.
//  • Writes use optimistic concurrency (rev column): if the other person saved in between,
//    the write is rejected, the fresh copy is loaded, and you are told — nothing is clobbered.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { lodhaSummary, summarize } from './strategy.js';
import { marketCache } from './market.js';

const URL = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = URL && KEY ? createClient(URL, KEY) : null;
export const MODE = supabase ? 'cloud' : 'local';

const ROW_ID = 'main';
const LOCAL_KEY = 'tau.state.v1';
export const EMPTY_STATE = { version: 1, settings: {}, capitalEvents: [], positions: [] };

const readLocal = () => {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || null; } catch { return null; }
};
const writeLocal = (s) => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); } catch { /* ignore */ } };

/** Publish the summary Lodha Finance reads. Called after saves and after price refreshes. */
export async function pushSummary(state) {
  if (!supabase) return;
  try {
    const sm = summarize(state, marketCache.quotes);
    await supabase.from('tau_summary').upsert({ id: ROW_ID, summary: lodhaSummary(sm, marketCache.car), updated_at: new Date().toISOString() });
  } catch { /* best-effort */ }
}

export function useTauStore() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(MODE === 'local');
  const [state, setStateRaw] = useState(() => (MODE === 'local' ? readLocal() || EMPTY_STATE : EMPTY_STATE));
  const [status, setStatus] = useState(MODE === 'local' ? 'local' : 'loading'); // loading|synced|saving|offline|conflict|local
  const [notice, setNotice] = useState(null);
  const confirmed = useRef(MODE === 'local');
  const rev = useRef(0);
  const pending = useRef(null);
  const timer = useRef(null);
  const clientId = useRef(Math.random().toString(36).slice(2));
  const undo = useRef([]);

  // ── auth ──
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user || null); setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  // ── initial load with retries ──
  const load = useCallback(async () => {
    if (!supabase || !user) return;
    setStatus('loading');
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data, error } = await supabase.from('tau_state').select('data, rev').eq('id', ROW_ID).maybeSingle();
      if (!error) {
        if (data) { rev.current = data.rev; setStateRaw({ ...EMPTY_STATE, ...data.data }); }
        else {
          const { error: insErr } = await supabase.from('tau_state').insert({ id: ROW_ID, data: EMPTY_STATE, rev: 0 });
          if (insErr) { setStatus('offline'); setNotice(`Couldn't create your data row: ${insErr.message}`); return; }
          rev.current = 0; setStateRaw(EMPTY_STATE);
        }
        confirmed.current = true; setStatus('synced'); return;
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
    setStatus('offline');
    setNotice('Could not reach the database. Changes are paused until it reconnects.');
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── realtime: the other person's edits appear live ──
  useEffect(() => {
    if (!supabase || !user) return;
    const ch = supabase.channel('tau_state_live')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tau_state', filter: `id=eq.${ROW_ID}` }, (payload) => {
        const row = payload.new;
        if (row.updated_by === clientId.current || row.rev <= rev.current) return;
        rev.current = row.rev;
        setStateRaw({ ...EMPTY_STATE, ...row.data });
        setNotice('Updated from another device.');
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // ── watchdog: retry if offline ──
  useEffect(() => {
    if (status !== 'offline' || !user) return;
    const t = setTimeout(load, 15000);
    return () => clearTimeout(t);
  }, [status, user, load]);

  const flush = useCallback(async () => {
    const next = pending.current;
    if (!next || !supabase || !confirmed.current) return;
    pending.current = null;
    setStatus('saving');
    const newRev = rev.current + 1;
    const { data, error } = await supabase.from('tau_state')
      .update({ data: next, rev: newRev, updated_at: new Date().toISOString(), updated_by: clientId.current })
      .eq('id', ROW_ID).eq('rev', rev.current).select('rev');
    if (error) { pending.current = next; setStatus('offline'); setNotice(`Save failed: ${error.message}. Retrying…`); setTimeout(flush, 5000); return; }
    if (!data?.length) {
      setStatus('conflict');
      setNotice('Someone else saved a change first. Loaded their latest — please redo your last edit.');
      await load();
      return;
    }
    rev.current = newRev;
    setStatus('synced');
    pushSummary(next);
  }, [load]);

  const setState = useCallback((updater) => {
    setStateRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (next === prev) return prev;
      undo.current.push(prev); if (undo.current.length > 20) undo.current.shift();
      if (MODE === 'local') { writeLocal(next); return next; }
      if (!confirmed.current) { setNotice('Still connecting — change not saved yet.'); return prev; }
      pending.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 500);
      return next;
    });
  }, [flush]);

  const undoLast = useCallback(() => {
    const prev = undo.current.pop();
    if (!prev) return;
    setStateRaw(prev);
    if (MODE === 'local') writeLocal(prev);
    else { pending.current = prev; clearTimeout(timer.current); timer.current = setTimeout(flush, 300); }
  }, [flush]);

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  return { state, setState, status, notice, setNotice, user, authReady, signIn, signOut, undoLast, canUndo: undo.current.length > 0 };
}
