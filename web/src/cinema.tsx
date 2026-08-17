import type { ReactNode } from 'react';

/**
 * Palco do cinema — a foto do teatro atrás do conteúdo. Vale só no cartaz e na
 * sessão (ver isStageRoute); as demais telas usam superfície sólida.
 *
 * O scrim é um gradiente, não um véu preto chapado: escurece embaixo, onde o
 * conteúdo fica, e deixa a plateia aparecer no topo.
 */
export function CinemaStage({
  children,
  contentClassName = 'items-center justify-center',
}: {
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className="relative isolate min-h-dvh overflow-x-hidden bg-canvas">
      <img
        src="/theater-empty.webp"
        alt=""
        fetchPriority="high"
        className="absolute inset-0 size-full object-cover"
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_45%_at_50%_8%,rgb(105_101_219/0.22),transparent_62%),linear-gradient(180deg,rgb(7_4_20/0.55)_0%,rgb(7_4_20/0.82)_55%,rgb(7_4_20/0.94)_100%)]" />
      <div
        className={`relative z-10 flex min-h-dvh px-4 pt-24 pb-28 md:px-6 md:pt-28 md:pb-16 ${contentClassName}`}
      >
        {children}
      </div>
    </section>
  );
}
