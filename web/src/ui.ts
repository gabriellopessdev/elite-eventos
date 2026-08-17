/**
 * Vocabulário visual do app. O glow tem dono: só `btn` (ação primária) e o
 * assento selecionado brilham — antes ele estava em todo painel e todo card,
 * e por isso nada se destacava.
 */

export const btn =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-0 bg-accent px-5 py-3 font-bold text-accent-ink shadow-glow hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface-top disabled:text-faint disabled:shadow-none';

export const btnGhost =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-line-strong bg-transparent px-4 py-2.5 font-semibold text-ink hover:bg-lavender/8';

export const btnQuiet =
  'inline-flex min-h-11 cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2 font-semibold text-muted hover:text-ink';

export const surface = 'rounded-2xl border border-line bg-surface';

export const surfaceHigh = 'rounded-2xl border border-line bg-surface-high';

/** Vidro — só sobre a foto do teatro (cartaz e sessão). */
export const glass = 'rounded-2xl border border-line bg-surface/85 backdrop-blur-xl';

export const fieldLabel = 'text-[13px] font-semibold text-muted';

export const fieldInput =
  'min-h-12 w-full rounded-xl border border-line-strong bg-canvas px-3.5 font-sans text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-accent/35';

export const hint = 'text-[13px] text-faint';

export const hintError = 'text-[13px] font-semibold text-danger';

export const pill =
  'inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] text-lavender uppercase';

const chipBase =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold';

export const chipIdle = `${chipBase} border-line-strong bg-transparent text-muted hover:bg-lavender/8 hover:text-ink`;

export const chipActive = `${chipBase} border-accent bg-accent text-accent-ink`;

const badgeBase = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold';

export const badgeOk = `${badgeBase} bg-success/20 text-success`;

export const badgeUsed = `${badgeBase} bg-white/10 text-muted`;

export const badgeNeutral = `${badgeBase} bg-surface-top text-ink`;

export const skeleton =
  'animate-pulse rounded-xl bg-gradient-to-r from-surface via-surface-top to-surface';

/**
 * Assentos: três estados distintos por COR *e* por FORMA. A pista não cromática
 * importa — antes HELD e SOLD eram o mesmo #1c1048, indistinguíveis entre si e
 * quase iguais ao fundo.
 */
export const seatBase = 'rounded-t-[7px] rounded-b-[3px] border-[1.5px] border-transparent p-0';

export const seatTone = {
  free: 'bg-lavender hover:bg-white cursor-pointer',
  selected: 'bg-white border-white shadow-glow -translate-y-px cursor-pointer',
  held: 'bg-transparent border-[1.5px] border-dashed border-line-strong cursor-not-allowed',
  sold: 'border-line cursor-not-allowed bg-[repeating-linear-gradient(45deg,var(--color-surface-top)_0_3px,var(--color-surface-high)_3px_6px)]',
} as const;
