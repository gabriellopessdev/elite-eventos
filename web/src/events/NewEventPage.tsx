import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { CinemaStage } from '../cinema';
import { btnMarquee, fieldInput, marqueePill } from '../ui';
import { createEvent, posterUrl, reaisToCents, searchMovies, type MovieHit } from './api';

const deskPanel =
  'mx-auto grid w-full max-w-6xl gap-6 rounded-[1.75rem] border border-[#c4b5ff]/50 bg-[#1c1048]/80 p-5 text-left shadow-[0_0_48px_rgb(105_101_219_/_0.28)] md:gap-8 md:p-8';

const stepLabel = 'm-0 text-[11px] font-bold tracking-[0.16em] text-accent uppercase';

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
    const priceCents = reaisToCents(price);
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
    <CinemaStage contentClassName="items-start justify-start">
      <div className={`${deskPanel} my-2 md:my-4`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-2">
            <p className={marqueePill}>Organizador</p>
            <h1 className="m-0 text-3xl font-extrabold tracking-tight text-white md:text-4xl">
              Nova sessão
            </h1>
            <p className="m-0 max-w-xl text-sm text-white/70">
              Data e preço primeiro. Depois busca o título no TMDb — a grade nasce disponível.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <Link className="text-sm font-bold text-white/80 hover:text-white" to="/events">
              Voltar ao cartaz
            </Link>
          </div>
        </div>

        <form id="publish-session" className="grid gap-4" onSubmit={onPublish}>
          <p className={stepLabel}>1. Sessão</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1.5 text-xs font-semibold text-white/80" htmlFor="startsAt">
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
            <label className="grid gap-1.5 text-xs font-semibold text-white/80" htmlFor="price">
              Preço (R$)
              <input
                id="price"
                type="number"
                min="0.01"
                step="0.01"
                className={`${fieldInput} font-normal`}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </label>
          </div>
          {error ? (
            <p className="m-0 text-sm text-white" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <section className="grid gap-3">
          <p className={stepLabel}>2. Filme</p>
          <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={onSearch}>
            <label className="grid gap-1.5 text-xs font-semibold text-white/80" htmlFor="movie-q">
              Buscar no catálogo TMDb
              <input
                id="movie-q"
                className={`${fieldInput} font-normal`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                required
              />
            </label>
            <button className={btnMarquee} type="submit" disabled={searching || !query.trim()}>
              {searching ? 'Buscando…' : 'Buscar'}
            </button>
          </form>

          {hits?.length === 0 ? (
            <p className="m-0 text-sm text-white/80">Nenhum título encontrado.</p>
          ) : null}

          {hits && hits.length > 0 ? (
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {hits.map((hit) => (
                <li key={hit.tmdbId}>
                  <MoviePick
                    hit={hit}
                    selected={movie?.tmdbId === hit.tmdbId}
                    onSelect={setMovie}
                  />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>
    </CinemaStage>
  );
}

function MoviePick({
  hit,
  selected,
  onSelect,
}: {
  hit: MovieHit;
  selected: boolean;
  onSelect: (hit: MovieHit) => void;
}) {
  const poster = posterUrl(hit.posterPath);
  const year = hit.releaseDate?.slice(0, 4);
  const label = year ? `${hit.title} (${year})` : hit.title;

  return (
    <button
      type="button"
      className={`grid w-full gap-2 overflow-hidden rounded-xl border text-left ${
        selected ? 'border-white ring-2 ring-white' : 'border-white/25 hover:border-white/60'
      }`}
      onClick={() => onSelect(hit)}
    >
      {poster ? (
        <img src={poster} alt="" className="aspect-[2/3] w-full object-cover" />
      ) : (
        <div className="aspect-[2/3] w-full bg-[#1c1048]" aria-hidden="true" />
      )}
      <span className="line-clamp-2 px-2 pb-2 text-xs font-bold text-white">{label}</span>
    </button>
  );
}
