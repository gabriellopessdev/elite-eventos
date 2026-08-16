import { Link } from 'react-router-dom';

export function Home() {
  return (
    <section className="relative isolate min-h-[calc(100dvh-7.5rem)] overflow-hidden bg-[#070414] md:min-h-[calc(100dvh-5.25rem)]">
      <img src="/theater-empty.png" alt="" className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-black/35" />

      <div className="relative z-10 flex min-h-[calc(100dvh-7.5rem)] items-center justify-center px-4 py-10 md:min-h-[calc(100dvh-5.25rem)] md:py-16">
        <div
          className="flex w-full max-w-[52rem] flex-col items-center justify-center gap-8 rounded-[1.75rem] border border-[#c4b5ff] px-6 py-16 text-center md:gap-10 md:px-20 md:py-24"
          style={{
            background:
              'radial-gradient(ellipse 70% 80% at 50% 45%, #7b6ae8 0%, #4a3cb8 42%, #1c1048 100%)',
            boxShadow:
              '0 0 0 1px rgb(196 181 255 / 0.35), 0 0 48px rgb(105 101 219 / 0.7), 0 0 120px rgb(105 101 219 / 0.35)',
          }}
        >
          <p className="m-0 rounded-full border border-white/85 px-4 py-1.5 text-[11px] font-bold tracking-[0.22em] text-white uppercase">
            Em cartaz
          </p>
          <h1 className="m-0 max-w-[14ch] text-[clamp(2.1rem,6vw,3.6rem)] font-extrabold tracking-tight text-white">
            O cartaz abre em breve
          </h1>
          <Link
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-8 py-3 text-base font-extrabold text-accent hover:bg-surface-high"
            to="/login"
          >
            Entrar
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
