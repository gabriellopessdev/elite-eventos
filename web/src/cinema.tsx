import type { ReactNode } from 'react';

export function CinemaStage({ children }: { children: ReactNode }) {
  return (
    <section className="relative isolate min-h-dvh overflow-hidden bg-[#070414]">
      <img src="/theater-empty.png" alt="" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-black/35" />
      <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 pt-24 pb-28 md:pt-28 md:pb-16">
        {children}
      </div>
    </section>
  );
}
