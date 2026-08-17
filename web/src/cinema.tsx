import type { ReactNode } from 'react';

export function CinemaStage({
  children,
  contentClassName = 'items-center justify-center',
}: {
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className="relative isolate min-h-dvh overflow-x-hidden bg-[#070414]">
      <img src="/theater-empty.png" alt="" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-black/35" />
      <div
        className={`relative z-10 flex min-h-dvh px-4 pt-24 pb-28 md:px-6 md:pt-28 md:pb-16 ${contentClassName}`}
      >
        {children}
      </div>
    </section>
  );
}
