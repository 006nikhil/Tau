import React from 'react';
import { compact, pct } from './ui.jsx';

// The τ dial: one arc segment per slot around a full turn (2π ≈ 6.28).
// Active segments fill green toward the 6.28% target; SIP segments are blue;
// a position under water shows its drawdown in coral (full arc = SIP trigger).
const COLORS = { active: '#6fd6a0', sip: '#7eb6ff', loss: '#f27d72', empty: 'rgba(255,255,255,0.06)' };

function arc(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
}

export default function Dial({ rows, slots, settings, equity, cagr, onPick }) {
  const size = 300, cx = size / 2, cy = size / 2, r = 128, w = 16;
  const gap = 0.045;
  const seg = (2 * Math.PI) / slots;
  const start = -Math.PI / 2;
  const filled = rows.slice(0, slots);
  const sipN = rows.filter((x) => x.p.mode === 'sip').length;

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[300px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" role="img" aria-label={`${rows.length} of ${slots} slots in use`}>
        {Array.from({ length: slots }).map((_, i) => {
          const a0 = start + i * seg + gap / 2, a1 = start + (i + 1) * seg - gap / 2;
          const row = filled[i];
          const track = <path key={`t${i}`} d={arc(cx, cy, r, a0, a1)} stroke={COLORS.empty} strokeWidth={w} fill="none" strokeLinecap="butt" />;
          if (!row) return track;
          const { s, p } = row;
          const isSip = p.mode === 'sip';
          const pl = s.plPct;
          let frac = 0, color = isSip ? COLORS.sip : COLORS.active;
          if (pl != null && pl >= 0) frac = Math.min(1, pl / settings.targetPct);
          else if (pl != null) { frac = Math.min(1, -pl / settings.sipTriggerPct); color = isSip ? COLORS.sip : COLORS.loss; }
          const base = isSip ? 'rgba(126,182,255,0.22)' : 'rgba(111,214,160,0.2)';
          const af = a0 + (a1 - a0) * Math.max(frac, 0.04);
          return (
            <g key={i} className="cursor-pointer" onClick={() => onPick?.(p)}>
              <title>{`${p.symbol}${isSip ? ' (SIP)' : ''}: ${pct(pl)}`}</title>
              <path d={arc(cx, cy, r, a0, a1)} stroke={base} strokeWidth={w} fill="none" />
              <path d={arc(cx, cy, r, a0, af)} stroke={color} strokeWidth={w} fill="none" opacity={pl != null && pl < 0 && !isSip ? 0.85 : 1} />
              {s.ready && <circle cx={cx + (r + 18) * Math.cos((a0 + a1) / 2)} cy={cy + (r + 18) * Math.sin((a0 + a1) / 2)} r="3.5" fill="#d9b25f" />}
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-[13px] muted">Strategy value</div>
        <div className="display num mt-0.5 text-[34px] font-semibold leading-none">{compact(equity)}</div>
        <div className="mt-2 text-sm">
          <span className={cagr == null ? 'muted' : cagr >= 0 ? 'text-gain' : 'text-loss'}>{cagr == null ? 'CAGR after first month' : `${pct(cagr * 100, 1)} CAGR`}</span>
        </div>
        <div className="mt-3 text-xs muted">
          {rows.length}/{slots} slots{sipN ? `, ${sipN} in SIP` : ''}
        </div>
      </div>
    </div>
  );
}
