export const btn =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-0 bg-accent px-4 py-3.5 font-extrabold text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60';

export const btnGhost =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface px-4 py-2.5 font-semibold text-ink hover:bg-surface-high';

export const fieldInput =
  'min-h-12 rounded-xl border border-line bg-canvas px-3.5 py-3 font-sans text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20';

export const island = 'rounded-2xl bg-surface shadow-island';

export const chromeBar =
  'rounded-full border border-white/10 bg-[#120d18]/75 shadow-[0_8px_40px_rgb(105_101_219/0.22)] backdrop-blur-xl';

export const chromeBtn =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-extrabold text-accent-ink shadow-[0_8px_24px_rgb(105_101_219/0.55)] hover:bg-accent-hover';

export const chromeBtnGhost =
  'inline-flex min-h-10 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white';

export const chip =
  'flex-1 cursor-pointer rounded-xl border px-2 py-2.5 text-center text-sm font-bold';

export const chipActive = `${chip} border-accent bg-accent text-accent-ink`;

export const chipIdle = `${chip} border-line bg-surface text-muted hover:bg-surface-high`;

export const marqueeGlow = {
  background: 'radial-gradient(ellipse 70% 80% at 50% 45%, #7b6ae8 0%, #4a3cb8 42%, #1c1048 100%)',
  boxShadow:
    '0 0 0 1px rgb(196 181 255 / 0.35), 0 0 48px rgb(105 101 219 / 0.7), 0 0 120px rgb(105 101 219 / 0.35)',
} as const;

export const marqueePanel =
  'flex w-full max-w-[52rem] flex-col items-center justify-center gap-8 rounded-[1.75rem] border border-[#c4b5ff] px-6 py-16 text-center md:gap-10 md:px-20 md:py-24';

export const marqueePill =
  'm-0 rounded-full border border-white/85 px-4 py-1.5 text-[11px] font-bold tracking-[0.22em] text-white uppercase';

export const btnMarquee =
  'inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-8 py-3 text-base font-extrabold text-accent hover:bg-surface-high';
