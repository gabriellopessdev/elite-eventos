import { island } from '../ui';
import { SessionCard } from './SessionCard';
import { useEventCatalog } from './useEventCatalog';

export function EventsPage() {
  const { events, error, loading } = useEventCatalog();

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="m-0 w-fit rounded-full bg-surface-high px-3 py-1 text-[11px] font-bold tracking-widest text-accent uppercase">
          Cartaz
        </p>
        <h1 className="m-0 text-2xl font-extrabold tracking-tight text-brand md:text-3xl">
          Sessões
        </h1>
        <p className="m-0 text-sm text-muted md:text-base">Escolha a sessão e o horário.</p>
      </header>

      {error ? (
        <p className="m-0 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <p className="m-0 text-sm text-muted">Carregando sessões…</p> : null}

      {events?.length === 0 ? (
        <section className={`${island} grid max-w-lg gap-2 p-6`}>
          <p className="m-0 text-muted">Nenhuma sessão publicada.</p>
        </section>
      ) : null}

      {events && events.length > 0 ? (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id}>
              <SessionCard event={event} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
