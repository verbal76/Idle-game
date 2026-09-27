import type { RunSummary } from '../game/summary';
import { escapeHtml } from '../util/escapeHtml';

/** Earnings breakdown + records table for the end-of-run screens. */
export function runSummaryHtml(s: RunSummary): string {
  const earnings = s.earnings.map(l =>
    `<div class="stat-row"><span class="stat-label">${escapeHtml(l.label)}</span><span class="stat-val">${escapeHtml(l.value)}</span></div>`).join('');
  const records = s.records.map(r => `
    <div class="summary-record${r.isNew ? ' new-best' : ''}">
      <span class="stat-label">${escapeHtml(r.label)}</span>
      <span class="stat-val">${escapeHtml(r.run)}</span>
      <span class="summary-best">${r.isNew ? '<b class="badge-new">NEW BEST</b>' : `best ${escapeHtml(r.best)}`}</span>
    </div>`).join('');
  return `
    <div class="run-summary" id="run-summary">
      <div class="summary-total" id="summary-total">${escapeHtml(s.total)}</div>
      ${earnings ? `<div class="stats-card summary-earnings">${earnings}</div>` : ''}
      <div class="stats-card summary-records">${records}</div>
    </div>`;
}
