import React, { useEffect } from 'react';
import { X } from 'lucide-react';

// ── formatting ──
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const rupee = (x, d = 0) => (x == null || isNaN(x) ? '—' : `${x < 0 ? '−' : ''}₹${(d ? inr2 : inr0).format(Math.abs(x))}`);
export const price = (x) => (x == null || isNaN(x) ? '—' : inr2.format(x));
export const pct = (x, d = 2, sign = true) => (x == null || isNaN(x) ? '—' : `${sign && x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(d)}%`);
export const compact = (x) => {
  if (x == null || isNaN(x)) return '—';
  const a = Math.abs(x), s = x < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  return `${s}₹${inr0.format(a)}`;
};
export const days = (d) => (d == null || isNaN(d) ? '—' : d >= 365 ? `${(d / 365).toFixed(1)} yr` : `${Math.round(d)} d`);
export const fmtDate = (iso) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
export const tone = (x) => (x == null ? 'text-zinc-400' : x > 0 ? 'text-gain' : x < 0 ? 'text-loss' : 'text-zinc-300');

// ── pieces ──
export function Modal({ open, onClose, title, subtitle, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={`rise card max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-[20px] ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-white/[0.06] bg-inherit px-5 pb-3 pt-5">
          <div>
            <h3 className="text-xl font-semibold">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm muted">{subtitle}</p>}
          </div>
          <button className="btn-ghost !p-2" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="sticky bottom-0 flex gap-2 border-t border-white/[0.06] bg-inherit px-5 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs muted">{hint}</span>}
    </label>
  );
}

export function NumberInput({ value, onChange, step = 'any', ...rest }) {
  return (
    <input
      type="number" inputMode="decimal" step={step} className="input num"
      value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} {...rest}
    />
  );
}

export function Stat({ label, value, sub, valueClass = '' }) {
  return (
    <div className="min-w-0">
      <div className="text-[13px] muted">{label}</div>
      <div className={`display num mt-1 truncate text-[22px] font-semibold leading-tight ${valueClass}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-xs muted">{sub}</div>}
    </div>
  );
}

export function CarChip({ car }) {
  if (!car || car.signal === 'NoData') return <span className="chip bg-white/[0.05] text-zinc-500">CAR —</span>;
  if (car.signal === 'BUY') return <span className="chip bg-gain-soft text-gain">CAR buy</span>;
  return (
    <span className="chip bg-white/[0.05] text-zinc-400" title={`Cumulative average has risen ${car.streak} of the 9 sessions needed`}>
      {`CAR ${car.streak}/9`}
    </span>
  );
}

export function Row({ k, v, strong, className = '' }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${className}`}>
      <span className="muted">{k}</span>
      <span className={`num text-right ${strong ? 'font-semibold' : ''}`}>{v}</span>
    </div>
  );
}

export function Empty({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-tau-soft text-tau"><Icon size={20} /></div>}
      <div className="display text-lg font-semibold">{title}</div>
      {body && <p className="mt-1 max-w-sm text-sm muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex rounded-xl bg-white/[0.04] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${value === o.value ? 'bg-ink-700 text-zinc-100 shadow' : 'text-zinc-400 hover:text-zinc-200'}`}
        >{o.label}</button>
      ))}
    </div>
  );
}
