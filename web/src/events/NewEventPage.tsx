import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import {
  btn,
  btnGhost,
  btnQuiet,
  fieldInput,
  fieldLabel,
  hint,
  hintError,
  surfaceHigh,
} from '../ui';
import { CheckIcon, ChevronIcon, SearchIcon } from '../icons';
import {
  createEvent,
  formatPrice,
  posterUrl,
  reaisToCents,
  searchMovies,
  type MovieHit,
} from './api';

const stepLabel = 'm-0 text-[11px] font-bold tracking-[0.14em] text-lavender uppercase';

function ChecklistItem({ done, children }: { done: boolean; children: string }) {
  return (
    <li
      className={`flex items-center gap-2.5 text-[13px] font-semibold ${
        done ? 'text-success' : 'text-faint'
      }`}
    >
      {done ? (
        <CheckIcon size={17} strokeWidth={2.25} />
      ) : (
        <span aria-hidden="true" className="size-4 rounded-full border border-current" />
      )}
      {children}
    </li>
  );
}

export function NewEventPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MovieHit[] | null>(null);
  const [movie, setMovie] = useState<MovieHit | null>(null);
  const [startsAt, setStartsAt] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [publishing, setPublishing] = useState(false);

  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (session.user.role !== 'ORGANIZER') {
    return <Navigate to="/events" replace />;
  }

  const accessToken = session.accessToken;
  const priceCents = reaisToCents(price);
  const whenIsValid = startsAt !== '' && !Number.isNaN(new Date(startsAt).getTime());

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setHits(null);
    setMovie(null);
    setSearching(true);
    try {
      setHits(await searchMovies(query, accessToken));
    } catch {
      setError('Não foi possível buscar no TMDb');
    } finally {
      setSearching(false);
    }
  }

  async function onPublish(event: FormEvent) {
    event.preventDefault();
    if (publishing) return;
    if (!movie) {
      setError('Escolha um filme no catálogo');
      return;
    }
    if (priceCents === null) {
      setError('Preço deve ser maior que zero');
      return;
    }
    const when = new Date(startsAt);
    if (Number.isNaN(when.getTime())) {
      setError('Data e horário inválidos');
      return;
    }

    setError(null);
    setPublishing(true);
    try {
      await createEvent(
        {
          tmdbId: movie.tmdbId,
          title: movie.title,
          posterPath: movie.posterPath,
          startsAt: when.toISOString(),
          priceCents,
        },
        accessToken,
      );
      navigate('/events');
    } catch {
      setError('Não foi possível publicar a sessão');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6">
      <header className="grid gap-2">
        <Link className={`${btnQuiet} justify-self-start px-0`} to="/events">
          <ChevronIcon size={18} className="rotate-180" />
          Voltar ao cartaz
        </Link>
        <h1 className="m-0 text-3xl font-extrabold tracking-tight md:text-4xl">Nova sessão</h1>
      </header>

      <div className="grid gap-8 md:grid-cols-[1fr_22rem] md:items-start md:gap-10">
        <div className="grid gap-7">
          <section className="grid gap-3">
            <p className={stepLabel}>1 · Quando e quanto</p>
            <form id="publish-session" className="grid gap-3 md:grid-cols-2" onSubmit={onPublish}>
              <label className={`grid gap-1.5 ${fieldLabel}`} htmlFor="startsAt">
                Data e horário
                <input
                  id="startsAt"
                  type="datetime-local"
                  className={`${fieldInput} font-normal`}
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  required
                />
              </label>
              <label className={`grid gap-1.5 ${fieldLabel}`} htmlFor="price">
                Preço (R$)
                <input
                  id="price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  className={`${fieldInput} font-normal ${price && priceCents === null ? 'border-danger' : ''}`}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
                {price && priceCents === null ? (
                  <span className={hintError}>Preço deve ser maior que zero</span>
                ) : null}
              </label>
            </form>
            <p className={`m-0 ${hint}`}>
              A grade de assentos nasce toda disponível quando a sessão é publicada.
            </p>
          </section>

          <section className="grid gap-3">
            <p className={stepLabel}>2 · Qual filme</p>
            <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={onSearch}>
              <label className={`grid gap-1.5 ${fieldLabel}`} htmlFor="movie-q">
                Buscar no catálogo TMDb
                <input
                  id="movie-q"
                  className={`${fieldInput} font-normal`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  required
                />
              </label>
              <button
                className={`${btnGhost} min-h-12`}
                type="submit"
                disabled={searching || !query.trim()}
              >
                <SearchIcon size={20} />
                {searching ? 'Buscando…' : 'Buscar'}
              </button>
            </form>

            {hits?.length === 0 ? <p className={`m-0 ${hint}`}>Nenhum título encontrado.</p> : null}

            {hits && hits.length > 0 ? (
              <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-4">
                {hits.map((hit) => (
                  <li key={hit.tmdbId}>
                    <MoviePick
                      hit={hit}
                      selected={movie?.tmdbId === hit.tmdbId}
                      dimmed={movie !== null && movie.tmdbId !== hit.tmdbId}
                      onSelect={setMovie}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {error ? (
            <p className={`m-0 ${hintError}`} role="alert">
              {error}
            </p>
          ) : null}
        </div>

        {/* Preview: o organizador vê o que está publicando antes de publicar. */}
        <aside className={`${surfaceHigh} grid gap-4 p-5 md:sticky md:top-28`}>
          <h2 className="m-0 text-[11px] font-bold tracking-[0.14em] text-muted uppercase">
            Como vai aparecer no cartaz
          </h2>

          <div className="grid gap-2.5">
            <PosterPreview movie={movie} />
            <div className="grid gap-0.5">
              <span className="font-bold">{movie?.title ?? 'Escolha um filme'}</span>
              <span className="text-[13px] text-faint">
                {whenIsValid
                  ? new Date(startsAt).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })
                  : 'Sem data'}
              </span>
              <span className="font-bold">
                {priceCents === null ? 'Sem preço' : formatPrice(priceCents)}
              </span>
            </div>
          </div>

          <ul className="m-0 grid list-none gap-2 border-t border-line p-0 pt-4">
            <ChecklistItem done={whenIsValid}>Data e horário</ChecklistItem>
            <ChecklistItem done={priceCents !== null}>Preço definido</ChecklistItem>
            <ChecklistItem done={movie !== null}>Filme escolhido</ChecklistItem>
          </ul>

          <button
            className={`${btn} min-h-13 w-full text-base`}
            form="publish-session"
            type="submit"
            disabled={publishing}
          >
            {publishing ? 'Publicando…' : 'Publicar'}
          </button>
          <p className={`m-0 ${hint}`}>
            Depois de publicada, a sessão aparece no cartaz na hora e pode ser encerrada — ingressos
            já emitidos continuam valendo.
          </p>
        </aside>
      </div>
    </div>
  );
}

function PosterPreview({ movie }: { movie: MovieHit | null }) {
  const poster = movie ? posterUrl(movie.posterPath) : null;

  if (poster) {
    return (
      <img
        src={poster}
        alt=""
        className="aspect-2/3 w-40 rounded-xl border border-line object-cover"
      />
    );
  }

  return (
    <div
      className="aspect-2/3 w-40 rounded-xl border border-dashed border-line-strong bg-surface"
      aria-hidden="true"
    />
  );
}

function MoviePick({
  hit,
  selected,
  dimmed,
  onSelect,
}: {
  hit: MovieHit;
  selected: boolean;
  dimmed: boolean;
  onSelect: (hit: MovieHit) => void;
}) {
  const poster = posterUrl(hit.posterPath);
  const year = hit.releaseDate?.slice(0, 4);
  const label = year ? `${hit.title} (${year})` : hit.title;

  /* Com um filme escolhido, os outros recuam — desfocados e apagados — para o
     escolhido ficar sozinho em foco. Continuam clicáveis para trocar. */
  return (
    <button
      type="button"
      className={`grid w-full cursor-pointer gap-2 rounded-xl border bg-transparent p-0 pb-2 text-left transition duration-200 ${
        selected ? 'border-accent shadow-glow' : 'border-line hover:border-line-strong'
      } ${dimmed ? 'opacity-45 blur-[2px] hover:opacity-100 hover:blur-none' : ''}`}
      onClick={() => onSelect(hit)}
    >
      <span className="relative block">
        {poster ? (
          <img src={poster} alt="" className="aspect-2/3 w-full rounded-t-xl object-cover" />
        ) : (
          <span className="block aspect-2/3 w-full rounded-t-xl bg-surface-high" />
        )}
        {selected ? (
          <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-accent text-accent-ink">
            <CheckIcon size={16} strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className={`px-2 text-[13px] font-bold ${selected ? 'text-ink' : 'text-muted'}`}>
        {label}
      </span>
    </button>
  );
}
