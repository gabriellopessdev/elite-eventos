/** Dia civil local (`yyyy-mm-dd`) — casa com `input type="date"`. */
export function sessionDay(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Recorte de título da porta: contains, sem caixa; query vazia não corta. */
export function titleMatches(title: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return title.toLowerCase().includes(q);
}
