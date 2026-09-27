const ENTITIES: Record<string, string> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
};

/** Escapes text for safe interpolation into innerHTML templates. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, ch => ENTITIES[ch]);
}
