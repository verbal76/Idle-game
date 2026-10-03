import type { TrickEvent } from '../scene/Game';

// Text for the mid-screen trick callouts (pure; the DOM side is ui/Callouts.ts).

export type CalloutTone = 'trick' | 'big' | 'sketchy' | 'bail' | 'grace';
export interface Callout { title: string; sub: string; tone: CalloutTone }

const flakes = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

export function trickCallout(t: TrickEvent): Callout {
  if (t.outcome === 'bail') return { title: 'BAIL', sub: '', tone: 'bail' };
  if (t.outcome === 'sketchy') return { title: 'SKETCHY', sub: 'no pay', tone: 'sketchy' };
  const combo = t.comboMult > 1 ? ` · ×${t.comboMult.toFixed(1)} combo` : '';
  // Corks, doubles and anything 540+ get the bigger treatment.
  const big = /CORK|DOUBLE|TRIPLE|\d{3,}/.test(t.name) && !/^(SWITCH )?180$/.test(t.name) && !/^(SWITCH )?360$/.test(t.name);
  return { title: t.name, sub: `+${flakes(t.payout)} ❄${combo}`, tone: big ? 'big' : 'trick' };
}

export function graceCallout(left: number): Callout {
  return { title: 'SAVED!', sub: left === 1 ? '1 grace left' : `${left} graces left`, tone: 'grace' };
}
