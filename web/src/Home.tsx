import { Link } from 'react-router-dom';
import { btn, island } from './ui';

const SEAT_ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

/** Decorative preview — not a real hold. Slice 3 owns the lock. */
type SeatKind = 'free' | 'held' | 'sold' | 'mine';

function seatKind(row: number, col: number): SeatKind {
  if (row === 3 && (col === 4 || col === 5)) return 'mine';
  if (row === 2 && col === 7) return 'held';
  if ((row + col) % 9 === 0 || (row === 5 && col > 7)) return 'sold';
  return 'free';
}

const SEAT_CLASS: Record<SeatKind, string> = {
  free: 'border-line bg-surface-high',
  held: 'border-accent bg-surface-high ring-2 ring-accent/30',
  sold: 'border-transparent bg-line',
  mine: 'border-accent bg-accent',
};

function SeatMapPreview() {
  return (
    <div className={`${island} grid gap-4 p-5 md:p-6`} aria-hidden="true">
      <div className="mx-auto h-3 w-[88%] rounded-b-[60px] bg-gradient-to-b from-accent to-accent/20 shadow-[0_8px_24px_rgb(105_101_219_/_0.28)]" />
      <p className="m-0 text-center text-[10px] font-bold tracking-[0.28em] text-muted uppercase">
        Tela
      </p>
      <div className="grid justify-center gap-1.5">
        {SEAT_ROWS.map((letter, row) => (
          <div key={letter} className="flex items-center gap-1.5">
            <span className="w-3 text-[10px] font-bold text-muted">{letter}</span>
            <div className="flex gap-1">
              {Array.from({ length: 10 }, (_, col) => (
                <span
                  key={col}
                  className={`size-4 rounded-md border md:size-[18px] ${SEAT_CLASS[seatKind(row, col)]}`}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-4 text-[11px] font-semibold text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-line bg-surface-high" /> Livre
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-accent bg-accent" /> Seu hold
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-line" /> Vendido
        </span>
      </div>
    </div>
  );
}

const STEPS = [
  {
    kicker: '01',
    title: 'Hold 10 min',
    body: 'O assento trava no servidor. O timer da tela só espelha o TTL.',
  },
  {
    kicker: '02',
    title: 'Paga e recebe QR',
    body: 'Pagamento simulado. Ingresso com HMAC — não dá para forjar na fila.',
  },
  {
    kicker: '03',
    title: 'Portaria valida',
    body: 'Câmera ou código. Válido, usado, inválido ou evento errado.',
  },
] as const;

export function Home() {
  return (
    <div className="grid gap-10 py-2 md:gap-14 md:py-4">
      <section className="grid items-center gap-8 lg:grid-cols-[1fr_minmax(280px,22rem)] lg:gap-12">
        <div className="grid max-w-xl gap-5">
          <p className="m-0 w-fit rounded-full bg-surface-high px-3 py-1 text-[11px] font-bold tracking-widest text-accent uppercase">
            Lugar marcado
          </p>
          <h1 className="m-0 text-[clamp(2.15rem,6vw,3.35rem)] font-extrabold tracking-tight text-brand">
            Ingressos com lugar marcado
          </h1>
          <p className="m-0 max-w-[42ch] text-base leading-relaxed text-muted md:text-lg">
            Hold de 10 minutos, pagamento simulado e QR na portaria — o mesmo fluxo no celular e no
            desktop.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link className={`${btn} w-fit px-5`} to="/events">
              Ver eventos
            </Link>
            <p className="m-0 self-center text-sm text-muted">
              Catálogo TMDb entra na próxima fatia.
            </p>
          </div>
        </div>
        <SeatMapPreview />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step) => (
          <article key={step.kicker} className={`${island} grid gap-2 p-5`}>
            <p className="m-0 text-xs font-bold tracking-widest text-accent">{step.kicker}</p>
            <h2 className="m-0 text-lg font-extrabold text-brand">{step.title}</h2>
            <p className="m-0 text-sm leading-relaxed text-muted">{step.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
